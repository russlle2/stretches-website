require('dotenv').config({ path: '.env' });
const fs = require('fs');

const priceMap = {
  'gmf-core-logo-tee': 'price_1Tj1Iz9AeloaKLwtnMNfRXoN',
  'aint-no-sunshine-hoodie': 'price_1Tj1L59AeloaKLwt3P6gsVME',
  'southside-tour-tee': 'price_1Tj1L59AeloaKLwtaNrwLDMA',
  'fake-smiles-heavyweight-tee': 'price_1Tj1L69AeloaKLwtGc7VnP3W',
  'loyalty-hoodie': 'price_1Tj1L69AeloaKLwtHlmv01EQ',
  'signature-dad-hat': 'price_1Tj1L69AeloaKLwtBqHcXLKa',
};

const mapStr = JSON.stringify(priceMap);
let env = fs.readFileSync('.env', 'utf8');
if (env.includes('STRIPE_PRICE_MAP=')) {
  env = env.replace(/STRIPE_PRICE_MAP=.*/g, `STRIPE_PRICE_MAP=${mapStr}`);
} else {
  env += `\nSTRIPE_PRICE_MAP=${mapStr}\n`;
}
fs.writeFileSync('.env', env);
console.log('STRIPE_PRICE_MAP saved');
