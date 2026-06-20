// generate-mockups.js
// Read every design listed in gmf-site/content/design-manifest.json, copy a
// cleaned design PNG to gmf-site/assets/designs/, and composite onto SVG-based
// black tee / shorts / snapback templates -> gmf-site/assets/mockups/.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = 'C:\\Users\\chris\\Downloads\\Mobile Devices';
const MANIFEST = path.join(ROOT, 'gmf-site', 'content', 'design-manifest.json');
const DESIGN_DIR = path.join(ROOT, 'gmf-site', 'assets', 'designs');
const MOCKUP_DIR = path.join(ROOT, 'gmf-site', 'assets', 'mockups');

fs.mkdirSync(DESIGN_DIR, { recursive: true });
fs.mkdirSync(MOCKUP_DIR, { recursive: true });

const CANVAS = 1200;
const BG = '#0a0a0a';
const FG = '#1a1a1a';
const HI = '#252525';
const STITCH = '#3a3a3a';

function teeSvg(w, h) {
  // Heavyweight crewneck tee silhouette
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f4f4"/>
      <stop offset="1" stop-color="#dcdcdc"/>
    </linearGradient>
    <radialGradient id="tee" cx="50%" cy="40%" r="55%">
      <stop offset="0" stop-color="#222"/>
      <stop offset="1" stop-color="#0a0a0a"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#bg)"/>
  <!-- Body -->
  <path d="M250 320
           L380 230
           L470 200
           Q600 270 730 200
           L820 230
           L950 320
           L890 460
           L820 420
           L820 1050
           Q600 1090 380 1050
           L380 420
           L310 460 Z"
        fill="url(#tee)" stroke="${STITCH}" stroke-width="3"/>
  <!-- Neckline -->
  <path d="M470 200 Q600 290 730 200 Q600 250 470 200 Z" fill="${BG}" stroke="${STITCH}" stroke-width="2"/>
  <!-- Stitch lines on sleeves -->
  <path d="M310 460 L380 420" stroke="${STITCH}" stroke-width="2" fill="none"/>
  <path d="M890 460 L820 420" stroke="${STITCH}" stroke-width="2" fill="none"/>
  <!-- Subtle drape -->
  <path d="M380 420 L380 1050" stroke="${HI}" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M820 420 L820 1050" stroke="${HI}" stroke-width="1" fill="none" opacity="0.4"/>
  <!-- Hem -->
  <path d="M380 1050 Q600 1085 820 1050" stroke="${STITCH}" stroke-width="2" fill="none"/>
</svg>`;
}

function shortsSvg(w, h) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f4f4"/>
      <stop offset="1" stop-color="#dcdcdc"/>
    </linearGradient>
    <radialGradient id="sh" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#202020"/>
      <stop offset="1" stop-color="#080808"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#bg2)"/>
  <!-- Waistband -->
  <rect x="320" y="280" width="560" height="90" rx="20" fill="${FG}" stroke="${STITCH}" stroke-width="3"/>
  <!-- Drawstring -->
  <line x1="560" y1="320" x2="540" y2="370" stroke="#fff" stroke-width="3"/>
  <line x1="640" y1="320" x2="660" y2="370" stroke="#fff" stroke-width="3"/>
  <!-- Body -->
  <path d="M320 370
           L320 950
           Q450 990 560 970
           L600 600
           L640 970
           Q750 990 880 950
           L880 370 Z"
        fill="url(#sh)" stroke="${STITCH}" stroke-width="3"/>
  <!-- Inseam V -->
  <path d="M560 970 L600 600 L640 970" fill="none" stroke="${STITCH}" stroke-width="2"/>
  <!-- Side stripes (for design placement reference) -->
  <line x1="400" y1="370" x2="400" y2="950" stroke="${HI}" stroke-width="1" opacity="0.4"/>
  <line x1="800" y1="370" x2="800" y2="950" stroke="${HI}" stroke-width="1" opacity="0.4"/>
</svg>`;
}

