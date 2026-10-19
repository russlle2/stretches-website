const crypto = require('crypto');
const { json } = require('./_shared/supabase');
const { requireAdmin } = require('./_shared/admin');
const M = require('./_shared/mockups');
function createHandler(deps = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    try {
      const user = await (deps.auth || requireAdmin)(event), db = M.dbFor(deps);
      if (event.httpMethod === 'GET') {
        const id = M.text(event.queryStringParameters?.id, 'Asset ID');
        const asset = M.must(await db.from('gmf_assets').select('*').eq('id', id).maybeSingle());
        if (!asset) throw M.error(404, 'Original artwork was not found in private storage. Upload the original file first.');
        if (event.queryStringParameters?.download === '1') {
          if (asset.status !== 'ready') throw M.error(409, 'This original has not been verified yet.');
          return json(200, { url: await M.signedSource(db, asset), expiresIn: 300 });
        }
        return json(200, M.assetView(asset));
      }
      if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
      const body = M.parseBody(event);
      if (body.action === 'complete') {
        const asset = M.must(await db.from('gmf_assets').select('*').eq('id', M.text(body.assetId, 'Asset ID')).maybeSingle());
        if (!asset) throw M.error(404, 'Upload request not found.');
        if (body.sha256?.toLowerCase() !== asset.sha256) throw M.error(409, 'The completion checksum does not match the original upload request.');
        if (asset.status === 'ready') return json(200, M.assetView(asset));
        const url = await M.signedSource(db, asset);
        const response = await (deps.fetch || fetch)(url, { signal: AbortSignal.timeout(45000) });
        try { await M.verifyStream(response, asset.sha256, asset.size_bytes); }
        catch (err) { await db.from('gmf_assets').update({ status: 'failed', error: 'Original checksum verification failed.' }).eq('id', asset.id).eq('storage_path', asset.storage_path); throw err; }
        const verified = M.must(await db.from('gmf_assets').update({ status: 'ready', verified_at: new Date().toISOString(), error: null }).eq('id', asset.id).eq('storage_path', asset.storage_path).select('*').maybeSingle());
        if (!verified) throw M.error(409, 'This upload changed during verification. Complete the latest upload again.');
        return json(200, M.assetView(verified));
      }
      const details = M.uploadDetails(body);
      let asset = M.must(await db.from('gmf_assets').select('*').eq('sha256', details.sha256).maybeSingle());
      if (asset?.status === 'ready') return json(200, { ...M.assetView(asset), asset: M.assetView(asset), alreadyUploaded: true });
      if (asset && (asset.size_bytes !== details.size_bytes || asset.content_type !== details.content_type)) throw M.error(409, 'This checksum already belongs to a different original file description.');
      if (asset?.status === 'failed') {
        asset = M.must(await db.from('gmf_assets').update({ status: 'pending', error: null, upload_history: [...(asset.upload_history || []), asset.storage_path], storage_path: `originals/${details.sha256}/${crypto.randomUUID()}-${details.filename.replace(/[^a-zA-Z0-9._-]/g, '-')}` }).eq('id', asset.id).eq('status', 'failed').select('*').single());
      }
      if (!asset) {
        const id = `source-${details.sha256}`;
        const row = { ...details, id, created_by: user.id || user.sub || user.email, product_id: body.productId || null, bucket: M.ORIGINALS, storage_path: `originals/${details.sha256}/${crypto.randomUUID()}-${details.filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`, status: 'pending' };
        const inserted = await db.from('gmf_assets').insert(row).select('*').single();
        if (inserted.error?.code === '23505') asset = M.must(await db.from('gmf_assets').select('*').eq('sha256', details.sha256).single());
        else asset = M.must(inserted);
      }
      const signed = M.must(await db.storage.from(M.ORIGINALS).createSignedUploadUrl(asset.storage_path, { upsert: false }));
      return json(200, { ...M.assetView(asset), uploadUrl: signed.signedUrl, method: 'PUT', headers: { 'Content-Type': asset.content_type, 'x-upsert': 'false' }, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
    } catch (err) { return M.fail(err); }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
