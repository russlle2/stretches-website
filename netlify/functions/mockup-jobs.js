const crypto = require('crypto');
const { json } = require('./_shared/supabase');
const { requireAdmin } = require('./_shared/admin');
const M = require('./_shared/mockups');
function createHandler(deps = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    try {
      const user = await (deps.auth || requireAdmin)(event), db = M.dbFor(deps), env = deps.env || process.env;
      const getJob = async id => {
        const job = M.must(await db.from('gmf_mockup_jobs').select('*').eq('id', M.text(id, 'Job ID')).maybeSingle());
        if (!job) throw M.error(404, 'Preview job not found.');
        return job;
      };
      const start = async job => {
        try { await M.dispatch(job, deps); }
        catch (_) {
          const updated = M.must(await db.from('gmf_mockup_jobs').update({ status: 'partial', error: 'The preview worker could not start. Retry this saved job.', updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'queued').eq('dispatch_token', job.dispatch_token).select('*').maybeSingle());
          if (updated) job = updated;
        }
        return json(202, await M.viewJob(db, job));
      };
      if (event.httpMethod === 'GET') {
        let job = await getJob(event.queryStringParameters?.id);
        if (job.status === 'running' && Date.now() - Date.parse(job.updated_at) > 16 * 60 * 1000) {
          const previews = job.previews.map(p => p.status === 'generating' ? { ...p, status: 'failed', error: 'The image worker stopped. Retry this preview.' } : p);
          const updated = M.must(await db.from('gmf_mockup_jobs').update({ status: 'partial', previews, error: 'The image worker stopped. Retry the saved job.', lease_token: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('lease_token', job.lease_token).select('*').maybeSingle());
          if (updated) job = updated;
        }
        return json(200, await M.viewJob(db, job));
      }
      if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
      const body = M.parseBody(event);
      if (body.action === 'approve') {
        const job = await getJob(body.jobId);
        if (!['complete', 'partial', 'failed'].includes(job.status)) throw M.error(409, 'Wait for generation to finish before approving previews.');
        if (!Array.isArray(body.previewIds) || !body.previewIds.length || body.previewIds.length > 16) throw M.error(400, 'Choose the previews to approve.');
        const selected = new Set(body.previewIds), previews = job.previews.map(p => ({ ...p }));
        if ([...selected].some(id => !previews.some(p => p.id === id && ['ready', 'approved'].includes(p.status)))) throw M.error(400, 'Only completed previews can be approved.');
        for (const preview of previews.filter(p => selected.has(p.id))) {
          if (preview.status === 'approved') continue;
          const bytes = M.must(await db.storage.from(M.PRIVATE).download(preview.storagePath));
          const publicPath = `approved/${job.source_sha256}/${preview.id}.png`;
          const uploaded = await db.storage.from(M.PUBLIC).upload(publicPath, bytes, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
          if (uploaded.error && !M.isDuplicate(uploaded.error)) throw uploaded.error;
          preview.publicUrl = db.storage.from(M.PUBLIC).getPublicUrl(publicPath).data.publicUrl;
          preview.status = 'approved';
        }
        const saved = M.must(await db.from('gmf_mockup_jobs').update({ previews, updated_at: new Date().toISOString() }).eq('id', job.id).eq('updated_at', job.updated_at).select('*').maybeSingle());
        if (!saved) throw M.error(409, 'This job changed while you were approving it. Refresh and retry.');
        const view = await M.viewJob(db, saved), approved = view.previews.filter(p => selected.has(p.id));
        return json(200, { ...view, previews: approved, approved });
      }
      M.assertGenerationConfig(env);
      if (body.action === 'retry') {
        let job = await getJob(body.jobId);
        if (job.status === 'queued') return start(job);
        if (!['partial', 'failed'].includes(job.status)) throw M.error(409, 'This job is already running or has finished successfully.');
        if (job.retry_count >= 3) throw M.error(409, 'This job has reached its retry limit. Check the original image before requesting another preview.');
        const previews = job.previews.map(p => ['failed', 'queued', 'generating'].includes(p.status) ? { ...p, status: 'queued', error: null } : p);
        job = M.must(await db.from('gmf_mockup_jobs').update({ previews, status: 'queued', lease_token: null, dispatch_token: crypto.randomUUID(), retry_count: job.retry_count + 1, error: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('updated_at', job.updated_at).select('*').maybeSingle());
        if (!job) throw M.error(409, 'This job changed. Refresh and retry.');
        return start(job);
      }
      const settings = M.settingsFor(body, env);
      const asset = M.must(await db.from('gmf_assets').select('*').eq('id', settings.sourceAssetId).maybeSingle());
      if (!asset || asset.status !== 'ready') throw M.error(409, 'Upload and verify the original artwork before generating previews.');
      if (asset.content_type === 'image/vnd.adobe.photoshop') throw M.error(400, 'Your PSD original is preserved. Upload a PNG or TIFF raster working copy for generation.');
      const hash = M.requestHash(settings, asset.sha256);
      const existing = M.must(await db.from('gmf_mockup_jobs').select('*').eq('request_hash', hash).maybeSingle());
      if (existing) return existing.status === 'queued' ? start(existing) : json(200, await M.viewJob(db, existing));
      const row = { id: crypto.randomUUID(), owner_id: user.id || user.sub || user.email, product_id: settings.productId, source_asset_id: asset.id, source_sha256: asset.sha256, request_hash: hash, settings, previews: M.previewList(settings), status: 'queued', dispatch_token: crypto.randomUUID(), updated_at: new Date().toISOString() };
      const inserted = await db.from('gmf_mockup_jobs').insert(row).select('*').single();
      if (inserted.error?.code === '23505') throw M.error(409, 'You already have a preview job in progress. Finish or retry that job first.');
      const job = M.must(inserted);
      return start(job);
    } catch (err) { if (err.code === '23505') return M.fail(M.error(409, 'You already have a preview job in progress.')); return M.fail(err); }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
