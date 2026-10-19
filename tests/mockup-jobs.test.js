const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const M = require('../netlify/functions/_shared/mockups');
const uploadHandler = require('../netlify/functions/source-upload').createHandler;
const jobsHandler = require('../netlify/functions/mockup-jobs').createHandler;
const workerHandler = require('../netlify/functions/mockup-worker-background').createHandler;
const env = { OPENAI_API_KEY: 'test-only-no-real-key', GMF_MOCKUP_WORKER_SECRET: 'test-worker-secret-with-at-least-32-characters', SITE_URL: 'https://shop.example.test' };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => value == null ? value : structuredClone(value);
const payload = response => JSON.parse(response.body);
const post = body => ({ httpMethod: 'POST', body: JSON.stringify(body), headers: {} });
function signedEvent(job) {
  const event = post({ jobId: job.id, dispatchToken: job.dispatch_token });
  event.headers = M.signedDispatch(event.body, env.GMF_MOCKUP_WORKER_SECRET);
  return event;
}
function fakeDB(initial = {}) {
  const tables = { gmf_assets: [], gmf_mockup_jobs: [], ...clone(initial) }, objects = new Map(), writes = [], uploads = [];
  let storageFailure = false;
  const db = {
    tables, objects, writes, uploads,
    set storageFailure(value) { storageFailure = value; },
    from(table) {
      let action = 'select', value, filters = [];
      const q = {
        select() { return q; },
        eq(key, val) { filters.push([key, val]); return q; },
        update(input) { action = 'update'; value = clone(input); return q; },
        insert(input) { action = 'insert'; value = clone(input); return q; },
        single() { return run(true); }, maybeSingle() { return run(true); },
        then(resolve, reject) { return run(false).then(resolve, reject); },
      };
      async function run(single) {
        let selected = tables[table].filter(row => filters.every(([key, val]) => row[key] === val));
        if (action === 'insert') {
          if (table === 'gmf_mockup_jobs' && tables[table].some(row => row.request_hash === value.request_hash || row.owner_id === value.owner_id && ['queued', 'running'].includes(row.status))) return { data: null, error: { code: '23505' } };
          value = { retry_count: 0, upload_history: [], created_at: new Date().toISOString(), ...value };
          tables[table].push(value); selected = [value]; writes.push({ table, action, value: clone(value) });
        } else if (action === 'update') {
          for (const row of selected) Object.assign(row, clone(value));
          writes.push({ table, action, count: selected.length, value: clone(value) });
        }
        return { data: clone(single ? selected[0] || null : selected), error: null };
      }
      return q;
    },
    storage: { from(bucket) { return {
      async createSignedUrl(path) { return { data: { signedUrl: `https://private.example.test/${bucket}/${path}?token=fixture` }, error: null }; },
      async createSignedUploadUrl(path, options) { assert.equal(options.upsert, false); return { data: { signedUrl: `https://upload.example.test/${bucket}/${path}?token=fixture` }, error: null }; },
      async download(path) {
        if (storageFailure) return { data: null, error: { statusCode: '503', message: 'storage unavailable' } };
        return objects.has(`${bucket}/${path}`) ? { data: new Blob([objects.get(`${bucket}/${path}`)]), error: null } : { data: null, error: { statusCode: '400', message: 'Object not found' } };
      },
      async upload(path, bytes, options) {
        assert.equal(options.upsert, false); const key = `${bucket}/${path}`;
        if (objects.has(key)) return { data: null, error: { statusCode: '400', error: 'Duplicate', message: 'The resource already exists' } };
        objects.set(key, bytes instanceof Blob ? Buffer.from(await bytes.arrayBuffer()) : bytes); uploads.push({ bucket, path });
        return { data: { path }, error: null };
      },
      getPublicUrl(path) { return { data: { publicUrl: `https://public.example.test/${bucket}/${path}` } }; },
    }; } },
  };
  return db;
}
function request(extra = {}) {
  return { productId: 'tee-one', sourceAssetId: 'usb-source', garment: 'tee', colors: [{ code: 'white', label: 'White', hex: '#ffffff' }, { code: 'black', label: 'Black', hex: '#000000' }], ...extra };
}
function fixture() {
  const original = Buffer.from('immutable-original');
  const asset = { id: 'usb-source', sha256: sha(original), size_bytes: original.length, filename: 'original.png', content_type: 'image/png', storage_path: 'originals/fixture/original.png', status: 'ready' };
  const db = fakeDB({ gmf_assets: [asset] }), calls = [];
  const deps = { db, env, auth: async () => ({ id: 'admin-fixture' }), fetch: async (url, options) => { calls.push({ url: String(url), options }); return new Response('', { status: 202 }); } };
  return { db, deps, calls, original, asset };
}

