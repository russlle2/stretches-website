const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../gmf-site/admin/product-editor');

const product = () => ({ id: 'tee-one', slug: 'tee-one', skuPrefix: 'GMF-TEE-ONE', name: 'One Tee', garment: 'tee', variants: [
  { sku: 'GMF-TEE-ONE-S', color: 'Black', size: 'S', unitAmount: 2599, available: true, previewApproved: true, image: '/assets/mockups/one.jpg' },
] });

test('admin parses prices exactly and leaves unpriced drafts empty', () => {
  assert.equal(editor.money('25.99'), 2599);
  assert.equal(editor.money('0.01'), 1);
  assert.equal(editor.money('25.9'), 2590);
  assert.equal(editor.money(''), null);
  for (const value of ['-2', '1e3', '1.999', '$25', 'NaN', 'Infinity', '9999999999']) assert.throws(() => editor.money(value));
});
test('publishing requires a positive price and approved image for each enabled size', () => {
  assert.deepEqual(editor.validate(product(), true), []);
  for (const patch of [{ unitAmount: null }, { unitAmount: 0 }, { previewApproved: false }, { image: 'javascript:alert(1)' }]) {
    const p = product(); Object.assign(p.variants[0], patch);
    assert.ok(editor.validate(p, true).length);
  }
});
test('unavailable sizes can stay unpriced in a published product', () => {
  const p = product(); p.variants.push({ ...p.variants[0], sku: 'GMF-TEE-ONE-M', size: 'M', available: false, unitAmount: null, previewApproved: false });
  assert.deepEqual(editor.validate(p, true), []);
  p.variants[0].available = false;
  assert.ok(editor.validate(p, true).some(e => e.includes('at least one')));
  assert.deepEqual(editor.validate(p, false), []);
});
test('duplicate variant identities cannot publish', () => {
  const p = product(); p.variants.push({ ...p.variants[0] });
  assert.ok(editor.validate(p, true).some(e => e.includes('own SKU')));
});
test('an imported artwork draft can wait for garment selection', () => {
  const p = { ...product(), garment: '', variants: [] };
  assert.deepEqual(editor.validate(p, false), []);
  assert.ok(editor.validate(p, true).length);
});
test('asset previews accept public HTTPS or site asset paths, never filesystem or script URLs', () => {
  assert.equal(editor.imageUrl('assets/previews/one.png'), '/assets/previews/one.png');
  assert.equal(editor.imageUrl('/assets/previews/one.png'), '/assets/previews/one.png');
  assert.equal(editor.imageUrl('https://example.com/one.png'), 'https://example.com/one.png');
  for (const input of ['file:///Volumes/drive/image.png', '/Users/name/file.png', 'javascript:alert(1)', '//example.com/p.png', 'data:text/html,hello']) assert.equal(editor.imageUrl(input), '');
});
