/* Product-level prices, immutable source uploads, and reviewed mockup variants. */
(function (global) {
  'use strict';
  const MANIFEST = 'gmf-site/content/design-manifest.json';
  const LIBRARY = 'gmf-site/content/asset-library.json';
  const SIZES = { crewneck: ['S', 'M', 'L', 'XL', '2XL', '3XL'], tee: ['S', 'M', 'L', 'XL', '2XL', '3XL'], hoodie: ['S', 'M', 'L', 'XL', '2XL', '3XL'], shorts: ['S', 'M', 'L', 'XL', '2XL', '3XL'], hat: ['OS'] };
  const COLORS = [
    ['black', 'Black', '#111111'], ['white', 'White', '#ffffff'], ['heather-gray', 'Heather Gray', '#9ca3af'],
    ['navy', 'Navy', '#1e3a5f'], ['royal-blue', 'Royal Blue', '#1d4ed8'], ['red', 'Red', '#dc2626'],
    ['forest-green', 'Forest Green', '#166534'], ['tan', 'Tan', '#d2b48c'],
  ].map(([code, label, hex]) => ({ code, label, hex }));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const slugify = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function money(value) {
    const raw = String(value).trim();
    if (!raw) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Enter a price in dollars with no more than two decimal places.');
    const [dollars, cents = ''] = raw.split('.');
    const amount = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(amount) || amount > 99999999) throw new Error('Price is too large.');
    return amount;
  }
  function imageUrl(value) {
    if (!value) return '';
    const raw = String(value);
    if (/^https:\/\//i.test(raw) || /^\/assets\//.test(raw)) return raw;
    if (/^assets\//.test(raw)) return '/' + raw;
    return '';
  }
  function validate(product, publish) {
    const issues = [];
    if (!String(product.name || '').trim()) issues.push('Give the product a name.');
    if (!product.id || !product.slug || !product.skuPrefix) issues.push('Product identity is missing. Reload the catalog.');
    if ((publish || product.garment) && !SIZES[product.garment]) issues.push('Choose a supported garment.');
    const seen = new Set();
    for (const v of product.variants || []) {
      if (!v.sku || seen.has(v.sku)) issues.push('Every size and color needs its own SKU.');
      seen.add(v.sku);
      if (v.unitAmount != null && (!Number.isSafeInteger(v.unitAmount) || v.unitAmount < 0 || v.unitAmount > 99999999)) issues.push('Prices must be valid amounts in cents.');
      if (v.available && (!v.previewApproved || !imageUrl(v.image) || !Number.isInteger(v.unitAmount) || v.unitAmount <= 0)) issues.push(`${v.color || 'Color'} / ${v.size}: approve a preview and enter a positive price before enabling this size.`);
    }
    if (publish && !(product.variants || []).some(v => v.available)) issues.push('Enable at least one approved, priced size before publishing.');
    return [...new Set(issues)];
  }
  async function request(path, body) {
    const user = global.netlifyIdentity && global.netlifyIdentity.currentUser();
    if (!user) throw new Error('Sign in to continue.');
    const token = await user.jwt();
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.message || data.error || (response.status === 503 ? 'Image storage or generation is not connected yet. Your product remains saved.' : 'Request failed. Please try again.'));
    return data;
  }
  async function download(asset) {
    const url = asset.originalUrl;
    if (!url) throw new Error('This original has not been uploaded to secure storage yet.');
    if (/^\/(api|\.netlify\/functions)\//.test(url)) {
      const popup = global.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      try {
        const result = await request(url);
        const target = result.url || result.downloadUrl || result.signedUrl;
        if (!/^https:\/\//.test(target || '')) throw new Error('A download link is not available. Try again.');
        if (popup) popup.location.href = target;
        else throw new Error('Allow pop-ups for this site, then try Download original again.');
      } catch (error) { if (popup) popup.close(); throw error; }
    } else if (/^https:\/\//.test(url)) global.open(url, '_blank', 'noopener');
    else throw new Error('The original does not have a valid download link.');
  }
  async function readCatalog() {
    const result = await global.GMF_GIT.getJson(MANIFEST);
    if (result.data.schemaVersion !== 2 || !Array.isArray(result.data.products)) throw new Error('The product catalog upgrade is not available yet. Refresh after deployment.');
    return result;
  }
  async function readLibrary() {
    try { return (await global.GMF_GIT.getJson(LIBRARY)).data.assets || []; }
    catch (error) { if (/404|not found/i.test(error.message)) return []; throw error; }
  }
  async function writeProduct(record, product, publish) {
    const issues = validate(product, publish);
    if (issues.length) throw new Error(issues.join('\n'));
    const data = clone(record.data);
    if (data.products.some(p => p.id !== product.id && (p.slug === product.slug || p.skuPrefix === product.skuPrefix))) throw new Error('Another product already uses this name or SKU prefix. Choose a distinct product name.');
    const nextProduct = { ...clone(product), status: publish ? 'published' : 'draft' };
    const i = data.products.findIndex(p => p.id === product.id);
    if (i < 0) data.products.push(nextProduct); else data.products[i] = nextProduct;
    const result = await global.GMF_GIT.putJson(MANIFEST, data, (publish ? 'Publish product: ' : 'Save product draft: ') + product.name, record.sha);
    product.status = nextProduct.status;
    record.data = data;
    record.sha = result.content && result.content.sha;
    if (!record.sha) { const current = await readCatalog(); record.data = current.data; record.sha = current.sha; }
  }
  function field(label, html) { return `<label class="product-field">${esc(label)}${html}</label>`; }
  async function render(panel, notify) {
    const record = await readCatalog();
    let assets = await readLibrary();
    let selected = null, working = null, busy = false, timer = null, dirty = false;
    const instance = crypto.randomUUID(); panel.dataset.productEditor = instance;
    api.canLeave = () => !busy && (!dirty || global.confirm('Leave this editor and discard unsaved product changes?'));
    panel.innerHTML = `<div class="card"><h2>Products & Prices</h2><p class="muted">Set a separate price and availability for every size and color of each product. New products stay in drafts until you publish them.</p><div class="product-toolbar"><input id="product-search" type="search" aria-label="Search products" placeholder="Find a product or collection"/><select id="product-filter" aria-label="Filter products"><option value="all">All products</option><option value="published">Published</option><option value="draft">Drafts</option></select><button id="new-product" class="btn">Add Product</button></div><div id="product-list" class="product-list"></div></div><div id="product-form"></div>`;
    const $ = selector => panel.querySelector(selector);
    function status(message, kind) { notify(message, kind); }
    function refreshList() {
      const query = $('#product-search').value.toLowerCase(), filter = $('#product-filter').value;
      const products = record.data.products.filter(p => (filter === 'all' || p.status === filter) && `${p.name} ${p.collection || ''}`.toLowerCase().includes(query));
      $('#product-list').innerHTML = products.length ? products.map(p => `<button class="product-select ${p.id === selected ? 'selected' : ''}" data-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><span>${esc(p.collection || p.garment)} · ${p.status === 'published' ? 'Published' : 'Draft'} · ${(p.variants || []).filter(v => v.available).length} sizes available</span></button>`).join('') : '<p class="muted">No matching products.</p>';
      $('#product-list').querySelectorAll('[data-id]').forEach(button => { button.onclick = () => choose(button.dataset.id); });
    }
    function rememberJob(id) { try { localStorage.setItem('gmf-preview-job:' + working.id, id); } catch (_) {} }
    function savedJob() { try { return localStorage.getItem('gmf-preview-job:' + working.id); } catch (_) { return null; } }
    function collect() {
      if (!working || !$('#product-name')) return;
      working.name = $('#product-name').value.trim();
      working.description = $('#product-description').value.trim();
      working.collection = $('#product-collection').value.trim();
      working.garment = $('#product-garment').value;
      if (!record.data.products.some(p => p.id === working.id)) { working.slug = slugify(working.name) + '-' + working.garment; }
      panel.querySelectorAll('[data-variant-index]').forEach(row => {
        const v = working.variants[Number(row.dataset.variantIndex)];
        v.unitAmount = money(row.querySelector('[data-price]').value);
        v.available = row.querySelector('[data-available]').checked;
      });
    }
    function setBusy(value) { busy = value; $('#product-form').querySelectorAll('button').forEach(b => { if (value) { b.dataset.wasDisabled = String(b.disabled); b.disabled = true; } else if (b.dataset.wasDisabled !== undefined) { b.disabled = b.dataset.wasDisabled === 'true'; delete b.dataset.wasDisabled; } }); $('#new-product').disabled = value; }
    async function action(fn) {
      if (busy) return;
      try { collect(); setBusy(true); await fn(); }
      catch (error) { status(error.message, 'error'); }
      finally { setBusy(false); }
    }
    function choose(id, fresh) {
      if (busy) return;
      if (dirty && !global.confirm('Leave this product and discard unsaved changes?')) return;
      clearTimeout(timer);
      selected = id;
      working = clone(fresh || record.data.products.find(p => p.id === id));
      working.sourceAssetIds ||= []; working.variants ||= []; working.images ||= []; working.previews ||= [];
      dirty = false;
      refreshList(); renderForm();
      const jobId = savedJob(); if (jobId) poll(jobId);
    }
    function renderVariants() {
      const rows = working.variants.map((v, i) => `<tr data-variant-index="${i}"><td><span class="color-chip" style="background:${/^#[0-9a-f]{6}$/i.test(v.colorHex || '') ? v.colorHex : '#777'}"></span>${esc(v.color)}${v.artworkColorway && v.artworkColorway !== 'original' ? '<small>' + esc(v.artworkColorway) + '</small>' : ''}</td><td>${esc(v.size)}</td><td><input data-price type="number" min="0.01" max="999999.99" step="0.01" inputmode="decimal" aria-label="${esc(v.color + ' ' + v.size)} price in dollars" value="${v.unitAmount == null ? '' : (v.unitAmount / 100).toFixed(2)}"/></td><td><input data-available type="checkbox" aria-label="Sell ${esc(v.color + ' ' + v.size)}" ${v.available ? 'checked' : ''} ${v.previewApproved ? '' : 'disabled'}/></td><td>${v.previewApproved ? 'Approved' : 'Needs review'}</td></tr>`).join('');
      $('#variant-table').innerHTML = rows ? `<div class="table-scroll"><table><thead><tr><th>Garment color / artwork</th><th>Size</th><th>Price ($)</th><th>Available</th><th>Preview</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Upload or link an original, generate previews, then approve colors to add sizes and prices.</p>';
    }
    function renderSources() {
      const linked = working.sourceAssetIds.map(id => assets.find(a => a.id === id) || { id, filename: id, originalUrl: '/api/source-upload?id=' + encodeURIComponent(id) + '&download=1' });
      $('#linked-sources').innerHTML = linked.map(a => `<div class="source-row"><span>${esc(a.filename)}<small>Preserved original</small></span><button type="button" class="btn btn-ghost" data-download="${esc(a.id)}" ${a.originalUrl ? '' : 'disabled'}>Download original</button></div>`).join('') || '<p class="muted">No original linked yet.</p>';
      $('#linked-sources').querySelectorAll('[data-download]').forEach(button => { button.onclick = () => action(() => download(linked.find(a => a.id === button.dataset.download))); });
      $('#source-choice').innerHTML = '<option value="">Choose an original</option>' + linked.map(a => `<option value="${esc(a.id)}">${esc(a.filename)}</option>`).join('');
      if (linked.length) $('#source-choice').value = linked[linked.length - 1].id;
    }
    function renderForm() {
      $('#product-form').innerHTML = `<section class="card product-detail-editor"><div class="product-heading"><h2>${esc(working.name || 'New product')}</h2><span class="state-badge">${working.status === 'published' ? 'Published' : 'Draft'}</span></div><p class="muted">Changes apply only to this product. Original uploads are retained separately from generated previews.</p><div class="row">${field('Product name', `<input id="product-name" value="${esc(working.name)}" maxlength="160"/>`)}${field('Garment', `<select id="product-garment" ${working.variants.length ? 'disabled' : ''}><option value="">Choose garment</option>${Object.keys(SIZES).map(g => `<option value="${g}" ${working.garment === g ? 'selected' : ''}>${g === 'tee' ? 'T-Shirt' : g.charAt(0).toUpperCase() + g.slice(1)}</option>`).join('')}</select>`)}${field('Collection', `<input id="product-collection" value="${esc(working.collection || '')}"/>`)}</div>${field('Description', `<textarea id="product-description">${esc(working.description || '')}</textarea>`)}<details class="source-tools" ${working.variants.length ? '' : 'open'}><summary>Originals & color previews</summary><h3>Originals</h3><div id="linked-sources"></div><div class="row">${field('Upload an original', '<input id="original-file" type="file" accept=".png,.jpg,.jpeg,.webp,.tif,.tiff,.psd"/>')}${field('Image type', '<select id="source-kind"><option value="artwork">Print artwork</option><option value="garment-photo">Clothing photo</option></select>')}</div><p class="hint">PNG, JPEG, WebP and TIFF uploads start previews in the selected garment colors below. PSD originals are preserved; upload a PNG or TIFF working copy to generate previews. Maximum 512 MiB. Existing photos remain live until you approve and publish replacements.</p><details class="source-library-picker"><summary>Link an existing original from the asset library</summary>${field('Asset', `<select id="asset-choice"><option value="">Choose an asset</option>${assets.map(a => `<option value="${esc(a.id)}">${esc(a.family || '')} — ${esc(a.filename)}</option>`).join('')}</select>`)}<button type="button" id="link-asset" class="btn">Link original</button></details><h3>Generate color previews</h3>${field('Original to use', '<select id="source-choice"></select>')}<div class="checks preview-colors">${COLORS.map(c => `<label><input type="checkbox" data-color="${c.code}" checked/><span class="color-chip" style="background:${c.hex}"></span>${c.label}</label>`).join('')}</div><div class="row">${field('Custom color name (optional)', '<input id="custom-color-name" maxlength="24" placeholder="e.g. Burgundy"/>')}${field('Custom color', '<input id="custom-color" type="color" value="#800020"/>')}</div><label class="inline-check"><input id="include-inversion" type="checkbox"/> Include a garment / print color swap</label><p class="hint">For an inversion, choose the two colors in the original. The preview swaps those colors and preserves the artwork.</p><div class="row">${field('Original garment color', `<select id="inversion-garment"><option value="">Choose color</option>${COLORS.map(c => `<option value="${c.code}">${c.label}</option>`).join('')}</select>`)}${field('Original print color', `<select id="inversion-print"><option value="">Choose color</option>${COLORS.map(c => `<option value="${c.code}">${c.label}</option>`).join('')}</select>`)}</div><div class="actions"><button type="button" class="btn" id="generate-previews">Generate Previews</button></div><p id="job-status" role="status" aria-live="polite" class="muted"></p><div id="preview-results" class="asset-grid"></div></details><h3>Sizes, prices & availability</h3><p class="muted">Approval adds sizes as unavailable. Enter prices and enable only the colors and sizes you can fulfill.</p><div class="product-toolbar"><label>Apply price to all sizes of this product ($)<input id="bulk-price" type="number" min="0.01" step="0.01"/></label><button type="button" class="btn" id="apply-price">Apply Price</button></div><div id="variant-table"></div><div class="actions"><button type="button" id="save-draft" class="btn">${working.status === 'published' ? 'Unpublish to Draft' : 'Save Draft'}</button><button type="button" id="publish-product" class="btn btn-primary">Save & Publish Product</button><button type="button" id="reload-product" class="btn btn-ghost">Reload Saved Product</button></div><p class="hint">Publishing requires an approved image and a positive price for every enabled size. Disabled sizes cannot be purchased.</p></section>`;
      renderVariants(); renderSources();
      $('#product-form').oninput = () => { dirty = true; };
      $('#product-form').onchange = () => { dirty = true; };
      $('#apply-price').onclick = () => action(async () => { const amount = money($('#bulk-price').value); if (!amount || amount <= 0) throw new Error('Enter a positive price to apply.'); working.variants.forEach(v => { v.unitAmount = amount; }); dirty = true; renderVariants(); });
      $('#link-asset').onclick = () => action(async () => { const id = $('#asset-choice').value; if (!id) throw new Error('Choose an asset first.'); if (!working.sourceAssetIds.includes(id)) working.sourceAssetIds.push(id); dirty = true; renderSources(); });
      $('#original-file').onchange = () => action(upload);
      $('#generate-previews').onclick = () => action(generate);
      $('#save-draft').onclick = () => action(async () => { if (working.status === 'published' && !global.confirm('Remove this product from the public shop and keep it as a draft?')) return; await save(false); });
      $('#publish-product').onclick = () => action(() => save(true));
      $('#reload-product').onclick = () => action(async () => { if (dirty && !global.confirm('Discard unsaved changes and load the latest saved product?')) return; const next = await readCatalog(); record.data = next.data; record.sha = next.sha; dirty = false; const id = selected; if (!record.data.products.some(p => p.id === id)) throw new Error('This product has not been saved yet. Save a draft first.'); busy = false; choose(id); });
    }
    async function save(publish) {
      status('Saving this product…');
      await writeProduct(record, working, publish);
      dirty = false; refreshList();
      $('#product-form .state-badge').textContent = publish ? 'Published' : 'Draft';
      $('#save-draft').textContent = publish ? 'Unpublish to Draft' : 'Save Draft';
      status(publish ? 'Product saved. The storefront will update after deployment.' : 'Draft saved. This product is not available in the public shop.', 'ok');
    }
    async function upload() {
      const file = $('#original-file').files[0]; if (!file) return;
      const extension = file.name.split('.').pop().toLowerCase();
      const contentType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', psd: 'image/vnd.adobe.photoshop' }[extension];
      if (!contentType) throw new Error('Choose a PNG, JPEG, WebP, TIFF or PSD original.');
      if (!file.size || file.size > 512 * 1024 * 1024) throw new Error('Choose an original smaller than 512 MiB.');
      status('Saving the original image…');
      const bytes = await file.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      const upload = await request('/api/source-upload', { filename: file.name, contentType, size: file.size, sha256: hash, productId: working.id, kind: $('#source-kind').value });
      let completed;
      if (upload.alreadyUploaded && upload.asset) completed = upload.asset;
      else {
        if (!/^https:\/\//.test(upload.uploadUrl || '')) throw new Error('Secure upload is not available. Please try again.');
        const response = await fetch(upload.uploadUrl, { method: upload.method || 'PUT', headers: upload.headers || { 'Content-Type': contentType }, body: bytes });
        if (!response.ok) throw new Error('The original upload did not finish. Your existing images are unchanged.');
        completed = await request('/api/source-upload', { action: 'complete', assetId: upload.assetId, sha256: hash, productId: working.id });
      }
      const asset = completed.asset || completed;
      asset.id ||= upload.assetId; asset.filename ||= file.name;
      assets = [...assets.filter(a => a.id !== asset.id), asset];
      if (!working.sourceAssetIds.includes(asset.id)) working.sourceAssetIds.push(asset.id);
      dirty = true; renderSources();
      if (extension === 'psd') { status('PSD original preserved. Upload a PNG or TIFF working copy to generate color previews.', 'ok'); return; }
      status('Original preserved. Starting preview generation…', 'ok');
      await generate();
    }
    async function generate() {
      if (!SIZES[working.garment]) throw new Error('Choose a garment before generating previews.');
      const sourceAssetId = $('#source-choice').value;
      if (!sourceAssetId) throw new Error('Upload or link an original before generating previews.');
      const colors = COLORS.filter(c => panel.querySelector(`[data-color="${c.code}"]`).checked);
      const custom = $('#custom-color-name').value.trim();
      if (custom) colors.push({ code: slugify(custom).slice(0, 24), label: custom, hex: $('#custom-color').value });
      if (!colors.length || colors.length > 8) throw new Error('Choose between one and eight garment colors. Uncheck a color to add a custom one.');
      const includeInversion = $('#include-inversion').checked;
      let inversion;
      if (includeInversion) {
        const garmentColor = COLORS.find(c => c.code === $('#inversion-garment').value), printColor = COLORS.find(c => c.code === $('#inversion-print').value);
        if (!garmentColor || !printColor || garmentColor.code === printColor.code) throw new Error('Choose two different original garment and print colors for the inversion.');
        inversion = { garmentColor, printColor };
      }
      const result = await request('/api/mockup-jobs', { productId: working.id, sourceAssetId, garment: working.garment, colors, includeInversion, ...(inversion ? { inversion } : {}) });
      const id = result.jobId || result.id; if (!id) throw new Error('The preview job could not be started.');
      rememberJob(id); poll(id);
    }
    async function poll(id) {
      clearTimeout(timer);
      const productId = working.id;
      try {
        const job = await request('/api/mockup-jobs?id=' + encodeURIComponent(id));
        if (!panel.isConnected || panel.dataset.productEditor !== instance || !$('#job-status') || working.id !== productId) return;
        const previews = job.previews || [];
        $('#job-status').textContent = job.error || `Previews: ${job.status || 'processing'}${previews.length ? ' · ' + previews.length + ' results' : ''}. You can leave this page and return later.`;
        showPreviews(id, previews, job.status);
        if (!['completed', 'complete', 'failed', 'cancelled', 'approved', 'partial'].includes(job.status)) timer = setTimeout(() => poll(id), 5000);
      } catch (error) { if ($('#job-status')) $('#job-status').textContent = error.message + ' Reopen this product to check again.'; }
    }
    function showPreviews(jobId, previews, jobStatus) {
      const ready = previews.filter(p => imageUrl(p.imageUrl || p.image));
      const terminal = ['complete', 'partial', 'failed'].includes(jobStatus);
      const selectedIds = new Set(Array.from(panel.querySelectorAll('[data-approve-preview]:checked')).map(el => el.dataset.approvePreview));
      $('#preview-results').innerHTML = previews.map(p => `<article class="asset-card">${imageUrl(p.imageUrl || p.image) ? `<img src="${esc(imageUrl(p.imageUrl || p.image))}" alt="${esc(p.color || p.colorCode || 'Generated')} preview" loading="lazy"/>` : '<div class="asset-placeholder">Preview pending</div>'}<strong>${esc(p.color || p.colorCode)} · ${esc(p.artworkColorway || 'Original print')}</strong><span>${esc(p.error || p.status || 'Ready for review')}</span>${imageUrl(p.imageUrl || p.image) ? `<label class="inline-check"><input type="checkbox" data-approve-preview="${esc(p.id)}" ${selectedIds.has(p.id) ? 'checked' : ''}/> Use this preview</label>` : ''}</article>`).join('') + (ready.length ? `<div class="actions"><button id="approve-previews" class="btn" ${terminal ? '' : 'disabled'}>${terminal ? 'Approve Selected Previews' : 'Waiting for remaining previews…'}</button></div>` : '') + (['partial', 'failed'].includes(jobStatus) ? '<div class="actions"><button id="retry-previews" class="btn">Retry Unfinished Previews</button></div>' : '');
      if ($('#retry-previews')) $('#retry-previews').onclick = () => action(async () => { await request('/api/mockup-jobs', { action: 'retry', jobId }); rememberJob(jobId); await poll(jobId); });
      if ($('#approve-previews')) $('#approve-previews').onclick = () => action(async () => {
        const previewIds = Array.from(panel.querySelectorAll('[data-approve-preview]:checked')).map(el => el.dataset.approvePreview);
        if (!previewIds.length) throw new Error('Select at least one preview to approve.');
        const result = await request('/api/mockup-jobs', { action: 'approve', jobId, previewIds });
        for (const p of result.previews || []) {
          const image = imageUrl(p.imageUrl || p.image); if (!image) continue;
          const colorCode = p.colorCode || p.code, artworkColorway = p.artworkColorway || 'original';
          if (!colorCode) continue;
          const key = colorCode.toLowerCase() + ':' + artworkColorway.toLowerCase();
          working.previews = working.previews.filter(old => old.id !== p.id);
          working.previews.push({ ...p, jobId, previewApproved: true, image });
          if (!working.images.includes(image)) working.images.push(image);
          for (const size of (working.sizeGuide && working.sizeGuide.sizes) || SIZES[working.garment]) {
            const existing = working.variants.find(v => String(v.colorCode).toLowerCase() + ':' + (v.artworkColorway || 'original').toLowerCase() === key && v.size === size);
            if (existing) { existing.image = image; existing.previewApproved = true; existing.generatedPreview = true; }
            else working.variants.push({ sku: `${working.skuPrefix}-${colorCode}-${artworkColorway}-${size}`.toUpperCase().replace(/[^A-Z0-9-]/g, '-'), size, colorCode, color: p.color || p.label || colorCode, colorHex: p.colorHex || p.hex, artworkColorway, unitAmount: null, currency: 'usd', available: false, image, previewApproved: true, generatedPreview: true });
          }
        }
        dirty = true; renderVariants(); status('Previews approved. Enter prices and enable the sizes you can sell, then save the product.', 'ok');
      });
    }
    $('#product-search').oninput = refreshList; $('#product-filter').onchange = refreshList;
    $('#new-product').onclick = () => {
      const id = 'product-' + crypto.randomUUID();
      choose(id, { id, slug: '', skuPrefix: 'GMF-' + id.slice(-12).toUpperCase(), name: '', garment: 'tee', collection: '', status: 'draft', description: '', images: [], sourceAssetIds: [], variants: [], previews: [] });
    };
    refreshList();
    if (record.data.products.length) choose(record.data.products[0].id);
  }
  async function renderAssets(panel, notify) {
    const [assets, record] = await Promise.all([readLibrary(), readCatalog()]);
    panel.innerHTML = `<div class="card"><h2>Original Asset Library</h2><p class="muted">Browse the preserved source collection. Artwork colors describe the print; they do not confirm a garment is available for sale.</p><div class="product-toolbar"><input type="search" id="asset-search" placeholder="Search filename, family or kind" aria-label="Search assets"/><select id="asset-product" aria-label="Product to link"><option value="">Choose a product to link</option>${record.data.products.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div><p id="asset-count" class="muted"></p><div id="asset-grid" class="asset-grid"></div><button id="more-assets" class="btn">Show More</button></div>`;
    const $ = selector => panel.querySelector(selector); let count = 48;
    function draw() {
      const query = $('#asset-search').value.toLowerCase();
      const found = assets.filter(a => `${a.filename} ${a.family || ''} ${a.kind || ''} ${a.relativePath || ''}`.toLowerCase().includes(query));
      $('#asset-count').textContent = `${Math.min(count, found.length)} of ${found.length} assets`;
      $('#more-assets').hidden = count >= found.length;
      $('#asset-grid').innerHTML = found.slice(0, count).map(a => `<article class="asset-card">${imageUrl(a.previewUrl) ? `<img src="${esc(imageUrl(a.previewUrl))}" alt="${esc(a.filename)} preview" loading="lazy"/>` : '<div class="asset-placeholder">Original source file</div>'}<strong>${esc(a.filename)}</strong><span>${esc(a.family || '')} · ${esc(a.kind || 'Source')}${a.width && a.height ? ' · ' + a.width + '×' + a.height : ''}</span><button class="btn btn-ghost" data-download="${esc(a.id)}" ${a.originalUrl ? '' : 'disabled'}>Download original</button>${a.originalUrl ? '' : '<small>Archived locally; secure upload pending.</small>'}<button class="btn" data-link="${esc(a.id)}">Link to Product</button></article>`).join('');
      $('#asset-grid').querySelectorAll('[data-download]').forEach(b => { b.onclick = async () => { try { await download(assets.find(a => a.id === b.dataset.download)); } catch (e) { notify(e.message, 'error'); } }; });
      $('#asset-grid').querySelectorAll('[data-link]').forEach(b => { b.onclick = async () => {
        try {
          const p = record.data.products.find(p => p.id === $('#asset-product').value); if (!p) throw new Error('Choose a product above first.');
          const next = clone(p); next.sourceAssetIds ||= [];
          if (!next.sourceAssetIds.includes(b.dataset.link)) next.sourceAssetIds.push(b.dataset.link);
          b.disabled = true; await writeProduct(record, next, p.status === 'published'); notify('Original linked to ' + p.name + '. Generate previews from Products & Prices.', 'ok');
        } catch (e) { notify(e.message, 'error'); } finally { b.disabled = false; }
      }; });
    }
    $('#asset-search').oninput = () => { count = 48; draw(); }; $('#more-assets').onclick = () => { count += 48; draw(); }; draw();
  }
  const api = { render, renderAssets, validate, money, imageUrl, COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.GMF_PRODUCTS_EDITOR = api;
})(typeof window === 'undefined' ? globalThis : window);
