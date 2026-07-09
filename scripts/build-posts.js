/**
 * build-posts.js — generate static HTML for content/pages/posts/*.json
 * and a news index at gmf-site/news.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'gmf-site', 'content', 'pages', 'posts');
const OUT_DIR = path.join(ROOT, 'gmf-site', 'posts');
const NEWS_HTML = path.join(ROOT, 'gmf-site', 'news.html');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(POSTS_DIR, { recursive: true });

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageShell({ title, description, body, crumb }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | GMF Productions</title>
  <meta name="description" content="${escapeHtml(description || title)}" />
  <link rel="stylesheet" href="../styles/main.css" />
</head>
<body>
  <div class="announcement-bar">Free U.S. shipping on orders over $100</div>
  <header>
    <div class="container header-inner">
      <a href="../index.html" class="brand">GMF Productions</a>
      <nav class="nav-links">
        <a href="../shop.html">Shop</a>
        <a href="../about.html">About</a>
        <a href="../music.html">Music</a>
        <a href="../news.html" class="active">News</a>
        <a href="../booking.html">Booking</a>
        <a href="../contact.html">Contact</a>
        <a href="../cart.html">Cart</a>
      </nav>
    </div>
  </header>
  <main class="container" style="padding-top:2rem;padding-bottom:3rem;max-width:800px;">
    <p style="margin-bottom:1rem;"><a href="../news.html">${escapeHtml(crumb || '← All News')}</a></p>
    ${body}
  </main>
  <footer>
    <div class="container">
      <div class="footer-bottom">
        <span>&copy; 2026 GMF Productions. All rights reserved.</span>
      </div>
    </div>
  </footer>
  <script src="../scripts/content-loader.js"></script>
</body>
</html>
`;
}

function renderPost(post) {
  const paras = String(post.body || '')
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  const video = post.youtubeId
    ? `<div style="aspect-ratio:16/9;margin:1.5rem 0;border-radius:8px;overflow:hidden;">
        <iframe style="width:100%;height:100%;border:0;" src="https://www.youtube.com/embed/${escapeHtml(post.youtubeId)}" allowfullscreen loading="lazy"></iframe>
      </div>`
    : '';
  const image = post.image
    ? `<img src="${escapeHtml(post.image.startsWith('http') || post.image.startsWith('/') ? post.image : '../' + post.image)}" alt="" style="width:100%;border-radius:8px;margin:1rem 0;" />`
    : '';
  const badge = post.type === 'promo' ? 'Promo' : 'News';
  return pageShell({
    title: post.title,
    description: post.summary || post.title,
    crumb: '← All News',
    body: `
      <p style="color:#10b981;text-transform:uppercase;letter-spacing:0.12em;font-size:0.8rem;font-weight:700;">${badge}</p>
      <h1>${escapeHtml(post.title)}</h1>
      ${post.publishedAt ? `<p style="color:#a7a7a7;">${escapeHtml(post.publishedAt)}</p>` : ''}
      ${post.summary ? `<p style="font-size:1.15rem;color:#ccc;">${escapeHtml(post.summary)}</p>` : ''}
      ${image}
      ${video}
      <div class="post-body">${paras}</div>
    `,
  });
}

const files = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .reverse();

const posts = [];
for (const file of files) {
  const post = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
  if (!post.slug) post.slug = file.replace(/\.json$/, '');
  posts.push(post);
  const out = path.join(OUT_DIR, `${post.slug}.html`);
  fs.writeFileSync(out, renderPost(post));
}

const indexBody = `
  <h1>News & Updates</h1>
  <p>Announcements, drops, and promos from GMF Productions.</p>
  <div style="margin-top:2rem;display:grid;gap:1rem;">
    ${
      posts.length
        ? posts
            .map(
              (p) => `
      <a href="posts/${escapeHtml(p.slug)}.html" style="display:block;padding:1.25rem;border:1px solid #2b2b2b;border-radius:10px;text-decoration:none;color:inherit;">
        <p style="color:#10b981;text-transform:uppercase;letter-spacing:0.12em;font-size:0.75rem;margin:0 0 0.35rem;">${p.type === 'promo' ? 'Promo' : 'News'}</p>
        <h2 style="margin:0 0 0.35rem;font-size:1.4rem;">${escapeHtml(p.title)}</h2>
        <p style="color:#a7a7a7;margin:0;">${escapeHtml(p.summary || '')}</p>
      </a>`
            )
            .join('')
        : '<p style="color:#a7a7a7;">No posts yet. Create one in the Site Editor.</p>'
    }
  </div>
`;

const newsPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>News | GMF Productions</title>
  <meta name="description" content="News, drops, and promos from GMF Productions." />
  <link rel="stylesheet" href="styles/main.css" />
</head>
<body>
  <div class="announcement-bar">Free U.S. shipping on orders over $100</div>
  <header>
    <div class="container header-inner">
      <a href="index.html" class="brand">GMF Productions</a>
      <nav class="nav-links">
        <a href="shop.html">Shop</a>
        <a href="about.html">About</a>
        <a href="music.html">Music</a>
        <a href="news.html" class="active">News</a>
        <a href="booking.html">Booking</a>
        <a href="contact.html">Contact</a>
        <a href="cart.html">Cart</a>
      </nav>
    </div>
  </header>
  <main class="container" style="padding-top:2rem;padding-bottom:3rem;max-width:800px;">
    ${indexBody}
  </main>
  <footer>
    <div class="container">
      <div class="footer-bottom">
        <span>&copy; 2026 GMF Productions. All rights reserved.</span>
      </div>
    </div>
  </footer>
  <script src="scripts/content-loader.js"></script>
</body>
</html>
`;

fs.writeFileSync(NEWS_HTML, newsPage);
console.log(`[build-posts] Wrote ${posts.length} post page(s) + news.html`);
