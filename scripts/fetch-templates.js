// fetch-templates.js
// Pulls photorealistic blank apparel templates from Pollinations (free, no key).
// Re-runs are idempotent: if a template already exists, it is reused.
// Run: node scripts/fetch-templates.js [--force]

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'gmf-site', 'assets', 'templates');
fs.mkdirSync(TEMPLATE_DIR, { recursive: true });

const FORCE = process.argv.includes('--force');

const TEMPLATES = [
  {
    name: 'tee.png',
    prompt: 'blank black heavyweight cotton tshirt mockup, front view, flat lay, pure white background, studio photography, sharp focus, professional ecommerce',
    seed: 42,
  },
  {
    name: 'shorts.png',
    prompt: 'blank black athletic shorts mockup, front view, flat lay on pure white background, studio photography, professional ecommerce product shot, sharp focus',
    seed: 17,
  },
  {
    name: 'hat.png',
    prompt: 'blank black snapback baseball cap mockup, front view, pure white background, studio photography, professional product shot, flat brim',
    seed: 88,
  },
];

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, outPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(outPath)));
    }).on('error', reject);
  });
}

async function main() {
  for (const t of TEMPLATES) {
    const out = path.join(TEMPLATE_DIR, t.name);
    if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 5000) {
      console.log(`[skip] ${t.name} (already exists)`);
      continue;
    }
    const prompt = encodeURIComponent(t.prompt);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&model=flux&nologo=true&seed=${t.seed}`;
    process.stdout.write(`[gen] ${t.name} ... `);
    await download(url, out);
    console.log(`${fs.statSync(out).size} bytes`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
