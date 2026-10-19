(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GMF_THEME = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const defaults = { primary: '#10b981', secondary: '#d6b25e' };
  function valid(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
  function normalize(input) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, valid(input && input[key]) ? input[key].toLowerCase() : fallback]));
  }
  function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
  function luminance(hex) {
    const c = rgb(hex).map(n => { n /= 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; });
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function mix(hex, amount) { return '#' + rgb(hex).map(n => Math.round(n + (255 - n) * amount).toString(16).padStart(2, '0')).join(''); }
  function readable(hex) {
    for (let i = 0; i <= 100; i++) { const color = mix(hex, i / 100); if (contrast(color, '#1d1d1d') >= 4.5) return color; }
    return '#ffffff';
  }
  function variables(input) {
    const theme = normalize(input), out = {};
    for (const [key, value] of Object.entries(theme)) {
      const text = readable(value);
      out['--gmf-' + key] = value;
      out['--gmf-' + key + '-rgb'] = rgb(value).join(' ');
      out['--gmf-' + key + '-text'] = text;
      out['--gmf-' + key + '-text-rgb'] = rgb(text).join(' ');
      out['--gmf-on-' + key] = contrast(value, '#000000') >= contrast(value, '#ffffff') ? '#000000' : '#ffffff';
      const hover = mix(value, 0.14);
      out['--gmf-' + key + '-hover'] = hover;
      out['--gmf-on-' + key + '-hover'] = contrast(hover, '#000000') >= contrast(hover, '#ffffff') ? '#000000' : '#ffffff';
    }
    return out;
  }
  function css(input) {
    return '/* Generated from content/theme.json. */\n:root {\n' + Object.entries(variables(input)).map(([k, v]) => '  ' + k + ': ' + v + ';').join('\n') + '\n}\n' +
      'body .text-brand-green, body .hover\\:text-brand-green:hover { color: var(--gmf-primary-text); }\n' +
      'body .text-brand-green\\/50 { color: rgb(var(--gmf-primary-text-rgb) / .5); }\n' +
      '.bg-brand-green.text-black, .hover\\:bg-brand-green.hover\\:text-black:hover, .hover\\:bg-brand-green.text-black:hover { color: var(--gmf-on-primary); }\n' +
      '.bg-brand-green.hover\\:bg-white:hover { color: #000; }\n' +
      '::selection { background: var(--gmf-primary); color: var(--gmf-on-primary); }\n';
  }
  return { defaults, valid, normalize, contrast, readable, variables, css };
});