test('settings canonicalize color order, require explicit inversion roles and bound batch size', () => {
  const settings = M.settingsFor(request()), reordered = M.settingsFor(request({ colors: request().colors.reverse() }));
  assert.equal(M.requestHash(settings, 'source-one'), M.requestHash(reordered, 'source-one'));
  assert.notEqual(M.requestHash(settings, 'source-one'), M.requestHash(settings, 'source-two'));
  assert.throws(() => M.settingsFor(request({ includeInversion: true })), /garment and print colors/);
  assert.throws(() => M.settingsFor(request({ colors: Array(9).fill(request().colors[0]) })), /1 and 8/);
  const swapped = M.settingsFor(request({ includeInversion: true, inversion: { garmentColor: request().colors[1], printColor: request().colors[0] } }));
  const previews = M.previewList(swapped);
  assert.equal(previews.length, 3);
  assert.equal(previews[2].color, 'White');
  assert.equal(previews[2].printHex, '#000000');
  assert.equal(previews[2].artworkColorway, 'Black print (swapped)');
  assert.match(M.promptFor(swapped, previews[2]), /original garment Black.*original print White/);
});

test('admin authentication happens before any database or storage use', async () => {
  let dbReads = 0;
  const deps = { auth: async () => { throw M.error(401, 'Sign in'); }, get db() { dbReads++; throw new Error('must not read database'); } };
  for (const handler of [uploadHandler(deps), jobsHandler(deps)]) assert.equal((await handler(post({}))).statusCode, 401);
  assert.equal(dbReads, 0);
});

test('original uploads verify checksums, preserve failed versions and deduplicate verified sources', async () => {
  const original = Buffer.from('original-data'), db = fakeDB();
  let downloaded = Buffer.from('wrong-data');
  const handler = uploadHandler({ db, auth: async () => ({ id: 'admin' }), fetch: async () => new Response(downloaded) });
  const details = { filename: 'Original.TIFF', size: original.length, sha256: sha(original) };
  assert.equal(M.uploadDetails({ ...details, size: 256 * 1024 * 1024 }).size_bytes, 256 * 1024 * 1024);
  assert.throws(() => M.uploadDetails({ ...details, size: 513 * 1024 * 1024 }), /512 MiB/);
  let response = payload(await handler(post(details)));
  assert.equal(response.method, 'PUT'); assert.equal(response.headers['x-upsert'], 'false');
  const assetId = response.assetId, firstPath = db.tables.gmf_assets[0].storage_path;
  assert.equal((await handler(post({ action: 'complete', assetId, sha256: details.sha256 }))).statusCode, 409);
  assert.equal(db.tables.gmf_assets[0].status, 'failed');
  await handler(post(details));
  assert.notEqual(db.tables.gmf_assets[0].storage_path, firstPath);
  assert.deepEqual(db.tables.gmf_assets[0].upload_history, [firstPath]);
  downloaded = original;
  assert.equal((await handler(post({ action: 'complete', assetId, sha256: details.sha256 }))).statusCode, 200);
  response = payload(await handler(post(details)));
  assert.equal(response.alreadyUploaded, true); assert.equal(response.uploadUrl, undefined);
  assert.equal(db.tables.gmf_assets.length, 1);
  const signed = payload(await handler({ httpMethod: 'GET', queryStringParameters: { id: assetId, download: '1' } }));
  assert.match(signed.url, /^https:\/\/private\.example/); assert.equal(signed.expiresIn, 300);
});

