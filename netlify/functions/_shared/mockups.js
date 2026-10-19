const crypto = require('crypto');
const { json, getSupabase } = require('./supabase');
const ORIGINALS = 'gmf-originals', PRIVATE = 'gmf-previews-private', PUBLIC = 'gmf-previews';
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const VERSION = 'gmf-faithful-preview-v1';
function error(status, message) { return Object.assign(new Error(message), { status }); }
function fail(err) {
  if (!err.status || err.status >= 500 && err.status !== 503) console.error('Mockup operation failed:', err.code || err.name || 'error');
  return json(err.status || 500, { error: err.status && (err.status < 500 || err.status === 503) ? err.message : 'The image service could not complete this request. Please try again.' });
}
function must(result) { if (result.error) throw result.error; return result.data; }
function isDuplicate(err) { return !!err && (String(err.statusCode) === '409' || err.error === 'Duplicate' || /already exists|duplicate/i.test(err.message || '')); }
function isMissing(err) { return !!err && (String(err.statusCode) === '404' || /not found|does not exist/i.test(err.message || '')); }
function dbFor(deps) { const db = deps.db || getSupabase(); if (!db) throw error(503, 'Original artwork storage is not configured yet.'); return db; }
function parseBody(event) {
  if (Buffer.byteLength(event.body || '') > 65536) throw error(413, 'Send file details only. Upload the file directly to the signed storage URL.');
  try { return JSON.parse(event.body || '{}'); } catch (_) { throw error(400, 'Invalid JSON request.'); }
}
function text(value, name, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw error(400, `${name} is required.`);
  return value.trim();
}
function uploadDetails(body) {
  const filename = text(body.filename, 'Filename', 240).replace(/[\\/\x00-\x1f]/g, '-');
  const ext = filename.split('.').pop().toLowerCase();
  const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', psd: 'image/vnd.adobe.photoshop' };
  if (!types[ext]) throw error(400, 'Upload PNG, JPEG, WebP, TIFF, or PSD artwork.');
  if (!Number.isSafeInteger(body.size) || body.size < 1 || body.size > MAX_SOURCE_BYTES) throw error(413, 'Original files must be no larger than 512 MiB.');
  if (!/^[0-9a-f]{64}$/i.test(body.sha256 || '')) throw error(400, 'A SHA-256 checksum is required.');
  return { filename, content_type: types[ext], size_bytes: body.size, sha256: body.sha256.toLowerCase() };
}
function assetView(asset) {
  return { id: asset.id, assetId: asset.id, filename: asset.filename, sha256: asset.sha256, bytes: asset.size_bytes, contentType: asset.content_type, status: asset.status, originalUrl: `/api/source-upload?id=${encodeURIComponent(asset.id)}&download=1`, error: asset.error || undefined };
}
async function signedSource(db, asset, seconds = 300) { return must(await db.storage.from(ORIGINALS).createSignedUrl(asset.storage_path, seconds)).signedUrl; }
async function verifyStream(response, expectedHash, expectedSize) {
  if (!response.ok || !response.body) throw error(409, 'The original has not finished uploading. Please retry completion.');
  const hash = crypto.createHash('sha256'); let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > expectedSize || size > MAX_SOURCE_BYTES) throw error(409, 'Uploaded file size does not match. Upload the original again.');
    hash.update(chunk);
  }
  if (size !== expectedSize || hash.digest('hex') !== expectedHash) throw error(409, 'Checksum verification failed. The uploaded original does not match.');
  return true;
}
function settingsFor(body, env = process.env) {
  const productId = text(body.productId, 'Product ID');
  const sourceAssetId = text(body.sourceAssetId, 'Original asset ID');
  if (!['tee', 'shorts', 'hat', 'hoodie', 'crewneck'].includes(body.garment)) throw error(400, 'Choose a supported garment.');
  if (!Array.isArray(body.colors) || !body.colors.length || body.colors.length > 8) throw error(400, 'Choose between 1 and 8 garment colors.');
  const seen = new Set();
  const colors = body.colors.map(c => {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(c.code || '') || seen.has(c.code)) throw error(400, 'Color codes must be unique letters, numbers, and hyphens.');
    if (!/^#[0-9a-f]{6}$/i.test(c.hex || '')) throw error(400, 'Each color needs a six-digit hex color.');
    seen.add(c.code); return { code: c.code, label: text(c.label, 'Color name', 60), hex: c.hex.toLowerCase() };
  }).sort((a, b) => a.code.localeCompare(b.code));
  let inversion = null;
  if (body.includeInversion === true) {
    const pair = body.inversion;
    if (!pair || !pair.garmentColor || !pair.printColor) throw error(400, 'Choose the original garment and print colors to swap.');
    for (const color of [pair.garmentColor, pair.printColor]) {
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(color.code || '') || !/^#[0-9a-f]{6}$/i.test(color.hex || '') || !color.label) throw error(400, 'Choose the original garment and print colors to swap.');
    }
    inversion = { garmentColor: { code: pair.garmentColor.code, label: text(pair.garmentColor.label, 'Garment color', 60), hex: pair.garmentColor.hex.toLowerCase() }, printColor: { code: pair.printColor.code, label: text(pair.printColor.label, 'Print color', 60), hex: pair.printColor.hex.toLowerCase() } };
  }
  return { productId, sourceAssetId, garment: body.garment, colors, inversion, includeInversion: body.includeInversion === true, model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst', generatorVersion: VERSION };
}
function requestHash(settings, sourceHash) { return crypto.createHash('sha256').update(JSON.stringify({ settings, sourceHash })).digest('hex'); }
function previewList(settings) {
  const previews = settings.colors.map(c => ({ id: crypto.randomUUID(), colorCode: c.code, color: c.label, colorHex: c.hex, artworkColorway: '', status: 'queued', inversion: false }));
  if (settings.includeInversion) {
    const { garmentColor, printColor } = settings.inversion;
    previews.push({ id: crypto.randomUUID(), colorCode: printColor.code, color: printColor.label, colorHex: printColor.hex, artworkColorway: `${garmentColor.label} print (swapped)`, printHex: garmentColor.hex, status: 'queued', inversion: true });
  }
  return previews;
}
function assertGenerationConfig(env = process.env) {
  if (!env.OPENAI_API_KEY) throw error(503, 'Image generation needs the dedicated OpenAI API key before it can run. Your originals remain saved.');
  if (!env.GMF_MOCKUP_WORKER_SECRET || env.GMF_MOCKUP_WORKER_SECRET.length < 32) throw error(503, 'The private image worker is not configured yet.');
}
function signedDispatch(body, secret, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return { 'Content-Type': 'application/json', 'x-gmf-worker-timestamp': timestamp, 'x-gmf-worker-signature': crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex') };
}
function verifyDispatch(event, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw error(503, 'The private image worker is not configured yet.');
  const headers = event.headers || {}, stamp = headers['x-gmf-worker-timestamp'], signature = headers['x-gmf-worker-signature'];
  if (!/^\d+$/.test(stamp || '') || Math.abs(Math.floor(now / 1000) - Number(stamp)) > 300 || !/^[0-9a-f]{64}$/.test(signature || '')) throw error(401, 'Invalid worker authorization.');
  const expected = signedDispatch(event.body || '', secret, Number(stamp) * 1000)['x-gmf-worker-signature'];
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) throw error(401, 'Invalid worker authorization.');
}
async function dispatch(job, deps = {}) {
  const env = deps.env || process.env;
  const body = JSON.stringify({ jobId: job.id, dispatchToken: job.dispatch_token });
  const site = new URL(env.DEPLOY_URL || env.SITE_URL || env.URL || 'https://gmfproductions904.com');
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') throw error(503, 'A secure site URL is required for the image worker.');
  const res = await (deps.fetch || fetch)(new URL('/.netlify/functions/mockup-worker-background', site), { method: 'POST', headers: signedDispatch(body, env.GMF_MOCKUP_WORKER_SECRET), body, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw error(503, 'The preview job is saved but its worker could not start. Retry the saved job.');
}
async function viewJob(db, job) {
  const previews = [];
  for (const p of job.previews) {
    let imageUrl = p.publicUrl;
    if (!imageUrl && p.storagePath && ['ready', 'approved'].includes(p.status)) imageUrl = must(await db.storage.from(PRIVATE).createSignedUrl(p.storagePath, 900)).signedUrl;
    previews.push({ id: p.id, colorCode: p.colorCode, color: p.color, colorHex: p.colorHex, artworkColorway: p.artworkColorway, status: p.status, imageUrl: imageUrl || null, image: imageUrl || null, error: p.error || null, previewApproved: p.status === 'approved', generatedPreview: true });
  }
  return { jobId: job.id, productId: job.product_id, sourceAssetId: job.source_asset_id, sourceSha256: job.source_sha256, status: job.status, previews, error: job.error || null };
}
function promptFor(settings, preview) {
  return `Create a faithful ecommerce color mockup of a ${settings.garment}, using only the supplied immutable original artwork or garment image as the visual source. Preserve every existing letter, number, word, logo, illustration, distress mark, composition, and relative placement exactly. Do not invent, replace, simplify, misspell, or add any text or logos. If the source is flat artwork, place the complete artwork visibly on the front of a plain ${settings.garment}; do not invent a back design. If it is already a garment photo, preserve that garment and camera view. ${preview.inversion ? `Swap only the explicitly chosen roles: original garment ${settings.inversion.garmentColor.label} (${settings.inversion.garmentColor.hex}) and original print ${settings.inversion.printColor.label} (${settings.inversion.printColor.hex}). The resulting garment must be ${preview.color} (${preview.colorHex}) and that print must be ${settings.inversion.garmentColor.label} (${preview.printHex}). Preserve all other artwork colors and details.` : `Change only the garment fabric to ${preview.color} (${preview.colorHex}); keep the print's original colors.`} Clean neutral studio background; one entire garment, no person, no watermark, no extra labels. This is a preview requiring human approval.`;
}
async function generateImage(asset, settings, preview, db, deps = {}) {
  const env = deps.env || process.env; assertGenerationConfig(env);
  if (asset.content_type === 'image/vnd.adobe.photoshop') throw error(400, 'The PSD original is preserved. Upload a PNG or TIFF raster working copy to generate previews.');
  const sharp = deps.sharp || require('sharp');
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Readable, Transform } = require('stream');
  const { pipeline } = require('stream/promises');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gmf-original-'));
  const file = path.join(directory, 'original');
  let input;
  try {
    const response = await (deps.fetch || fetch)(await signedSource(db, asset, 900), { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw error(409, 'The original could not be read.');
    let count = 0; const hash = crypto.createHash('sha256');
    const verifier = new Transform({ transform(chunk, encoding, callback) {
      count += chunk.length;
      if (count > asset.size_bytes || count > MAX_SOURCE_BYTES) return callback(error(409, 'Original size mismatch.'));
      hash.update(chunk); callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), verifier, fs.createWriteStream(file));
    if (count !== asset.size_bytes || hash.digest('hex') !== asset.sha256) throw error(409, 'The original checksum changed. Generation was stopped.');
    // Decode from disk to avoid buffering a 512 MiB original twice in Lambda memory.
    input = await sharp(file, { limitInputPixels: 150000000, page: 0 }).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  const form = new FormData();
  form.append('model', settings.model); form.append('image', new Blob([input], { type: 'image/png' }), 'original-working-copy.png');
  form.append('prompt', promptFor(settings, preview)); form.append('n', '1'); form.append('size', '1024x1024'); form.append('quality', 'high'); form.append('output_format', 'png');
  const response = await (deps.fetch || fetch)('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw error(502, `Image provider returned HTTP ${response.status}.`);
  const result = await response.json(), encoded = result.data && result.data[0] && result.data[0].b64_json;
  if (!encoded) throw error(502, 'The image provider returned no image.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw error(502, 'The generated preview has an unsupported size.');
  return bytes;
}
module.exports = { ORIGINALS, PRIVATE, PUBLIC, MAX_SOURCE_BYTES, VERSION, error, fail, must, isDuplicate, isMissing, dbFor, parseBody, text, uploadDetails, assetView, signedSource, verifyStream, settingsFor, requestHash, previewList, assertGenerationConfig, signedDispatch, verifyDispatch, dispatch, viewJob, promptFor, generateImage };
