/**
 * GMF Productions — task-based Site Editor
 */
(function () {
  const PATHS = {
    site: 'gmf-site/content/site.json',
    media: 'gmf-site/content/media.json',
    manifest: 'gmf-site/content/design-manifest.json',
    home: 'gmf-site/content/pages/home.json',
    shop: 'gmf-site/content/pages/shop.json',
    about: 'gmf-site/content/pages/about.json',
    booking: 'gmf-site/content/pages/booking.json',
    contact: 'gmf-site/content/pages/contact.json',
    music: 'gmf-site/content/pages/music.json',
    shipping: 'gmf-site/content/policies/shipping.json',
    returns: 'gmf-site/content/policies/returns.json',
    postsDir: 'gmf-site/content/pages/posts',
  };

  const TASKS = [
    { id: 'prices', label: 'Change Prices', hint: 'Tee, shorts & hat prices' },
    { id: 'catalog', label: 'Edit Catalog', hint: 'Names, taglines, garments' },
    { id: 'media', label: 'Featured Video & Music', hint: 'YouTube, tracks, Spotify' },
    { id: 'home', label: 'Homepage Text', hint: 'Hero, about, merch heading' },
    { id: 'shop', label: 'Shop Page Text', hint: 'Shop intro & heading' },
    { id: 'about', label: 'About Page', hint: 'Full about story' },
    { id: 'booking', label: 'Booking Text', hint: 'Booking page intro' },
    { id: 'contact', label: 'Contact Text', hint: 'Contact page intro' },
    { id: 'policies', label: 'Policies', hint: 'Shipping & returns' },
    { id: 'site', label: 'Site Settings', hint: 'Announcement bar & email' },
    { id: 'images', label: 'Photos & Images', hint: 'Hero background & uploads' },
    { id: 'posts', label: 'Add a New Page', hint: 'News / promo pages' },
  ];

  let activeTask = null;
  let cache = {};

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function showStatus(msg, type = '') {
    const bar = $('#status-bar');
    bar.textContent = msg;
    bar.className = 'status-bar' + (type ? ' ' + type : '');
    bar.classList.remove('hidden');
  }

  function clearStatusSoon() {
    setTimeout(() => $('#status-bar').classList.add('hidden'), 5000);
  }

  function centsToDollars(cents) {
    return (Number(cents) / 100).toFixed(2);
  }

  function dollarsToCents(val) {
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (Number.isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  function extractYoutubeId(input) {
    if (!input) return '';
    const s = String(input).trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : s;
  }

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'page-' + Date.now();
  }

  async function loadJson(key) {
    if (cache[key]) return cache[key];
    const result = await GMF_GIT.getJson(PATHS[key]);
    cache[key] = result;
    return result;
  }

  async function saveJson(key, data, message) {
    showStatus('Saving… publishing to your live site…');
    const prev = cache[key];
    const res = await GMF_GIT.putJson(PATHS[key], data, message, prev && prev.sha);
    cache[key] = {
      data,
      sha: res.content && res.content.sha,
      path: PATHS[key],
    };
    showStatus('Saved! Your site is rebuilding now — usually live in about 90 seconds.', 'ok');
    clearStatusSoon();
    return res;
  }

  function field(label, inputHtml, hint) {
    return `<div class="field"><label>${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label>${inputHtml}</div>`;
  }

  function renderNav() {
    const nav = $('#task-nav');
    nav.innerHTML = TASKS.map(
      (t) =>
        `<button type="button" class="task-btn${activeTask === t.id ? ' active' : ''}" data-task="${t.id}">
          ${t.label}<small>${t.hint}</small>
        </button>`
    ).join('');
    $$('.task-btn', nav).forEach((btn) => {
      btn.addEventListener('click', () => openTask(btn.dataset.task));
    });
  }

  async function openTask(id) {
    activeTask = id;
    renderNav();
    const panel = $('#editor-panel');
    panel.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const renderer = RENDERERS[id];
      if (!renderer) throw new Error('Unknown task');
      await renderer(panel);
    } catch (e) {
      const msg = e.message || String(e);
      const tip = /operator microservice|role doesn't allow|Sign in|expired/i.test(msg)
        ? 'Sign Out, refresh the page, then Sign In again. That usually clears this.'
        : 'If this keeps happening, tell Chris.';
      panel.innerHTML = `<div class="card"><p class="error">${escapeHtml(msg)}</p>
        <p class="muted">${tip}</p></div>`;
      showStatus(msg, 'error');
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Task renderers ─────────────────────────────────────────────

  const RENDERERS = {
    async prices(panel) {
      const { data } = await loadJson('manifest');
      const p = data.pricing || { tee: 2500, shorts: 3500, hat: 2500 };
      panel.innerHTML = `
        <div class="card">
          <h2>Change Prices</h2>
          <p class="muted">Enter prices in dollars. Example: 25 for $25.00. Saving updates the shop and Stripe checkout automatically.</p>
          <div class="row">
            ${field('T-Shirt price ($)', `<input id="price-tee" type="number" min="1" step="0.01" value="${centsToDollars(p.tee)}" />`)}
            ${field('Shorts price ($)', `<input id="price-shorts" type="number" min="1" step="0.01" value="${centsToDollars(p.shorts)}" />`)}
            ${field('Hat price ($)', `<input id="price-hat" type="number" min="1" step="0.01" value="${centsToDollars(p.hat)}" />`)}
          </div>
          <div class="actions">
            <button class="btn btn-primary" id="save-prices">Save & Publish</button>
          </div>
        </div>`;
      $('#save-prices').onclick = async () => {
        try {
          data.pricing = {
            tee: dollarsToCents($('#price-tee').value),
            shorts: dollarsToCents($('#price-shorts').value),
            hat: dollarsToCents($('#price-hat').value),
            currency: 'USD',
          };
          await saveJson('manifest', data, 'Update store prices');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async catalog(panel) {
      const { data } = await loadJson('manifest');
      panel.innerHTML = `
        <div class="card">
          <h2>Edit Catalog</h2>
          <p class="muted">Click a design to edit its name, tagline, or which products it appears on. Upload a new design image if you want to replace the artwork.</p>
          <div id="design-list"></div>
          <div class="actions">
            <button class="btn btn-primary" id="save-catalog">Save & Publish</button>
            <button class="btn btn-ghost" id="add-design">Add New Design</button>
          </div>
        </div>`;
      const list = $('#design-list');
      function renderList() {
        list.innerHTML = data.designs
          .map(
            (d, i) => `
          <details class="design-item" data-i="${i}">
            <summary>${escapeHtml(d.name)} <span class="muted">— ${(d.garments || []).join(', ')}</span></summary>
            <div style="margin-top:1rem">
              ${field('Product name', `<input data-f="name" type="text" value="${escapeHtml(d.name)}" />`)}
              ${field('Tagline / description', `<textarea data-f="tagline">${escapeHtml(d.tagline || '')}</textarea>`)}
              ${field('Available on', `
                <div class="checks">
                  <label><input type="checkbox" data-g="tee" ${d.garments.includes('tee') ? 'checked' : ''}/> T-Shirt</label>
                  <label><input type="checkbox" data-g="shorts" ${d.garments.includes('shorts') ? 'checked' : ''}/> Shorts</label>
                  <label><input type="checkbox" data-g="hat" ${d.garments.includes('hat') ? 'checked' : ''}/> Hat</label>
                </div>`)}
              ${field('Replace design image', `<input data-f="file" type="file" accept="image/*" />`, 'Optional. PNG or JPG works best.')}
              <button type="button" class="btn btn-danger" data-remove="${i}">Remove design</button>
            </div>
          </details>`
          )
          .join('');
        $$('[data-remove]', list).forEach((btn) => {
          btn.onclick = () => {
            if (!confirm('Remove this design from the catalog?')) return;
            data.designs.splice(Number(btn.dataset.remove), 1);
            renderList();
          };
        });
      }
      renderList();

      $('#add-design').onclick = () => {
        const name = prompt('New design name:');
        if (!name) return;
        data.designs.push({
          slug: slugify(name),
          name,
          tagline: '',
          source: '',
          primaryColor: 'black',
          garments: ['tee'],
        });
        renderList();
      };

      $('#save-catalog').onclick = async () => {
        try {
          $$('.design-item', list).forEach((el) => {
            const i = Number(el.dataset.i);
            const d = data.designs[i];
            if (!d) return;
            d.name = $('[data-f="name"]', el).value.trim();
            d.tagline = $('[data-f="tagline"]', el).value.trim();
            d.garments = $$('[data-g]', el)
              .filter((c) => c.checked)
              .map((c) => c.dataset.g);
            if (!d.slug) d.slug = slugify(d.name);
          });

          // Upload any selected images first
          for (const el of $$('.design-item', list)) {
            const i = Number(el.dataset.i);
            const d = data.designs[i];
            const fileInput = $('[data-f="file"]', el);
            const file = fileInput && fileInput.files && fileInput.files[0];
            if (!file || !d) continue;
            const ext = (file.name.split('.').pop() || 'png').toLowerCase();
            const dest = `gmf-site/assets/designs/${d.slug}.${ext === 'jpg' ? 'jpg' : ext === 'jpeg' ? 'jpg' : 'png'}`;
            showStatus('Uploading image for ' + d.name + '…');
            let sha;
            try {
              const existing = await GMF_GIT.getFile(dest);
              sha = existing.sha;
            } catch (_) {}
            await GMF_GIT.putBinary(dest, await file.arrayBuffer(), 'Upload design image: ' + d.slug, sha);
            d.source = dest.split('/').pop();
            // Flag for mockup regen
            d.needsMockup = true;
          }

          await saveJson('manifest', data, 'Update product catalog');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async media(panel) {
      const { data } = await loadJson('media');
      const hero = data.hero || {};
      const fv = hero.featuredVideo || {};
      const ft = hero.featuredTrack || {};
      panel.innerHTML = `
        <div class="card">
          <h2>Featured Video & Music</h2>
          ${field('Featured YouTube video', `<input id="yt-url" type="text" value="${escapeHtml(fv.youtubeId || fv.embedUrl || '')}" placeholder="Paste a YouTube link or video ID" />`, 'Paste any YouTube link — we extract the ID automatically.')}
          ${field('Video title', `<input id="yt-title" type="text" value="${escapeHtml(fv.title || '')}" />`)}
          ${field('Video subtitle', `<input id="yt-sub" type="text" value="${escapeHtml(fv.subtitle || '')}" />`)}
          ${field('Featured track title', `<input id="track-title" type="text" value="${escapeHtml(ft.title || '')}" />`)}
          ${field('Spotify artist ID', `<input id="spotify-id" type="text" value="${escapeHtml(ft.spotifyArtistId || '')}" />`, 'From open.spotify.com/artist/XXXX')}
          ${field('Track description', `<textarea id="track-desc">${escapeHtml(ft.description || '')}</textarea>`)}
          <h3 style="margin-top:1.5rem">Top Tracks</h3>
          <div id="tracks-editor"></div>
          <button type="button" class="btn btn-ghost" id="add-track">Add Track</button>
          <div class="actions">
            <button class="btn btn-primary" id="save-media">Save & Publish</button>
          </div>
        </div>`;

      const tracks = data.tracks || [];
      const tracksEl = $('#tracks-editor');
      function renderTracks() {
        tracksEl.innerHTML = tracks
          .map(
            (t, i) => `
          <div class="design-item" data-i="${i}">
            ${field('Title', `<input data-f="title" type="text" value="${escapeHtml(t.title || '')}" />`)}
            ${field('YouTube ID or Spotify search', `<input data-f="link" type="text" value="${escapeHtml(t.youtubeId || t.spotifySearch || '')}" />`)}
            <label><input type="checkbox" data-f="featured" ${t.featured ? 'checked' : ''}/> Featured</label>
            <button type="button" class="btn btn-danger" data-rm="${i}">Remove</button>
          </div>`
          )
          .join('');
        $$('[data-rm]', tracksEl).forEach((b) => {
          b.onclick = () => {
            tracks.splice(Number(b.dataset.rm), 1);
            renderTracks();
          };
        });
      }
      renderTracks();
      $('#add-track').onclick = () => {
        tracks.push({ title: 'New Track', spotifySearch: 'GMF Productions' });
        renderTracks();
      };

      $('#save-media').onclick = async () => {
        try {
          const id = extractYoutubeId($('#yt-url').value);
          data.hero = data.hero || {};
          data.hero.featuredVideo = {
            youtubeId: id,
            title: $('#yt-title').value.trim(),
            subtitle: $('#yt-sub').value.trim(),
            embedUrl: id ? `https://www.youtube.com/embed/${id}` : '',
            thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '',
          };
          data.hero.featuredTrack = {
            title: $('#track-title').value.trim(),
            spotifyArtistId: $('#spotify-id').value.trim(),
            description: $('#track-desc').value.trim(),
          };
          data.hero.tagline = data.hero.tagline || `Watch the official video for "${data.hero.featuredVideo.title}" — out now.`;
          data.hero.backgroundImage = id
            ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
            : data.hero.backgroundImage;

          data.tracks = $$('.design-item', tracksEl).map((el) => {
            const title = $('[data-f="title"]', el).value.trim();
            const link = $('[data-f="link"]', el).value.trim();
            const featured = $('[data-f="featured"]', el).checked;
            const yt = extractYoutubeId(link);
            const isYt = /^[\w-]{11}$/.test(yt) && (link.includes('youtu') || link.length === 11);
            const row = { title, featured };
            if (isYt) row.youtubeId = yt;
            else row.spotifySearch = link;
            return row;
          });

          // Keep videos list in sync with featured
          if (id) {
            data.videos = data.videos || [];
            const main = {
              id,
              title: data.hero.featuredVideo.title + ' (Official Music Video)',
              embedUrl: data.hero.featuredVideo.embedUrl,
              thumbnail: data.hero.featuredVideo.thumbnail,
              type: 'video',
            };
            const rest = data.videos.filter((v) => v.type === 'channel' || v.id !== id);
            data.videos = [main, ...rest];
          }

          await saveJson('media', data, 'Update featured video and music');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async home(panel) {
      const { data } = await loadJson('home');
      const hero = data.hero || {};
      const about = data.about || { paragraphs: [] };
      panel.innerHTML = `
        <div class="card">
          <h2>Homepage Text</h2>
          ${field('Eyebrow (small green text)', `<input id="h-eyebrow" type="text" value="${escapeHtml(hero.eyebrow || '')}" />`)}
          ${field('Headline', `<input id="h-headline" type="text" value="${escapeHtml(hero.headline || '')}" />`)}
          ${field('Tagline', `<textarea id="h-tagline">${escapeHtml(hero.tagline || '')}</textarea>`, 'You can use basic HTML like &lt;strong&gt;.')}
          ${field('Primary button label', `<input id="h-primary" type="text" value="${escapeHtml((hero.primaryCta && hero.primaryCta.label) || '')}" />`)}
          ${field('Secondary button label', `<input id="h-secondary" type="text" value="${escapeHtml((hero.secondaryCta && hero.secondaryCta.label) || '')}" />`)}
          ${field('About heading', `<input id="h-about-h" type="text" value="${escapeHtml(about.heading || '')}" />`)}
          ${field('About paragraph 1', `<textarea id="h-about-1">${escapeHtml((about.paragraphs && about.paragraphs[0]) || '')}</textarea>`)}
          ${field('About paragraph 2', `<textarea id="h-about-2">${escapeHtml((about.paragraphs && about.paragraphs[1]) || '')}</textarea>`)}
          ${field('Merch section heading', `<input id="h-merch" type="text" value="${escapeHtml((data.merchSection && data.merchSection.heading) || '')}" />`)}
          <div class="actions"><button class="btn btn-primary" id="save-home">Save & Publish</button></div>
        </div>`;
      $('#save-home').onclick = async () => {
        try {
          data.hero = {
            ...hero,
            eyebrow: $('#h-eyebrow').value.trim(),
            headline: $('#h-headline').value.trim(),
            tagline: $('#h-tagline').value.trim(),
            primaryCta: { ...(hero.primaryCta || {}), label: $('#h-primary').value.trim(), href: (hero.primaryCta && hero.primaryCta.href) || '#music' },
            secondaryCta: { ...(hero.secondaryCta || {}), label: $('#h-secondary').value.trim(), href: (hero.secondaryCta && hero.secondaryCta.href) || '#merch' },
          };
          data.about = {
            heading: $('#h-about-h').value.trim(),
            paragraphs: [$('#h-about-1').value.trim(), $('#h-about-2').value.trim()].filter(Boolean),
          };
          data.merchSection = {
            ...(data.merchSection || {}),
            heading: $('#h-merch').value.trim(),
            subtitle: (data.merchSection && data.merchSection.subtitle) || '',
          };
          await saveJson('home', data, 'Update homepage text');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async shop(panel) {
      await simplePageEditor(panel, 'shop', 'Shop Page Text');
    },
    async booking(panel) {
      await simplePageEditor(panel, 'booking', 'Booking Text');
    },
    async contact(panel) {
      await simplePageEditor(panel, 'contact', 'Contact Text');
    },

    async about(panel) {
      const { data } = await loadJson('about');
      panel.innerHTML = `
        <div class="card">
          <h2>About Page</h2>
          ${field('Page heading', `<input id="a-heading" type="text" value="${escapeHtml(data.heading || '')}" />`)}
          ${field('Intro paragraph 1', `<textarea id="a-i1">${escapeHtml((data.intro && data.intro[0]) || '')}</textarea>`)}
          ${field('Intro paragraph 2', `<textarea id="a-i2">${escapeHtml((data.intro && data.intro[1]) || '')}</textarea>`)}
          <div id="about-secs"></div>
          <button type="button" class="btn btn-ghost" id="add-sec">Add Section</button>
          <div class="actions"><button class="btn btn-primary" id="save-about">Save & Publish</button></div>
        </div>`;
      const sections = data.sections || [];
      const host = $('#about-secs');
      function renderSecs() {
        host.innerHTML = sections
          .map(
            (s, i) => `
          <div class="design-item" data-i="${i}">
            ${field('Section heading', `<input data-f="h" type="text" value="${escapeHtml(s.heading || '')}" />`)}
            ${field('Section text', `<textarea data-f="b">${escapeHtml(s.body || '')}</textarea>`)}
            <button type="button" class="btn btn-danger" data-rm="${i}">Remove</button>
          </div>`
          )
          .join('');
        $$('[data-rm]', host).forEach((b) => {
          b.onclick = () => {
            sections.splice(Number(b.dataset.rm), 1);
            renderSecs();
          };
        });
      }
      renderSecs();
      $('#add-sec').onclick = () => {
        sections.push({ heading: 'New Section', body: '' });
        renderSecs();
      };
      $('#save-about').onclick = async () => {
        try {
          data.heading = $('#a-heading').value.trim();
          data.intro = [$('#a-i1').value.trim(), $('#a-i2').value.trim()].filter(Boolean);
          data.sections = $$('.design-item', host).map((el) => ({
            heading: $('[data-f="h"]', el).value.trim(),
            body: $('[data-f="b"]', el).value.trim(),
          }));
          await saveJson('about', data, 'Update about page');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async policies(panel) {
      const ship = await loadJson('shipping');
      const ret = await loadJson('returns');
      panel.innerHTML = `
        <div class="card">
          <h2>Policies</h2>
          ${field('Shipping policy title', `<input id="s-title" type="text" value="${escapeHtml(ship.data.title || '')}" />`)}
          ${field('Shipping policy text', `<textarea id="s-body" style="min-height:160px">${escapeHtml(ship.data.body || '')}</textarea>`, 'You can use simple HTML like &lt;p&gt; and &lt;a href&gt;.')}
          ${field('Returns policy title', `<input id="r-title" type="text" value="${escapeHtml(ret.data.title || '')}" />`)}
          ${field('Returns policy text', `<textarea id="r-body" style="min-height:160px">${escapeHtml(ret.data.body || '')}</textarea>`)}
          <div class="actions"><button class="btn btn-primary" id="save-pol">Save & Publish</button></div>
        </div>`;
      $('#save-pol').onclick = async () => {
        try {
          ship.data.title = $('#s-title').value.trim();
          ship.data.body = $('#s-body').value.trim();
          ret.data.title = $('#r-title').value.trim();
          ret.data.body = $('#r-body').value.trim();
          showStatus('Saving shipping policy…');
          await GMF_GIT.putJson(PATHS.shipping, ship.data, 'Update shipping policy', ship.sha);
          cache.shipping = { data: ship.data, sha: null, path: PATHS.shipping };
          // refresh sha by re-reading after first write is awkward; just write returns next
          const retFresh = await GMF_GIT.getJson(PATHS.returns);
          await GMF_GIT.putJson(PATHS.returns, ret.data, 'Update returns policy', retFresh.sha);
          cache.returns = { data: ret.data, sha: null, path: PATHS.returns };
          // invalidate so next load gets fresh sha
          delete cache.shipping;
          delete cache.returns;
          showStatus('Saved! Your site is rebuilding now — usually live in about 90 seconds.', 'ok');
          clearStatusSoon();
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async site(panel) {
      const { data } = await loadJson('site');
      panel.innerHTML = `
        <div class="card">
          <h2>Site Settings</h2>
          ${field('Announcement bar (top of most pages)', `<input id="ann" type="text" value="${escapeHtml(data.announcement || '')}" />`)}
          ${field('Support email', `<input id="email" type="email" value="${escapeHtml(data.supportEmail || '')}" />`)}
          ${field('Footer tagline', `<input id="ft" type="text" value="${escapeHtml(data.footerTagline || '')}" />`)}
          ${field('Instagram URL', `<input id="ig" type="url" value="${escapeHtml((data.social && data.social.instagram) || '')}" />`)}
          ${field('TikTok URL', `<input id="tt" type="url" value="${escapeHtml((data.social && data.social.tiktok) || '')}" />`)}
          ${field('YouTube URL', `<input id="yt" type="url" value="${escapeHtml((data.social && data.social.youtube) || '')}" />`)}
          <div class="actions"><button class="btn btn-primary" id="save-site">Save & Publish</button></div>
        </div>`;
      $('#save-site').onclick = async () => {
        try {
          data.announcement = $('#ann').value.trim();
          data.supportEmail = $('#email').value.trim();
          data.footerTagline = $('#ft').value.trim();
          data.social = {
            ...(data.social || {}),
            instagram: $('#ig').value.trim(),
            tiktok: $('#tt').value.trim(),
            youtube: $('#yt').value.trim(),
          };
          await saveJson('site', data, 'Update site settings');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async images(panel) {
      const media = await loadJson('media');
      panel.innerHTML = `
        <div class="card">
          <h2>Photos & Images</h2>
          <p class="muted">Update the homepage hero background, or upload a general site image.</p>
          ${field('Hero background image URL', `<input id="bg" type="text" value="${escapeHtml((media.data.hero && media.data.hero.backgroundImage) || '')}" />`, 'Paste an image URL, or leave blank to use the featured video thumbnail.')}
          ${field('Upload a new image to the site', `<input id="up" type="file" accept="image/*" />`, 'Saved under /assets/uploads/')}
          <div class="actions">
            <button class="btn btn-primary" id="save-img">Save & Publish</button>
          </div>
          <p id="upload-result" class="muted"></p>
        </div>`;
      $('#save-img').onclick = async () => {
        try {
          const file = $('#up').files && $('#up').files[0];
          if (file) {
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
            const dest = `gmf-site/assets/uploads/${Date.now()}-${safe}`;
            showStatus('Uploading image…');
            await GMF_GIT.putBinary(dest, await file.arrayBuffer(), 'Upload site image: ' + safe);
            const publicUrl = '/assets/uploads/' + dest.split('/').pop();
            $('#upload-result').textContent = 'Uploaded: ' + publicUrl;
            if (!$('#bg').value) $('#bg').value = publicUrl;
          }
          media.data.hero = media.data.hero || {};
          media.data.hero.backgroundImage = $('#bg').value.trim();
          await saveJson('media', media.data, 'Update hero background image');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },

    async posts(panel) {
      let files = [];
      try {
        files = await GMF_GIT.listDir(PATHS.postsDir);
      } catch (_) {
        files = [];
      }
      const posts = files.filter((f) => f.name && f.name.endsWith('.json'));
      panel.innerHTML = `
        <div class="card">
          <h2>Add a New Page</h2>
          <p class="muted">Create a News/Blog post or a Promo page. It will appear under /posts/ on your site after publishing.</p>
          <ul class="post-list" id="post-list">
            ${
              posts.length
                ? posts
                    .map(
                      (p) =>
                        `<li><span>${escapeHtml(p.name.replace(/\.json$/, ''))}</span>
                        <a class="btn btn-ghost" href="/posts/${encodeURIComponent(p.name.replace(/\.json$/, ''))}.html" target="_blank">View</a></li>`
                    )
                    .join('')
                : '<li class="muted">No pages yet — create your first one below.</li>'
            }
          </ul>
          ${field('Page type', `<select id="p-type"><option value="news">News / Blog</option><option value="promo">Promo</option></select>`)}
          ${field('Title', `<input id="p-title" type="text" placeholder="Summer Drop Announcement" />`)}
          ${field('Short summary', `<input id="p-summary" type="text" placeholder="One sentence preview" />`)}
          ${field('Body text', `<textarea id="p-body" style="min-height:180px" placeholder="Write your page content here…"></textarea>`)}
          ${field('Optional YouTube video', `<input id="p-yt" type="text" placeholder="Paste YouTube link" />`)}
          ${field('Optional image URL', `<input id="p-img" type="text" placeholder="/assets/uploads/..." />`)}
          <div class="actions"><button class="btn btn-primary" id="create-post">Create & Publish</button></div>
        </div>`;
      $('#create-post').onclick = async () => {
        try {
          const title = $('#p-title').value.trim();
          if (!title) throw new Error('Please enter a title');
          const slug = slugify(title);
          const path = `${PATHS.postsDir}/${slug}.json`;
          const post = {
            type: $('#p-type').value,
            title,
            slug,
            summary: $('#p-summary').value.trim(),
            body: $('#p-body').value.trim(),
            youtubeId: extractYoutubeId($('#p-yt').value) || '',
            image: $('#p-img').value.trim(),
            publishedAt: new Date().toISOString().slice(0, 10),
          };
          showStatus('Creating page…');
          await GMF_GIT.putJson(path, post, 'Add page: ' + title);
          showStatus('Page created! Site is rebuilding — live in about 90 seconds.', 'ok');
          clearStatusSoon();
          openTask('posts');
        } catch (e) {
          showStatus(e.message, 'error');
        }
      };
    },
  };

  async function simplePageEditor(panel, key, title) {
    const { data } = await loadJson(key);
    panel.innerHTML = `
      <div class="card">
        <h2>${title}</h2>
        ${field('Heading', `<input id="sp-h" type="text" value="${escapeHtml(data.heading || '')}" />`)}
        ${field('Intro text', `<textarea id="sp-i">${escapeHtml(data.intro || '')}</textarea>`, key === 'contact' ? 'You can include an email link with HTML.' : '')}
        ${key === 'music' ? field('Music page announcement bar', `<input id="sp-a" type="text" value="${escapeHtml(data.announcement || '')}" />`) : ''}
        <div class="actions"><button class="btn btn-primary" id="save-sp">Save & Publish</button></div>
      </div>`;
    $('#save-sp').onclick = async () => {
      try {
        data.heading = $('#sp-h').value.trim();
        data.intro = $('#sp-i').value.trim();
        if ($('#sp-a')) data.announcement = $('#sp-a').value.trim();
        await saveJson(key, data, 'Update ' + key + ' page text');
      } catch (e) {
        showStatus(e.message, 'error');
      }
    };
  }

  // ─── Auth ───────────────────────────────────────────────────────

  async function showApp(user) {
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#user-email').textContent = user.email || '';
    // Refresh JWT so expired sessions don't hit broken Git Gateway errors
    try {
      if (user && typeof user.jwt === 'function') await user.jwt(true);
    } catch (_) {
      showLogin('Your login expired. Please sign in again.');
      try { netlifyIdentity.logout(); } catch (__) {}
      return;
    }
    renderNav();
    openTask('prices');
  }

  function showLogin(err) {
    $('#app').classList.add('hidden');
    $('#login-screen').classList.remove('hidden');
    const box = $('#login-error');
    if (err) {
      box.textContent = err;
      box.classList.remove('hidden');
    } else {
      box.classList.add('hidden');
    }
  }

  function initAuth() {
    if (!window.netlifyIdentity) {
      showLogin('Netlify Identity failed to load. Refresh the page.');
      return;
    }
    netlifyIdentity.on('init', (user) => {
      if (user) showApp(user);
      else showLogin();
    });
    netlifyIdentity.on('login', (user) => {
      netlifyIdentity.close();
      showApp(user);
    });
    netlifyIdentity.on('logout', () => {
      cache = {};
      showLogin();
    });
    netlifyIdentity.on('error', (err) => {
      const msg = (err && err.message) || String(err);
      if (/operator microservice/i.test(msg)) {
        showLogin('Connection glitch. Sign out, refresh this page, then sign in again.');
      } else {
        showLogin(msg);
      }
    });
    netlifyIdentity.init();

    $('#btn-login').onclick = () => netlifyIdentity.open('login');
    $('#btn-logout').onclick = () => netlifyIdentity.logout();
  }

  initAuth();
})();
