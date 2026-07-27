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
    { id: 'catalog', label: 'Edit Catalog', hint: 'Names, taglines, mockup style' },
    { id: 'media', label: 'Featured Video & Music', hint: 'YouTube, tracks, Spotify' },
    { id: 'home', label: 'Homepage Text', hint: 'Hero, about, merch heading' },
    { id: 'shop', label: 'Shop Page Text', hint: 'Shop intro & heading' },
    { id: 'about', label: 'About Page', hint: 'Full about story' },
    { id: 'booking', label: 'Booking Text', hint: 'Booking page intro' },
    { id: 'contact', label: 'Contact Text', hint: 'Contact page intro' },
    { id: 'policies', label: 'Policies', hint: 'Shipping & returns' },
    { id: 'site', label: 'Site Settings', hint: 'Announcement bar & email' },
    { id: 'images', label: 'Background & Homepage Merch', hint: 'Site background + 3 featured products' },
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
          <p class="muted">Click a design to edit its name, tagline, or which products it appears on. When you upload an image, choose how it should appear in the shop — on stock black garments, on a colored background, or exactly as uploaded.</p>
          <div id="design-list"></div>
          <div class="actions">
            <button class="btn btn-primary" id="save-catalog">Save & Publish</button>
            <button class="btn btn-ghost" id="add-design">Add New Design</button>
          </div>
        </div>`;
      const list = $('#design-list');
      const MOCKUP_MODES = [
        { value: 'stock', label: 'Stock designs', hint: 'Place artwork on black tee / shorts / hat photos' },
        { value: 'colorBg', label: 'Colored background', hint: 'Show artwork on a solid color background (not on clothes)' },
        { value: 'asIs', label: 'Use image as-is', hint: 'Keep your upload exactly as the product photo — no auto-placement' },
      ];
      const BG_PRESETS = [
        { value: '#111111', label: 'Black' },
        { value: '#ffffff', label: 'White' },
        { value: '#1a1a1a', label: 'Charcoal' },
        { value: '#d4af37', label: 'Gold' },
        { value: '#6b21a8', label: 'Violet' },
        { value: '#0f766e', label: 'Teal' },
      ];

      function modeLabel(mode) {
        if (mode === 'colorBg') return 'colored bg';
        if (mode === 'asIs') return 'as-is';
        return 'stock';
      }

      function normalizeMode(mode) {
        return mode === 'colorBg' || mode === 'asIs' ? mode : 'stock';
      }

      function bindModeToggles(root) {
        $$('.design-item', root).forEach((el) => {
          const update = () => {
            const mode = ($('[data-f="mockupMode"]:checked', el) || {}).value || 'stock';
            const bgField = $('[data-bg-field]', el);
            if (bgField) bgField.hidden = mode !== 'colorBg';
            const garmentsField = $('[data-garments-field]', el);
            if (garmentsField) {
              const hint = $('[data-garments-hint]', garmentsField);
              if (hint) {
                hint.textContent =
                  mode === 'stock'
                    ? 'Artwork will be placed on the selected black stock garment photos.'
                    : 'Still chooses which products this design sells as. The product photo will not be placed onto clothes.';
              }
            }
          };
          $$('[data-f="mockupMode"]', el).forEach((input) => {
            input.onchange = update;
          });
          update();
        });
      }

      function renderList() {
        list.innerHTML = data.designs
          .map((d, i) => {
            const mode = normalizeMode(d.mockupMode);
            const bg = d.backgroundColor || d.primaryColor || '#111111';
            const bgHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(bg)
              ? bg
              : bg === 'black'
                ? '#111111'
                : bg === 'white'
                  ? '#ffffff'
                  : '#111111';
            return `
          <details class="design-item" data-i="${i}">
            <summary>${escapeHtml(d.name)} <span class="muted">— ${(d.garments || []).join(', ') || 'no garments'} · ${modeLabel(mode)}</span></summary>
            <div style="margin-top:1rem">
              ${field('Product name', `<input data-f="name" type="text" value="${escapeHtml(d.name)}" />`)}
              ${field('Tagline / description', `<textarea data-f="tagline">${escapeHtml(d.tagline || '')}</textarea>`)}
              ${field(
                'How should this image appear?',
                `<div class="mode-options">
                  ${MOCKUP_MODES.map(
                    (m) => `
                    <label class="mode-option">
                      <input type="radio" name="mockupMode-${i}" data-f="mockupMode" value="${m.value}" ${mode === m.value ? 'checked' : ''}/>
                      <span>
                        <strong>${m.label}</strong>
                        <span class="hint">${m.hint}</span>
                      </span>
                    </label>`
                  ).join('')}
                </div>`,
                'Choose before uploading. Stock designs place artwork on black clothes. Colored background and as-is leave clothes out of the photo.'
              )}
              <div data-bg-field ${mode === 'colorBg' ? '' : 'hidden'}>
                ${field(
                  'Background color',
                  `<div class="bg-color-row">
                    <input data-f="backgroundColor" type="color" value="${escapeHtml(bgHex)}" />
                    <select data-f="backgroundPreset">
                      ${BG_PRESETS.map(
                        (p) =>
                          `<option value="${p.value}" ${p.value.toLowerCase() === bgHex.toLowerCase() ? 'selected' : ''}>${p.label}</option>`
                      ).join('')}
                      <option value="custom">Custom</option>
                    </select>
                  </div>`,
                  'Used only for Colored background mode.'
                )}
              </div>
              <div data-garments-field>
                ${field(
                  'Available on',
                  `<div class="checks">
                    <label><input type="checkbox" data-g="tee" ${(d.garments || []).includes('tee') ? 'checked' : ''}/> T-Shirt</label>
                    <label><input type="checkbox" data-g="shorts" ${(d.garments || []).includes('shorts') ? 'checked' : ''}/> Shorts</label>
                    <label><input type="checkbox" data-g="hat" ${(d.garments || []).includes('hat') ? 'checked' : ''}/> Hat</label>
                  </div>
                  <span class="hint" data-garments-hint></span>`
                )}
              </div>
              ${field('Replace design image', `<input data-f="file" type="file" accept="image/*" />`, 'Optional. PNG or JPG works best. Pair with the appearance choice above.')}
              <button type="button" class="btn btn-danger" data-remove="${i}">Remove design</button>
            </div>
          </details>`;
          })
          .join('');
        $$('[data-remove]', list).forEach((btn) => {
          btn.onclick = () => {
            if (!confirm('Remove this design from the catalog?')) return;
            data.designs.splice(Number(btn.dataset.remove), 1);
            renderList();
          };
        });
        $$('[data-f="backgroundPreset"]', list).forEach((sel) => {
          sel.onchange = () => {
            if (sel.value === 'custom') return;
            const colorInput = $('[data-f="backgroundColor"]', sel.closest('[data-bg-field]'));
            if (colorInput) colorInput.value = sel.value;
          };
        });
        $$('[data-f="backgroundColor"]', list).forEach((input) => {
          input.oninput = () => {
            const sel = $('[data-f="backgroundPreset"]', input.closest('[data-bg-field]'));
            if (!sel) return;
            const match = BG_PRESETS.some((p) => p.value.toLowerCase() === input.value.toLowerCase());
            sel.value = match ? input.value : 'custom';
          };
        });
        bindModeToggles(list);
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
          mockupMode: 'stock',
          backgroundColor: '#111111',
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
            const prevMode = normalizeMode(d.mockupMode);
            const prevBg = d.backgroundColor || '';
            d.name = $('[data-f="name"]', el).value.trim();
            d.tagline = $('[data-f="tagline"]', el).value.trim();
            d.garments = $$('[data-g]', el)
              .filter((c) => c.checked)
              .map((c) => c.dataset.g);
            const modeInput = $('[data-f="mockupMode"]:checked', el);
            d.mockupMode = normalizeMode(modeInput && modeInput.value);
            const bgInput = $('[data-f="backgroundColor"]', el);
            if (bgInput && bgInput.value) {
              d.backgroundColor = bgInput.value;
              if (d.mockupMode === 'colorBg') d.primaryColor = bgInput.value;
            }
            if (!d.slug) d.slug = slugify(d.name);
            if (prevMode !== d.mockupMode || (d.mockupMode === 'colorBg' && prevBg !== (d.backgroundColor || ''))) {
              d.needsMockup = true;
            }
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
      let manifest = { designs: [] };
      try {
        const m = await loadJson('manifest');
        manifest = m.data || { designs: [] };
      } catch (_) {}

      const productOptions = [];
      (manifest.designs || []).forEach((d) => {
        (d.garments || []).forEach((g) => {
          const slug = `${d.slug}-${g}`;
          const label = `${d.name} ${g === 'tee' ? 'Tee' : g === 'shorts' ? 'Shorts' : 'Hat'}`;
          productOptions.push({
            slug,
            label,
            image: `assets/mockups/${slug}.jpg`,
            price: g === 'shorts' ? 35 : 25,
          });
        });
      });

      const merch = Array.isArray(media.data.merch) ? media.data.merch.slice(0, 3) : [];
      while (merch.length < 3) {
        const fallback = productOptions[merch.length] || {
          slug: 'time-is-money-tee',
          label: 'Time Is Money Tee',
          image: 'assets/mockups/time-is-money-tee.jpg',
          price: 25,
        };
        merch.push({
          slug: fallback.slug,
          name: fallback.label,
          price: fallback.price,
          image: fallback.image,
        });
      }

      const optionHtml = productOptions
        .map((o) => `<option value="${escapeHtml(o.slug)}">${escapeHtml(o.label)}</option>`)
        .join('');

      const bgVal = (media.data.hero && media.data.hero.backgroundImage) || '';
      const atmChecked = media.data.hero && media.data.hero.useAsAtmosphere === false ? '' : 'checked';

      panel.innerHTML = `
        <div class="card">
          <h2>Background & Homepage Merch</h2>
          <p class="muted">Upload a real image file for the background. iCloud / Google Drive / Dropbox <strong>share links will not work</strong> — use Upload.</p>
          ${field('Background image URL', `<input id="bg" type="text" value="${escapeHtml(bgVal)}" />`, 'Direct image URL only, or upload a file below.')}
          ${field('Upload background image', `<input id="up" type="file" accept="image/*" />`, 'PNG or JPG. Saved to /assets/uploads/')}
          <label style="display:flex;gap:0.5rem;align-items:center;margin:0.75rem 0 1.25rem;">
            <input id="atm" type="checkbox" ${atmChecked} />
            Also use this image as a soft look across the whole website
          </label>
          <div id="bg-preview" style="margin-bottom:1rem;"></div>
          <hr style="border:0;border-top:1px solid var(--border);margin:1.5rem 0;" />
          <h3>Homepage featured products (3)</h3>
          <p class="muted">These are the three products shown on the home page Official Merch section.</p>
          <div id="merch-slots"></div>
          <div class="actions">
            <button class="btn btn-primary" id="save-img">Save & Publish</button>
          </div>
          <p id="upload-result" class="muted"></p>
        </div>`;

      function renderBgPreview(url) {
        const el = $('#bg-preview');
        if (!url) {
          el.innerHTML = '';
          return;
        }
        el.innerHTML = `<img src="${escapeHtml(url)}" alt="Background preview" style="max-width:100%;max-height:160px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" onerror="this.parentNode.innerHTML='<p class=error>Preview failed — this link is probably not a direct image.</p>'" />`;
      }
      renderBgPreview(bgVal);
      $('#bg').oninput = () => renderBgPreview($('#bg').value.trim());

      const slots = $('#merch-slots');
      slots.innerHTML = merch
        .map(
          (item, i) => `
        <div class="design-item" data-slot="${i}">
          <strong>Slot ${i + 1}</strong>
          ${field('Product', `<select data-f="slug">${optionHtml}</select>`)}
          ${field('Display name', `<input data-f="name" type="text" value="${escapeHtml(item.name || '')}" />`)}
          ${field('Price ($)', `<input data-f="price" type="number" min="1" step="0.01" value="${Number(item.price) || 25}" />`)}
          ${field('Custom image URL (optional)', `<input data-f="image" type="text" value="${escapeHtml(item.image || '')}" />`, 'Leave blank to use the product mockup automatically.')}
          ${field('Or upload custom image', `<input data-f="file" type="file" accept="image/*" />`)}
          <img data-f="thumb" src="${escapeHtml(item.image || '')}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid var(--border);margin-top:0.5rem;" />
        </div>`
        )
        .join('');

      $$('.design-item', slots).forEach((el, i) => {
        const sel = $('[data-f="slug"]', el);
        if (sel && merch[i] && merch[i].slug) sel.value = merch[i].slug;
        sel.onchange = () => {
          const opt = productOptions.find((o) => o.slug === sel.value);
          if (!opt) return;
          $('[data-f="name"]', el).value = opt.label;
          $('[data-f="price"]', el).value = opt.price;
          if (!$('[data-f="image"]', el).value || $('[data-f="image"]', el).value.includes('/mockups/')) {
            $('[data-f="image"]', el).value = opt.image;
            $('[data-f="thumb"]', el).src = opt.image;
          }
        };
      });

      function isBadShareUrl(url) {
        return /icloud\.com|drive\.google\.com|dropbox\.com\/s\/|onedrive\.live\.com|canva\.link|share\./i.test(url || '');
      }

      $('#save-img').onclick = async () => {
        try {
          let bg = $('#bg').value.trim();
          const file = $('#up').files && $('#up').files[0];
          if (file) {
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
            const dest = `gmf-site/assets/uploads/${Date.now()}-${safe}`;
            showStatus('Uploading background…');
            await GMF_GIT.putBinary(dest, await file.arrayBuffer(), 'Upload site background: ' + safe);
            bg = '/assets/uploads/' + dest.split('/').pop();
            $('#bg').value = bg;
            $('#upload-result').textContent = 'Background uploaded: ' + bg;
            renderBgPreview(bg);
          }
          if (isBadShareUrl(bg)) {
            throw new Error('That background link is a share page, not an image. Please Upload a JPG/PNG instead.');
          }

          const nextMerch = [];
          for (const el of $$('.design-item', slots)) {
            const slug = $('[data-f="slug"]', el).value;
            const opt = productOptions.find((o) => o.slug === slug);
            let image = $('[data-f="image"]', el).value.trim() || (opt && opt.image) || '';
            const slotFile = $('[data-f="file"]', el).files && $('[data-f="file"]', el).files[0];
            if (slotFile) {
              const safe = slotFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
              const dest = `gmf-site/assets/uploads/${Date.now()}-${safe}`;
              showStatus('Uploading merch image…');
              await GMF_GIT.putBinary(dest, await slotFile.arrayBuffer(), 'Upload homepage merch image: ' + safe);
              image = '/assets/uploads/' + dest.split('/').pop();
            }
            nextMerch.push({
              slug,
              name: $('[data-f="name"]', el).value.trim() || (opt && opt.label) || slug,
              price: parseFloat($('[data-f="price"]', el).value) || (opt && opt.price) || 25,
              image,
            });
          }

          media.data.hero = media.data.hero || {};
          media.data.hero.backgroundImage = bg;
          media.data.hero.useAsAtmosphere = $('#atm').checked;
          media.data.merch = nextMerch;
          await saveJson('media', media.data, 'Update background and homepage merch');
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
