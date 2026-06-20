// generate-mockups.js
// 1. Clean each design in gmf-site/content/design-manifest.json (chroma-key
//    out the cream/white photo background, keep original colors).
// 2. Composite onto the photorealistic Pollinations templates in
//    gmf-site/assets/templates/{tee,shorts,hat}.png using "screen" blend so
//    bright designs pop on the black fabric instead of looking pasted-on.
// 3. Save the final product photos to gmf-site/assets/mockups/.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = 'C:\\Users\\chris\\Downloads\\Mobile Devices';
const MANIFEST = path.join(ROOT, 'gmf-site', 'content', 'design-manifest.json');
const DESIGN_DIR = path.join(ROOT, 'gmf-site', 'assets', 'designs');
const TEMPLATE_DIR = path.join(ROOT, 'gmf-site', 'assets', 'templates');
const MOCKUP_DIR = path.join(ROOT, 'gmf-site', 'assets', 'mockups');

fs.mkdirSync(DESIGN_DIR, { recursive: true });
fs.mkdirSync(MOCKUP_DIR, { recursive: true });

// Print zones expressed in normalized 0..1 coordinates inside the 1024x1024
// Pollinations templates. Hand-tuned to match where each garment's print area
// actually sits in the source photos.
// Tuned for the Vertex/Imagen 4 base templates in gmf-site/assets/templates/.
// All coordinates are normalized 0..1 of the 1024x1024 base photo.
const PRINT_ZONE = {
  tee:    { cx: 0.50, cy: 0.48, w: 0.40, h: 0.46 }, // chest, center-front
  shorts: { cx: 0.30, cy: 0.55, w: 0.22, h: 0.22 }, // left thigh, above hem
  hat:    { cx: 0.50, cy: 0.42, w: 0.38, h: 0.22 }, // front panel, above brim
};

async function getTemplateSize(garment) {
  const tplPath = path.join(TEMPLATE_DIR, `${garment}.png`);
  const m = await sharp(tplPath).metadata();
  return { tplPath, width: m.width, height: m.height };
}

// Chroma-key the cream/white border off each source design. If the design was
// shot on a dark background (cassette / astronaut), leave it intact.
async function cleanDesign(srcPath, outPath) {
  const raw = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;

  // Sample corners + edges for background color
  const pts = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [x, y] of pts) {
    const i = (y * width + x) * channels;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR /= pts.length; bgG /= pts.length; bgB /= pts.length;
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
      const dr = r - bgR, dg = g - bgG, db = b - bgB;
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
  await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outPath);
}

async function composite(garment, designPath, outPath) {
  const { tplPath, width: TW, height: TH } = await getTemplateSize(garment);
  const zone = PRINT_ZONE[garment];
  const zoneW = Math.round(TW * zone.w);
  const zoneH = Math.round(TH * zone.h);
  const cx = Math.round(TW * zone.cx);
  const cy = Math.round(TH * zone.cy);

  // Trim + fit design into zone (preserve aspect)
  const trimmed = await sharp(designPath).trim({ threshold: 5 }).toBuffer({ resolveWithObject: true });
  const meta = trimmed.info;
  const scale = Math.min(zoneW / meta.width, zoneH / meta.height);
  const targetW = Math.max(1, Math.round(meta.width * scale));
  const targetH = Math.max(1, Math.round(meta.height * scale));
  const left = cx - Math.round(targetW / 2);
  const top = cy - Math.round(targetH / 2);

  const designPng = await sharp(trimmed.data)
    .resize(targetW, targetH, { fit: 'inside' })
    .png()
    .toBuffer();

  // Use "screen" blend so colored designs brighten the black fabric realistically
  // and the fabric texture shows through dark areas. Light/white designs stay
  // bright; black design areas blend with the black tee (invisible) which is fine.
  await sharp(tplPath)
    .composite([{ input: designPng, left, top, blend: 'screen' }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let count = 0;
  for (const d of manifest.designs) {
    const src = path.join(SRC_DIR, d.source);
    if (!fs.existsSync(src)) { console.warn('MISSING:', src); continue; }
    const cleaned = path.join(DESIGN_DIR, `${d.slug}.png`);
    await cleanDesign(src, cleaned);
    process.stdout.write(`[${d.slug}] `);
    for (const g of d.garments) {
      const out = path.join(MOCKUP_DIR, `${d.slug}-${g}.jpg`);
      await composite(g, cleaned, out);
      process.stdout.write(`${g} `);
      count++;
    }
    console.log('');
  }
  console.log(`\nDone. ${count} mockups generated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
