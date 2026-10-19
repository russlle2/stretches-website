const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('../gmf-site/scripts/theme-utils');

test('the two accent defaults are preserved and invalid CSS cannot enter output', () => {
  assert.deepEqual(theme.normalize({}), { primary: '#10b981', secondary: '#d6b25e' });
  assert.deepEqual(theme.normalize({ primary: 'red; background:url(https://example.com)', secondary: '#ABCDEF' }), { primary: '#10b981', secondary: '#abcdef' });
  assert.equal(theme.valid('#abc'), false);
});
test('dark accent selections retain exact fills while producing readable text', () => {
  for (const color of ['#000000', '#ffffff', '#800000', '#012345', '#10b981', '#d6b25e']) {
    const v = theme.variables({ primary: color });
    assert.equal(v['--gmf-primary'], color);
    assert.ok(theme.contrast(v['--gmf-primary-text'], '#1d1d1d') >= 4.5);
    assert.ok(theme.contrast(color, v['--gmf-on-primary']) >= 4.5);
    assert.ok(theme.contrast(v['--gmf-primary-hover'], v['--gmf-on-primary-hover']) >= 4.5);
  }
});
test('theme output supports homepage opacity and hover variants as well as store tokens', () => {
  const css = theme.css({ primary: '#123456', secondary: '#fedcba' });
  assert.ok(css.includes('--gmf-primary-rgb: 18 52 86'));
  assert.ok(css.includes('--gmf-secondary: #fedcba'));
  assert.ok(css.includes('.text-brand-green\\/50'));
  assert.ok(css.includes('.hover\\:text-brand-green:hover'));
});