function hatSvg(w, h) {
  // 6-panel snapback front view
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="bgh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f4f4"/>
      <stop offset="1" stop-color="#dcdcdc"/>
    </linearGradient>
    <radialGradient id="crown" cx="50%" cy="60%" r="55%">
      <stop offset="0" stop-color="#262626"/>
      <stop offset="1" stop-color="#0a0a0a"/>
    </radialGradient>
    <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#181818"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#bgh)"/>
  <!-- Crown -->
  <path d="M260 720
           Q260 360 600 360
           Q940 360 940 720
           L940 760
           L260 760 Z"
        fill="url(#crown)" stroke="${STITCH}" stroke-width="3"/>
  <!-- Front panel seam (vertical) -->
  <line x1="600" y1="360" x2="600" y2="760" stroke="${STITCH}" stroke-width="2" opacity="0.6"/>
  <!-- Side panel seams -->
  <line x1="430" y1="400" x2="430" y2="760" stroke="${STITCH}" stroke-width="1.5" opacity="0.5"/>
  <line x1="770" y1="400" x2="770" y2="760" stroke="${STITCH}" stroke-width="1.5" opacity="0.5"/>
  <!-- Top button -->
  <circle cx="600" cy="365" r="8" fill="${FG}" stroke="${STITCH}" stroke-width="1"/>
  <!-- Brim (flat) -->
  <path d="M200 760
           Q600 870 1000 760
           Q1000 815 600 870
           Q200 815 200 760 Z"
        fill="url(#brim)" stroke="${STITCH}" stroke-width="3"/>
  <!-- Sweatband edge -->
  <path d="M260 760 Q600 820 940 760" fill="none" stroke="${HI}" stroke-width="2"/>
</svg>`;
}

// Bounding box (within 1200x1200 canvas) where the design sits
const PLACEMENT = {
  tee: { x: 420, y: 470, w: 360, h: 460 },
  shorts: { x: 380, y: 430, w: 440, h: 440 },
  hat: { x: 380, y: 460, w: 440, h: 220 },
};

// Knock the off-white photo backgrounds out so the design reads on dark fabric.
// Approach: chroma-key against the dominant background. Sample corner pixels to
// get the bg color, then drop everything within tolerance. For designs that
// already sit on a black/dark photo background (cassette, astronaut), keep all
// pixels (alphaScale=1) since they'll be placed on white shorts/tees later.
async function cleanDesign(srcPath, outPath) {
  const raw = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;

  // Sample 4 corners + center-edge pixels to estimate background
  const samplePts = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [x, y] of samplePts) {
    const i = (y * width + x) * channels;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR /= samplePts.length; bgG /= samplePts.length; bgB /= samplePts.length;
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // Decide: if background is light (>180), chroma-key it out.
  // If dark, leave the image alone (preserve full image).
  const lightBg = bgLum > 180;

  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const a = channels === 4 ? data[i * channels + 3] : 255;

    let alphaScale = 1;
    if (lightBg) {
      // Distance from bg color in RGB; small distance -> transparent
      const dr = r - bgR, dg = g - bgG, db = b - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      // Hard cutoff with feathered edge: dist<20 -> fully bg, dist>50 -> opaque
      if (dist < 20) alphaScale = 0;
      else if (dist > 50) alphaScale = 1;
      else alphaScale = (dist - 20) / 30;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = Math.round(a * alphaScale);
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return { width, height };
}

async function composite(garment, designPath, outPath) {
  const tpl = garment === 'tee' ? teeSvg(CANVAS, CANVAS)
    : garment === 'shorts' ? shortsSvg(CANVAS, CANVAS)
    : hatSvg(CANVAS, CANVAS);
  const tplBuf = Buffer.from(tpl);
  const box = PLACEMENT[garment];

  // Rasterize the template at exactly CANVAS px (overriding SVG density math).
  const tplRaster = await sharp(tplBuf)
    .resize(CANVAS, CANVAS, { fit: 'fill' })
    .png()
    .toBuffer();

  // Trim transparent border then fit inside the placement box preserving aspect.
  const trimmed = await sharp(designPath)
    .trim({ threshold: 5 })
    .toBuffer({ resolveWithObject: true });
  const meta = trimmed.info;
  const scale = Math.min(box.w / meta.width, box.h / meta.height);
  const targetW = Math.max(1, Math.round(meta.width * scale));
  const targetH = Math.max(1, Math.round(meta.height * scale));
  const offsetX = box.x + Math.round((box.w - targetW) / 2);
  const offsetY = box.y + Math.round((box.h - targetH) / 2);

  const resized = await sharp(trimmed.data)
    .resize(targetW, targetH, { fit: 'inside' })
    .toBuffer();

  await sharp(tplRaster)
    .composite([{ input: resized, left: offsetX, top: offsetY, blend: 'over' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let mockupCount = 0;

  for (const d of manifest.designs) {
    const src = path.join(SRC_DIR, d.source);
    if (!fs.existsSync(src)) {
      console.warn('MISSING source:', src);
      continue;
    }

    const cleanedPath = path.join(DESIGN_DIR, `${d.slug}.png`);
    process.stdout.write(`[clean] ${d.slug} ... `);
    await cleanDesign(src, cleanedPath);
    console.log('ok');

    for (const g of d.garments) {
      const outPath = path.join(MOCKUP_DIR, `${d.slug}-${g}.jpg`);
      process.stdout.write(`  [mock] ${d.slug}-${g} ... `);
      await composite(g, cleanedPath, outPath);
      console.log('ok');
      mockupCount++;
    }
  }
  console.log(`\nDone. ${mockupCount} mockups generated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
