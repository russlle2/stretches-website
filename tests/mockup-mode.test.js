const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'gmf-site', 'content', 'design-manifest.json');
const MOCKUP_DIR = path.join(ROOT, 'gmf-site', 'assets', 'mockups');

function normalizeMode(mode) {
  return mode === 'colorBg' || mode === 'asIs' ? mode : 'stock';
}

describe('mockupMode helpers', () => {
  it('defaults unknown modes to stock', () => {
    assert.equal(normalizeMode(undefined), 'stock');
    assert.equal(normalizeMode('stock'), 'stock');
    assert.equal(normalizeMode('colorBg'), 'colorBg');
    assert.equal(normalizeMode('asIs'), 'asIs');
    assert.equal(normalizeMode('other'), 'stock');
  });
});

describe('regen-mockups respects mockupMode', () => {
  it('generates as-is and colorBg outputs without garment templates', () => {
    const original = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const design = (original.designs || []).find((d) => d.source || d.slug === 'astronaut-status');
    assert.ok(design, 'expected at least one design with a source file');

    const tmpSlug = `mode-test-${Date.now()}`;
    const backup = JSON.stringify(original, null, 2) + '\n';
    const asIsOut = path.join(MOCKUP_DIR, `${tmpSlug}-tee.jpg`);
    const colorOut = path.join(MOCKUP_DIR, `${tmpSlug}-color-tee.jpg`);

    try {
      const asIsManifest = {
        ...original,
        designs: [
          {
            slug: tmpSlug,
            name: 'Mode Test As Is',
            tagline: 'test',
            source: design.source || 'astronaut-status.jpg',
            garments: ['tee'],
            mockupMode: 'asIs',
            needsMockup: true,
          },
          {
            slug: `${tmpSlug}-color`,
            name: 'Mode Test Color',
            tagline: 'test',
            source: design.source || 'astronaut-status.jpg',
            garments: ['tee'],
            mockupMode: 'colorBg',
            backgroundColor: '#0f766e',
            needsMockup: true,
          },
        ],
      };
      fs.writeFileSync(MANIFEST, JSON.stringify(asIsManifest, null, 2) + '\n');

      const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'regen-mockups.js')], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /asIs/);
      assert.match(result.stdout, /colorBg/);
      assert.ok(fs.existsSync(asIsOut), 'as-is mockup should exist');
      assert.ok(fs.existsSync(colorOut), 'colorBg mockup should exist');
      assert.ok(fs.statSync(asIsOut).size > 1000);
      assert.ok(fs.statSync(colorOut).size > 1000);
    } finally {
      fs.writeFileSync(MANIFEST, backup);
      for (const f of [asIsOut, colorOut]) {
        try {
          fs.unlinkSync(f);
        } catch (_) {}
      }
    }
  });
});
