(() => {
  'use strict';
  const form = document.getElementById('bulk-order-form');
  if (!form) return;
  const lines = document.getElementById('garment-lines');
  const addButton = document.getElementById('add-garment');
  const submitButton = document.getElementById('submit-order');
  const status = document.getElementById('form-status');
  const success = document.getElementById('order-success');
  const summary = document.getElementById('summary-lines');
  const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'YS', 'YM', 'YL', 'One size'];
  const garments = ['T-shirt', 'Long-sleeve tee', 'Hoodie', 'Sweatshirt', 'Polo', 'Hat', 'Other'];
  let nextLine = 0;
  let submitting = false;
  let completedSummary = '';
  let completedReference = '';
  const today = new Date();
  document.getElementById('event-date').min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function addLine() {
    if (lines.children.length >= 20) return;
    const id = ++nextLine;
    const line = document.createElement('fieldset');
    line.className = 'garment-line';
    line.innerHTML = `<legend>Garment ${lines.children.length + 1}</legend>
      <div class="line-heading"><span class="line-total">0 pieces</span><button type="button" class="remove-line">Remove garment</button></div>
      <div class="bulk-fields"><div><label for="garment-${id}">Garment type *</label><select id="garment-${id}" data-field="garment" required>${garments.map(g => `<option>${g}</option>`).join('')}</select></div>
      <div><label for="color-${id}">Garment color *</label><input id="color-${id}" data-field="color" maxlength="80" required placeholder="e.g. Black, navy, or help me choose" /></div></div>
      <p class="size-title">Quantity by size * <span class="bulk-hint">YS / YM / YL = youth sizes</span></p>
      <div class="size-grid">${sizes.map((size, i) => `<label for="size-${id}-${i}">${size}<input id="size-${id}-${i}" data-size="${size}" type="number" min="0" max="10000" step="1" inputmode="numeric" placeholder="0" aria-label="${size} quantity for garment ${lines.children.length + 1}" /></label>`).join('')}</div>`;
    line.querySelector('.remove-line').addEventListener('click', () => {
      if (lines.children.length === 1) return;
      line.remove();
      updateSummary();
      addButton.focus();
    });
    lines.appendChild(line);
    updateSummary();
    return line;
  }

  function getItems() {
    return Array.from(lines.children).map(line => ({
      garment: line.querySelector('[data-field="garment"]').value,
      color: line.querySelector('[data-field="color"]').value.trim(),
      sizes: Object.fromEntries(Array.from(line.querySelectorAll('[data-size]')).map(input => [input.dataset.size, input.value === '' ? 0 : Number(input.value)])),
    }));
  }

  function quantity(item) { return Object.values(item.sizes).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0); }
  function sizeText(item) { return Object.entries(item.sizes).filter(([, value]) => value > 0).map(([size, count]) => `${size}: ${count}`).join(' · '); }

  function updateSummary() {
    const items = getItems();
    let total = 0;
    summary.replaceChildren();
    Array.from(lines.children).forEach((line, i) => {
      const item = items[i];
      const count = quantity(item);
      total += count;
      line.querySelector('legend').textContent = `Garment ${i + 1}`;
      const remove = line.querySelector('.remove-line');
      remove.hidden = items.length === 1;
      remove.setAttribute('aria-label', `Remove garment ${i + 1}`);
      line.querySelector('.line-total').textContent = `${count.toLocaleString()} pieces`;
      line.querySelectorAll('[data-size]').forEach(input => input.setAttribute('aria-label', `${input.dataset.size} quantity for garment ${i + 1}`));
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = `${count.toLocaleString()} × ${item.garment}${item.color ? ` / ${item.color}` : ''}`;
      li.append(title, document.createTextNode(sizeText(item) || 'Enter size quantities below.'));
      summary.appendChild(li);
    });
    document.getElementById('total-quantity').textContent = total.toLocaleString();
    addButton.disabled = items.length >= 20;
  }

  function readRequest() {
    const data = Object.fromEntries(new FormData(form).entries());
    data.items = getItems();
    data.placements = Array.from(form.querySelectorAll('[name="placements"]:checked')).map(input => input.value);
    for (const key of ['name', 'email', 'phone', 'organization', 'location', 'artworkUrl', 'notes']) data[key] = String(data[key] || '').trim();
    return data;
  }

  function validate(request) {
    const emptyIndex = request.items.findIndex(item => quantity(item) < 1);
    if (emptyIndex >= 0) {
      lines.children[emptyIndex].querySelector('[data-size]').focus();
      return `Add at least one piece to garment ${emptyIndex + 1}, or remove that garment.`;
    }
    if (request.items.reduce((sum, item) => sum + quantity(item), 0) > 10000) return 'Please keep this request to 10,000 pieces or fewer. Email us for a larger project.';
    if (!request.placements.length) {
      form.querySelector('[name="placements"]').focus();
      return 'Choose at least one design placement. Select Other / not sure if you need guidance.';
    }
    if (!request.name || !request.email) return 'Please enter your name and email.';
    if (request.items.some(item => !item.color)) return 'Please enter a color for every garment, or enter “Help me choose.”';
    if (request.artworkUrl) {
      try {
        const url = new URL(request.artworkUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'Use a shareable http:// or https:// artwork link without sign-in credentials in the URL.';
      } catch (_) { return 'Please enter a complete artwork link beginning with https://.'; }
    }
    return '';
  }

  function requestText(request, reference, total) {
    return [
      'GMF PRODUCTIONS — BULK CUSTOM APPAREL REQUEST', `Reference: ${reference}`, 'Quote request only — not a paid or confirmed order.', '',
      `Name: ${request.name}`, `Email: ${request.email}`, `Phone: ${request.phone || 'Not provided'}`, `Business / team / event: ${request.organization || 'Not provided'}`, '',
      'GARMENTS', ...request.items.map((item, i) => `${i + 1}. ${item.garment} / ${item.color}: ${quantity(item)} pieces\n   ${sizeText(item)}`), `TOTAL: ${total} pieces`, '',
      `Decoration: ${request.decoration}`, `Placements: ${request.placements.join(', ')}`, `Artwork: ${request.artworkStatus}`, `Artwork link: ${request.artworkUrl || 'Not provided'}`, '',
      `Requested date: ${request.eventDate || 'Flexible'}`, `Delivery: ${request.delivery}`, `Location: ${request.location || 'Not provided'}`, '',
      `Notes: ${request.notes || 'None'}`, '', 'Follow up: support@gmfproductions904.com',
    ].join('\n');
  }

  addButton.addEventListener('click', () => { const line = addLine(); line?.querySelector('select').focus(); });
  form.addEventListener('input', () => { if (!submitting) status.textContent = ''; updateSummary(); });
  form.addEventListener('change', updateSummary);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    const request = readRequest();
    const error = validate(request);
    if (error) { status.textContent = error; return; }
    submitting = true;
    status.textContent = 'Sending your request…';
    submitButton.disabled = true;
    submitButton.textContent = 'Sending your request…';
    form.setAttribute('aria-busy', 'true');
    const controls = Array.from(form.elements);
    const previouslyDisabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/.netlify/functions/bulk-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your request could not be saved. Please try again or contact us.');
      if (result.success !== true || typeof result.reference !== 'string' || !Number.isInteger(result.totalQuantity)) throw new Error('We could not confirm receipt. Please contact support before sending again.');
      completedReference = result.reference;
      completedSummary = requestText(request, result.reference, result.totalQuantity);
      document.getElementById('order-reference').textContent = result.reference;
      document.getElementById('success-details').textContent = `${result.totalQuantity.toLocaleString()} pieces across ${request.items.length} garment / color line${request.items.length === 1 ? '' : 's'}. Contact email: ${request.email}.`;
      form.hidden = true;
      success.hidden = false;
      success.focus();
      success.scrollIntoView({ block: 'center', behavior: 'auto' });
    } catch (err) {
      status.textContent = err.name === 'AbortError' ? 'We could not confirm receipt because the request timed out. Your entries are still here. Contact support@gmfproductions904.com to check before resending.' : (err.message || 'Unable to send. Your entries are still here. Please try again or email support@gmfproductions904.com.');
      status.focus();
    } finally {
      clearTimeout(timeout);
      controls.forEach((control, i) => { control.disabled = previouslyDisabled[i]; });
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = 'Request my custom quote';
      form.removeAttribute('aria-busy');
      updateSummary();
    }
  });
  document.getElementById('download-request').addEventListener('click', () => {
    if (!completedSummary) return;
    const url = URL.createObjectURL(new Blob([completedSummary], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${completedReference}-request.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.getElementById('new-request').addEventListener('click', () => {
    form.reset();
    lines.replaceChildren();
    addLine();
    completedSummary = '';
    completedReference = '';
    status.textContent = '';
    success.hidden = true;
    form.hidden = false;
    lines.querySelector('select').focus();
    form.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
  addLine();
})();
