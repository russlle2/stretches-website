/**
 * regen-mockups.js — build-safe mockup regeneration.
 * Uses designs already in gmf-site/assets/designs/ (not the local Downloads folder).
 * Regenerates a mockup when it is missing, or when the design is flagged needsMockup.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'gmf-site', 'content', 'design-manifest.json');
const DESIGN_DIR = path.join(ROOT, 'gmf-site', 'assets', 'designs');
const TEMPLATE_DIR = path.join(ROOT, 'gmf-site', 'assets', 'templates');
const MOCKUP_DIR = path.join(ROOT, 'gmf-site', 'assets', 'mockups');

const PRINT_ZONE = {
  tee: { cx: 0.5, cy: 0.48, w: 0.4, h: 0.46 },
  shorts: { cx: 0.3, cy: 0.55, w: 0.22, h: 0.22 },
  hat: { cx: 0.5, cy: 0.42, w: 0.38, h: 0.22 },
};

function findDesignFile(slug, source) {
  const candidates = [
    source && path.join(DESIGN_DIR, source),
    path.join(DESIGN_DIR, `${slug}.png`),
    path.join(DESIGN_DIR, `${slug}.jpg`),
    path.join(DESIGN_DIR, `${slug}.jpeg`),
    path.join(DESIGN_DIR, `${slug}.webp`),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function cleanDesignBuffer(srcPath) {
  const raw = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;
  const pts = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let bgR = 0,
    bgG = 0,
    bgB = 0;
  for (const [x, y] of pts) {
    const i = (y * width + x) * channels;
    bgR += data[i];
    bgG += data[i + 1];
    bgB += data[i + 2];
  }
  bgR /= pts.length;
  bgG /= pts.length;
  bgB /= pts.length;
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const lightBg = bgLum > 180;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const a = channels === 4 ? data[i * channels + 3] : 255;
    let alphaScale = 1;
    if (lightBg) {
      const dr = r - bgR,
        dg = g - bgG,
        db = b - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < 22) alphaScale = 0;
      else if (dist > 55) alphaScale = 1;
      else alphaScale = (dist - 22) / 33;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = Math.round(a * alphaScale);
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function composite(garment, designPng, outPath) {
  const tplPath = path.join(TEMPLATE_DIR, `${garment}.png`);
  if (!fs.existsSync(tplPath)) throw new Error('Missing template: ' + tplPath);
  const m = await sharp(tplPath).metadata();
  const TW = m.width;
  const TH = m.height;
  const zone = PRINT_ZONE[garment];
  const zoneW = Math.round(TW * zone.w);
  const zoneH = Math.round(TH * zone.h);
  const cx = Math.round(TW * zone.cx);
  const cy = Math.round(TH * zone.cy);
  const trimmed = await sharp(designPng).trim({ threshold: 5 }).toBuffer({ resolveWithObject: true });
  const scale = Math.min(zoneW / trimmed.info.width, zoneH / trimmed.info.height);
  const targetW = Math.max(1, Math.round(trimmed.info.width * scale));
  const targetH = Math.max(1, Math.round(trimmed.info.height * scale));
  const left = cx - Math.round(targetW / 2);
  const top = cy - Math.round(targetH / 2);
  const designResized = await sharp(trimmed.data).resize(targetW, targetH, { fit: 'inside' }).png().toBuffer();
  await sharp(tplPath)
    .composite([{ input: designResized, left, top, blend: 'screen' }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('[regen-mockups] No manifest — skip');
    return;
  }
  fs.mkdirSync(MOCKUP_DIR, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let made = 0;
  let skipped = 0;

  for (const d of manifest.designs || []) {
    const designFile = findDesignFile(d.slug, d.source);
    if (!designFile) {
      skipped++;
      continue;
    }
    const force = !!d.needsMockup;
    let cleaned;
    for (const g of d.garments || []) {
      const out = path.join(MOCKUP_DIR, `${d.slug}-${g}.jpg`);
      if (!force && fs.existsSync(out)) continue;
      if (!cleaned) cleaned = await cleanDesignBuffer(designFile);
      process.stdout.write(`[regen] ${d.slug}-${g} `);
      await composite(g, cleaned, out);
      made++;
      console.log('ok');
    }
  }

  // Clear needsMockup flags in a build artifact only (do not rewrite source during CI
  // unless something was regenerated — rewrite so next admin save doesn't re-force forever)
  if (made > 0 && (manifest.designs || []).some((d) => d.needsMockup)) {
    for (const d of manifest.designs) delete d.needsMockup;
    // Write cleaned flag state so Git Gateway next edit doesn't keep forcing.
    // On Netlify this file change is ephemeral unless committed; that's fine.
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  }

  console.log(`[regen-mockups] Generated ${made} mockup(s); skipped ${skipped} design(s) without source files.`);
}

main().catch((e) => {
  console.error('[regen-mockups]', e.message);
  // Don't fail the whole site build if mockups can't regenerate
  process.exit(0);
});
