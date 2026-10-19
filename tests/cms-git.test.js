const assert = require('node:assert/strict');
const test = require('node:test');
process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_REPO = 'owner/repo';
process.env.SITE_URL = 'https://example.test';
process.env.GMF_ADMIN_EMAILS = 'editor@example.test';
const { handler, allowedPath } = require('../netlify/functions/cms-git');
const response = (status, body) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});
function event(sha) { return {httpMethod:'PUT',headers:{authorization:'Bearer identity-token'},queryStringParameters:{path:'gmf-site/content/design-manifest.json'},body:JSON.stringify({sha,content:Buffer.from('{"schemaVersion":2,"products":[]}').toString('base64')})}; }
test('stale and missing revisions never overwrite a newer catalog', async t => {
 const original=global.fetch;t.after(()=>global.fetch=original);let writes=0;
 global.fetch=async (url,o={})=>{if(url.includes('/identity/user'))return response(200,{email:'editor@example.test'});if(o.method==='PUT')writes++;return response(200,{sha:'current'});};
 assert.equal((await handler(event('stale'))).statusCode,409);assert.equal((await handler(event())).statusCode,409);assert.equal(writes,0);
});
test('matching revision saves and concurrent conflict is not retried', async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);let writes=0;
 global.fetch=async (url,o={})=>{if(url.includes('/identity/user'))return response(200,{email:'editor@example.test'});if(o.method==='PUT'){writes++;return response(409,{message:'sha does not match'});}return response(200,{sha:'current'});};
 assert.equal((await handler(event('current'))).statusCode,409);assert.equal(writes,1);
});
test('ordinary authenticated users cannot edit the site',async t=>{const original=global.fetch;t.after(()=>global.fetch=original);global.fetch=async()=>response(200,{email:'visitor@example.test'});assert.equal((await handler(event('current'))).statusCode,403);});
test('only content JSON and safe upload paths can be edited',()=>{assert.equal(allowedPath('gmf-site/content/theme.json'),true);for(const p of ['gmf-site/admin/admin.js','gmf-site/content/../../index.html','gmf-site/assets/uploads/a.svg','gmf-site/content//theme.json'])assert.equal(allowedPath(p),false);});