test('missing API credentials fail before creating a job or dispatching a worker', async () => {
  const { db, deps, calls } = fixture();
  const response = await jobsHandler({ ...deps, env: { GMF_MOCKUP_WORKER_SECRET: env.GMF_MOCKUP_WORKER_SECRET } })(post(request()));
  assert.equal(response.statusCode, 503); assert.match(payload(response).error, /dedicated OpenAI API key/);
  assert.equal(db.writes.length, 0); assert.equal(calls.length, 0);
});

test('same source and settings reuse a job, active owner is capped, and failed dispatch retains the job ID', async () => {
  const { db, deps, calls } = fixture(), handler = jobsHandler(deps);
  const first = payload(await handler(post(request()))), second = payload(await handler(post(request())));
  assert.equal(first.jobId, second.jobId); assert.equal(db.tables.gmf_mockup_jobs.length, 1);
  assert.equal(calls.length, 2); // Safe redispatch; CAS protects the actual worker.
  assert.equal((await handler(post(request({ productId: 'another-product' })))).statusCode, 409);
  const other = fixture();
  const response = payload(await jobsHandler({ ...other.deps, fetch: async () => { throw new Error('offline'); } })(post(request())));
  assert.equal(response.status, 'partial'); assert.ok(response.jobId);
  assert.equal(other.db.tables.gmf_mockup_jobs[0].status, 'partial');
});

test('signed worker rejects tampering and expired dispatch before touching storage', async () => {
  const { deps, db } = fixture(), body = JSON.stringify({ jobId: 'one', dispatchToken: 'two' });
  const headers = M.signedDispatch(body, env.GMF_MOCKUP_WORKER_SECRET);
  assert.throws(() => M.verifyDispatch({ body: body + ' ', headers }, env.GMF_MOCKUP_WORKER_SECRET), /authorization/);
  assert.throws(() => M.verifyDispatch({ body, headers }, env.GMF_MOCKUP_WORKER_SECRET, Date.now() + 301000), /authorization/);
  assert.equal((await workerHandler(deps)(post({ jobId: 'one', dispatchToken: 'two' }))).statusCode, 401);
  assert.equal(db.writes.length, 0);
});

test('worker dispatch stays on the current deploy rather than production during preview testing', async () => {
  const { deps, calls } = fixture();
  await M.dispatch({ id: 'job', dispatch_token: 'dispatch' }, { ...deps, env: { ...env, DEPLOY_URL: 'https://deploy-123.example.test' } });
  assert.equal(calls[0].url, 'https://deploy-123.example.test/.netlify/functions/mockup-worker-background');
  M.verifyDispatch({ body: calls[0].options.body, headers: calls[0].options.headers }, env.GMF_MOCKUP_WORKER_SECRET);
});

test('worker claims once, persists partial success and retry regenerates only the failed preview', async () => {
  const { db, deps } = fixture(), api = jobsHandler(deps);
  await api(post(request()));
  let generated = [], failWhite = true;
  const worker = workerHandler({ ...deps, generateImage: async (asset, settings, preview) => {
    generated.push(preview.colorCode);
    if (preview.colorCode === 'white' && failWhite) throw M.error(502, 'provider failed');
    return Buffer.from(`image-${preview.id}`);
  } });
  const firstDispatch = signedEvent(db.tables.gmf_mockup_jobs[0]);
  assert.equal((await worker(firstDispatch)).statusCode, 200);
  assert.equal(db.tables.gmf_mockup_jobs[0].previews[0].status, 'ready');
  assert.equal(db.tables.gmf_mockup_jobs[0].status, 'queued');
  assert.equal(payload(await worker(firstDispatch)).ignored, true);
  assert.deepEqual(generated, ['black']);
  await worker(signedEvent(db.tables.gmf_mockup_jobs[0]));
  assert.equal(db.tables.gmf_mockup_jobs[0].status, 'partial');
  const jobId = db.tables.gmf_mockup_jobs[0].id;
  await api(post({ action: 'retry', jobId })); failWhite = false;
  assert.equal(db.tables.gmf_mockup_jobs[0].previews[0].status, 'ready');
  await worker(signedEvent(db.tables.gmf_mockup_jobs[0]));
  assert.equal(db.tables.gmf_mockup_jobs[0].status, 'complete');
  assert.deepEqual(generated, ['black', 'white', 'white']);
  assert.equal(db.tables.gmf_mockup_jobs[0].retry_count, 1);
  assert.ok(db.uploads.every(upload => upload.bucket === M.PRIVATE));
});

