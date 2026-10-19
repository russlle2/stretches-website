const crypto = require('crypto');
const { json } = require('./_shared/supabase');
const M = require('./_shared/mockups');
function terminalStatus(previews) {
  if (previews.some(p => p.status === 'queued')) return 'queued';
  const failed = previews.some(p => p.status === 'failed');
  const ready = previews.some(p => ['ready', 'approved'].includes(p.status));
  return failed ? ready ? 'partial' : 'failed' : 'complete';
}
function createHandler(deps = {}) {
  return async event => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    let db, job, lease;
    try {
      const env = deps.env || process.env;
      M.verifyDispatch(event, env.GMF_MOCKUP_WORKER_SECRET);
      M.assertGenerationConfig(env);
      db = M.dbFor(deps);
      const body = M.parseBody(event);
      M.text(body.jobId, 'Job ID'); M.text(body.dispatchToken, 'Dispatch token');
      lease = crypto.randomUUID();
      job = M.must(await db.from('gmf_mockup_jobs').update({ status: 'running', lease_token: lease, updated_at: new Date().toISOString() }).eq('id', body.jobId).eq('dispatch_token', body.dispatchToken).eq('status', 'queued').select('*').maybeSingle());
      if (!job) return json(200, { ignored: true });
      const previews = job.previews.map(p => ({ ...p }));
      const preview = previews.find(p => p.status === 'queued');
      if (preview) {
        preview.status = 'generating';
        M.must(await db.from('gmf_mockup_jobs').update({ previews }).eq('id', job.id).eq('lease_token', lease));
        try {
          const asset = M.must(await db.from('gmf_assets').select('*').eq('id', job.source_asset_id).single());
          if (asset.status !== 'ready' || asset.sha256 !== job.source_sha256) throw M.error(409, 'The original version no longer matches this job.');
          const storagePath = `drafts/${job.id}/${preview.id}.png`;
          // Recover an image saved just before a previous worker interruption without charging again.
          const prior = await db.storage.from(M.PRIVATE).download(storagePath);
          if (prior.error) {
            if (!M.isMissing(prior.error)) throw prior.error;
            const bytes = await (deps.generateImage || M.generateImage)(asset, job.settings, preview, db, deps);
            const uploaded = await db.storage.from(M.PRIVATE).upload(storagePath, bytes, { contentType: 'image/png', upsert: false, cacheControl: '3600' });
            if (uploaded.error && !M.isDuplicate(uploaded.error)) throw uploaded.error;
          }
          preview.storagePath = storagePath; preview.status = 'ready'; preview.error = null;
        } catch (err) {
          preview.status = 'failed';
          preview.error = err.status && err.status < 500 ? err.message : 'This preview could not be generated. Retry it after checking the image service.';
          console.error('Preview failed:', job.id, preview.id, err.code || err.status || err.name);
        }
      }
      const status = terminalStatus(previews);
      const saved = M.must(await db.from('gmf_mockup_jobs').update({ previews, status, lease_token: null, dispatch_token: crypto.randomUUID(), updated_at: new Date().toISOString(), error: status === 'failed' || status === 'partial' ? 'Some previews failed. Completed previews are saved; retry only the failed ones.' : null }).eq('id', job.id).eq('lease_token', lease).select('*').maybeSingle());
      if (saved && saved.status === 'queued') {
        try { await M.dispatch(saved, deps); }
        catch (_) { await db.from('gmf_mockup_jobs').update({ status: 'partial', error: 'The remaining previews are saved in the queue. Retry this job to continue.', updated_at: new Date().toISOString() }).eq('id', job.id).eq('dispatch_token', saved.dispatch_token).eq('status', 'queued'); }
      }
      return json(200, { jobId: job.id, status: saved?.status || 'changed' });
    } catch (err) {
      // Retain persisted preview progress and release this worker's lease only.
      if (db && job && lease) await db.from('gmf_mockup_jobs').update({ status: 'partial', lease_token: null, error: 'The worker stopped. Retry the saved job.', updated_at: new Date().toISOString() }).eq('id', job.id).eq('lease_token', lease);
      return M.fail(err);
    }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
exports.terminalStatus = terminalStatus;
