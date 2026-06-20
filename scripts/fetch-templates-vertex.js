// fetch-templates-vertex.js
// Generate the 3 photorealistic apparel base photos with Vertex AI Imagen 4.
// Requires: gcloud auth application-default login (already done) and
// the Vertex AI API enabled in the project (already enabled).
// Run: node scripts/fetch-templates-vertex.js [--force]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'gmf-site', 'assets', 'templates');
fs.mkdirSync(TEMPLATE_DIR, { recursive: true });

const FORCE = process.argv.includes('--force');
const PROJECT = process.env.GCP_PROJECT || 'qwen-training-project';
const LOCATION = 'us-central1';
const MODEL = 'imagen-4.0-generate-001';

const GCLOUD = '"C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd"';

const TEMPLATES = [
  {
    name: 'tee.png',
    prompt: 'Professional studio product photograph of a single blank heavyweight black cotton t-shirt, front view, flat lay on a pure white seamless background, soft natural shadows, sharp focus on subtle fabric texture, no graphics, no labels, no text, no model, no mannequin, ecommerce catalog quality.',
  },
  {
    name: 'shorts.png',
    prompt: 'Professional studio product photograph of a single blank pair of black athletic shorts with a drawstring waistband, front view, flat lay on a pure white seamless background, soft natural shadows, no graphics, no logos, no text, no model, ecommerce catalog quality.',
  },
  {
    name: 'hat.png',
    prompt: 'Professional studio product photograph of a single blank black snapback baseball cap, structured front panel, flat brim, front view straight on, pure white background, soft natural shadows, no logos, no text, no graphics, no model, ecommerce catalog quality.',
  },
];

function getAccessToken() {
  return execSync(`${GCLOUD} auth application-default print-access-token`, { encoding: 'utf8' }).trim();
}

function callImagen(prompt, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1', addWatermark: false },
    });
    const req = https.request(
      {
        method: 'POST',
        hostname: `${LOCATION}-aiplatform.googleapis.com`,
        path: `/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 500)}`));
          try {
            const j = JSON.parse(raw);
            const b64 = j.predictions && j.predictions[0] && j.predictions[0].bytesBase64Encoded;
            if (!b64) return reject(new Error(`No image in response: ${raw.slice(0, 500)}`));
            resolve(Buffer.from(b64, 'base64'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const token = getAccessToken();
  console.log(`Project: ${PROJECT}  Model: ${MODEL}`);
  for (const t of TEMPLATES) {
    const out = path.join(TEMPLATE_DIR, t.name);
    if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 100_000) {
      console.log(`[skip] ${t.name} (${fs.statSync(out).size} bytes)`);
      continue;
    }
    process.stdout.write(`[gen] ${t.name} ... `);
    const buf = await callImagen(t.prompt, token);
    fs.writeFileSync(out, buf);
    console.log(`${buf.length} bytes`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