test('recovered stored preview avoids provider charges; storage outages do not trigger paid generation', async () => {
  for (const outage of [false, true]) {
    const { db, deps } = fixture(); await jobsHandler(deps)(post(request({ colors: [request().colors[0]] })));
    const job = db.tables.gmf_mockup_jobs[0], p = job.previews[0];
    db.objects.set(`${M.PRIVATE}/drafts/${job.id}/${p.id}.png`, Buffer.from('already-generated'));
    db.storageFailure = outage;
    let generated = 0;
    await workerHandler({ ...deps, generateImage: async () => { generated++; throw new Error('must not charge'); } })(signedEvent(job));
    assert.equal(generated, 0);
    assert.equal(db.tables.gmf_mockup_jobs[0].status, outage ? 'failed' : 'complete');
  }
});

test('approval publishes only selected completed images and leaves all others private', async () => {
  const { db, deps } = fixture(), api = jobsHandler(deps);
  await api(post(request()));
  const worker = workerHandler({ ...deps, generateImage: async () => Buffer.from('generated') });
  await worker(signedEvent(db.tables.gmf_mockup_jobs[0]));
  await worker(signedEvent(db.tables.gmf_mockup_jobs[0]));
  const job = db.tables.gmf_mockup_jobs[0];
  const before = payload(await api({ httpMethod: 'GET', queryStringParameters: { id: job.id } }));
  assert.ok(before.previews.every(p => /^https:\/\/private\./.test(p.imageUrl)));
  const result = payload(await api(post({ action: 'approve', jobId: job.id, previewIds: [job.previews[1].id] })));
  assert.equal(result.previews.length, 1); assert.equal(result.approved.length, 1);
  assert.equal(result.previews[0].previewApproved, true); assert.match(result.previews[0].imageUrl, /^https:\/\/public\./);
  assert.equal(db.uploads.filter(upload => upload.bucket === M.PUBLIC).length, 1);
  assert.equal(db.tables.gmf_mockup_jobs[0].previews[0].status, 'ready');
  await api(post({ action: 'approve', jobId: job.id, previewIds: [job.previews[1].id] }));
  assert.equal(db.uploads.filter(upload => upload.bucket === M.PUBLIC).length, 1);
});

test('source checksum or unsupported PSD stops image processing before any paid API call', async () => {
  const { asset, db, original } = fixture(); let fetches = 0, decodes = 0;
  const deps = { env, fetch: async url => { assert.match(String(url), /^https:\/\/private\./); fetches++; return new Response(Buffer.from('changed original')); }, sharp: () => { decodes++; throw new Error('must not decode corrupted source'); } };
  const settings = M.settingsFor(request());
  await assert.rejects(M.generateImage(asset, settings, M.previewList(settings)[0], db, deps), /size mismatch|checksum changed/);
  assert.equal(fetches, 1); assert.equal(decodes, 0);
  await assert.rejects(M.generateImage({ ...asset, content_type: 'image/vnd.adobe.photoshop' }, settings, {}, db, deps), /PSD original is preserved/);
  assert.equal(fetches, 1);
  assert.equal(await M.verifyStream(new Response(original), asset.sha256, original.length), true);
});
