/**
 * content-loader.js — hydrates page text from content JSON files.
 * Add data-content attributes to HTML elements, then include this script.
 *
 * Examples:
 *   <div class="announcement-bar" data-content="site.announcement"></div>
 *   <h1 data-content="page.heading"></h1>
 *   <div data-content-html="page.intro"></div>
 *   <main data-page="about"></main>  → loads content/pages/about.json
 */
(function () {
  function contentBase() {
    const path = window.location.pathname || '';
    if (path.includes('/posts/') || path.includes('/admin/')) return '../content/';
    return 'content/';
  }

  function pageKeyFromPath() {
    const file = (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const map = {
      index: 'home',
      '': 'home',
      shop: 'shop',
      about: 'about',
      booking: 'booking',
      contact: 'contact',
      music: 'music',
      'shipping-policy': 'shipping',
      'returns-policy': 'returns',
    };
    return map[file] || file;
  }

  async function loadJson(rel) {
    const res = await fetch(contentBase() + rel, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + rel);
    return res.json();
  }

  function setText(el, value) {
    if (value == null) return;
    if (el.hasAttribute('data-content-html') || el.dataset.contentHtml !== undefined) {
      el.innerHTML = String(value);
    } else {
      el.textContent = String(value);
    }
  }

  function getByPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function applyBindings(root, ctx) {
    root.querySelectorAll('[data-content], [data-content-html]').forEach((el) => {
      const path = el.getAttribute('data-content') || el.getAttribute('data-content-html');
      if (!path) return;
      const val = getByPath(ctx, path);
      if (val == null) return;
      if (Array.isArray(val)) {
        el.innerHTML = val.map((p) => `<p>${p}</p>`).join('');
      } else if (el.hasAttribute('data-content-html') || path.endsWith('intro') && typeof val === 'string' && val.includes('<')) {
        el.innerHTML = String(val);
      } else if (el.hasAttribute('data-content-html')) {
        el.innerHTML = String(val);
      } else {
        el.textContent = String(val);
      }
    });
  }

  function renderAboutSections(page) {
    const host = document.getElementById('about-sections');
    if (!host || !page.sections) return;
    host.innerHTML = page.sections
      .map((s) => `<h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p>`)
      .join('');
  }

  function renderHomeAbout(page) {
    const host = document.getElementById('home-about-body');
    if (!host || !page.about) return;
    const paras = page.about.paragraphs || [];
    host.innerHTML = paras
      .map((p, i) => {
        const cls = i === 0 ? 'text-xl text-gray-300 leading-relaxed mb-6' : 'text-lg text-gray-400 leading-relaxed mb-12';
        return `<p class="${cls}">${p}</p>`;
      })
      .join('');
    const heading = document.getElementById('home-about-heading');
    if (heading && page.about.heading) heading.textContent = page.about.heading;
  }

  function renderHomeHero(page) {
    if (!page.hero) return;
    const eyebrow = document.getElementById('home-hero-eyebrow');
    const headline = document.getElementById('home-hero-headline');
    const tagline = document.getElementById('hero-tagline');
    const primary = document.getElementById('home-hero-primary');
    const secondary = document.getElementById('home-hero-secondary');
    if (eyebrow && page.hero.eyebrow) eyebrow.textContent = page.hero.eyebrow;
    if (headline && page.hero.headline) headline.textContent = page.hero.headline;
    if (tagline && page.hero.tagline) tagline.innerHTML = page.hero.tagline;
    if (primary && page.hero.primaryCta) {
      primary.textContent = page.hero.primaryCta.label;
      primary.setAttribute('href', page.hero.primaryCta.href || '#music');
    }
    if (secondary && page.hero.secondaryCta) {
      secondary.textContent = page.hero.secondaryCta.label;
      secondary.setAttribute('href', page.hero.secondaryCta.href || '#merch');
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function init() {
    const pageKey = document.body.getAttribute('data-page') || pageKeyFromPath();
    let site = {};
    let page = {};

    try {
      site = await loadJson('site.json');
    } catch (e) {
      console.warn('[content-loader] site.json', e);
    }

    try {
      if (pageKey === 'shipping' || pageKey === 'returns') {
        page = await loadJson(`policies/${pageKey}.json`);
      } else {
        page = await loadJson(`pages/${pageKey}.json`);
      }
    } catch (e) {
      console.warn('[content-loader] page', pageKey, e);
    }

    window.GMF_CONTENT = { site, page, pageKey };

    // Site atmosphere from media.json (pages without media.js still match the look)
    try {
      const media = await loadJson('media.json');
      const hero = (media && media.hero) || {};
      if (hero.useAsAtmosphere !== false && hero.backgroundImage) {
        const bad = /icloud\.com|drive\.google\.com|dropbox\.com\/s\/|canva\.link|share\./i.test(hero.backgroundImage);
        if (!bad) {
          let layer = document.getElementById('site-atmosphere');
          if (!layer) {
            layer = document.createElement('div');
            layer.id = 'site-atmosphere';
            layer.setAttribute('aria-hidden', 'true');
            document.body.prepend(layer);
            if (!document.getElementById('site-atmosphere-style')) {
              const style = document.createElement('style');
              style.id = 'site-atmosphere-style';
              style.textContent = '#site-atmosphere{position:fixed;inset:0;z-index:-1;pointer-events:none;background-position:center;background-size:cover;opacity:0.12;filter:saturate(0.85) brightness(0.5);}';
              document.head.appendChild(style);
            }
          }
          layer.style.backgroundImage = `url('${hero.backgroundImage}')`;
        }
      }
    } catch (_) { /* optional */ }

    // Global announcement
    document.querySelectorAll('.announcement-bar').forEach((el) => {
      const override = page.announcement;
      if (override) el.textContent = override;
      else if (site.announcement) el.textContent = site.announcement;
    });

    // SEO
    if (page.seo) {
      if (page.seo.title) document.title = page.seo.title;
      const meta = document.querySelector('meta[name="description"]');
      if (meta && page.seo.description) meta.setAttribute('content', page.seo.description);
    }

    // Generic bindings
    applyBindings(document, { site, page });

    // Page-specific
    if (pageKey === 'home') {
      renderHomeHero(page);
      renderHomeAbout(page);
      const merchH = document.getElementById('home-merch-heading');
      const merchS = document.getElementById('home-merch-subtitle');
      if (merchH && page.merchSection) merchH.textContent = page.merchSection.heading;
      if (merchS && page.merchSection) merchS.textContent = page.merchSection.subtitle;
    }
    if (pageKey === 'about') {
      const h1 = document.querySelector('main h1');
      if (h1 && page.heading) h1.textContent = page.heading;
      const introHost = document.getElementById('about-intro');
      if (introHost && page.intro) {
        introHost.innerHTML = (page.intro || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
      }
      renderAboutSections(page);
    }
    if (pageKey === 'shop' || pageKey === 'booking' || pageKey === 'contact' || pageKey === 'music') {
      const h1 = document.querySelector('main h1');
      if (h1 && page.heading) h1.textContent = page.heading;
      const intro = document.getElementById('page-intro') || document.querySelector('main > p');
      if (intro && page.intro) {
        if (String(page.intro).includes('<')) intro.innerHTML = page.intro;
        else intro.textContent = page.intro;
      }
    }
    if (pageKey === 'shipping' || pageKey === 'returns') {
      const h1 = document.querySelector('main h1');
      if (h1 && page.title) h1.textContent = page.title;
      const body = document.getElementById('policy-body');
      if (body && page.body) body.innerHTML = page.body;
    }

    // Footer tagline
    document.querySelectorAll('[data-footer-tagline]').forEach((el) => {
      if (site.footerTagline) el.textContent = site.footerTagline;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
