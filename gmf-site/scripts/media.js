// media.js — loads videos, tracks, hero, atmosphere, and homepage merch
document.addEventListener('DOMContentLoaded', async () => {
  let media = null;

  try {
    media = await window.GMF_API.fetchMedia();
  } catch {
    try {
      const res = await fetch('content/media.json');
      media = await res.json();
    } catch (err) {
      console.warn('Could not load media:', err);
      return;
    }
  }

  renderVideos(media.videos || []);
  renderTracks(media.tracks || []);
  applyHero(media.hero || {});
  applyAtmosphere(media.hero || {});
  applySocial(media.social || {});
  renderHomeMerch(media.merch || []);
});

function isUsableImageUrl(url) {
  if (!url) return false;
  const u = String(url).trim().toLowerCase();
  if (/icloud\.com|drive\.google\.com|dropbox\.com\/s\/|onedrive\.live\.com|share\.|photos\.app\.goo/.test(u)) {
    return false;
  }
  return true;
}

function renderVideos(videos) {
  const grid = document.getElementById('videos-grid');
  if (!grid || !videos.length) return;

  grid.innerHTML = videos.slice(0, 4).map((video) => {
    if (video.type === 'channel' && video.channelUrl) {
      return `
        <a href="${video.channelUrl}" target="_blank" rel="noopener"
           class="video-card aspect-video w-full bg-gray-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl block relative group">
          <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" />
          <div class="absolute inset-0 flex items-center justify-center bg-black/40">
            <span class="font-display text-xl uppercase text-brand-green">▶ ${escapeHtml(video.title)}</span>
          </div>
        </a>`;
    }
    return `
      <div class="video-card aspect-video w-full bg-gray-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
        <iframe width="100%" height="100%" src="${video.embedUrl}" title="${escapeHtml(video.title)}"
          frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen loading="lazy"></iframe>
      </div>`;
  }).join('');
}

function renderTracks(tracks) {
  const list = document.getElementById('tracks-list');
  if (!list) return;

  const topTracks = tracks.filter((t) => !t.featured).slice(0, 6);
  if (!topTracks.length) return;

  list.innerHTML = topTracks.map((track, i) => {
    let url = '#';
    if (track.youtubeId) url = `https://www.youtube.com/watch?v=${track.youtubeId}`;
    else if (track.spotifyTrackId) url = `https://open.spotify.com/track/${track.spotifyTrackId}`;
    else if (track.spotifySearch) url = `https://open.spotify.com/search/${encodeURIComponent(track.spotifySearch)}`;
    return `
      <li class="track-item flex justify-between items-center p-4 bg-white/5 hover:bg-white/10 transition cursor-pointer"
          onclick="window.open('${url}', '_blank')">
        <span class="font-bold">${track.rank || i + 1}. ${escapeHtml(track.title)}</span>
        <span class="text-brand-green text-sm">▶ Play</span>
      </li>`;
  }).join('');
}

function applyHero(hero) {
  const header = document.getElementById('home');
  let bg = hero.backgroundImage;
  if (!isUsableImageUrl(bg) && hero.featuredVideo && hero.featuredVideo.youtubeId) {
    bg = `https://img.youtube.com/vi/${hero.featuredVideo.youtubeId}/maxresdefault.jpg`;
  } else if (!isUsableImageUrl(bg) && hero.featuredVideo && hero.featuredVideo.thumbnail) {
    bg = hero.featuredVideo.thumbnail;
  }

  if (header && isUsableImageUrl(bg)) {
    header.style.backgroundImage = `linear-gradient(to bottom, rgba(10,10,10,0.45), rgba(10,10,10,1)), url('${bg}')`;
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
  }

  const taglineEl = document.getElementById('hero-tagline');
  if (taglineEl && hero.tagline) taglineEl.innerHTML = hero.tagline;

  const featured = hero.featuredTrack || {};
  const video = hero.featuredVideo || {};

  const titleEl = document.getElementById('featured-track-title');
  const descEl = document.getElementById('featured-track-desc');
  const dateEl = document.getElementById('featured-track-date');
  const spotifyEl = document.getElementById('spotify-embed');
  const youtubeEl = document.getElementById('featured-youtube-embed');

  if (titleEl) titleEl.textContent = featured.title || video.title || 'No Restin';
  if (descEl) descEl.textContent = featured.description || '';
  if (dateEl) {
    dateEl.textContent = video.subtitle
      ? `${video.subtitle} • GETTIN' MONEY FOREVER Productions`
      : "GETTIN' MONEY FOREVER Productions";
  }
  if (spotifyEl && featured.spotifyArtistId) {
    spotifyEl.src = `https://open.spotify.com/embed/artist/${featured.spotifyArtistId}?utm_source=generator&theme=0`;
    spotifyEl.height = '352';
  }
  if (youtubeEl && video.embedUrl) {
    youtubeEl.src = video.embedUrl;
  }
}

function applyAtmosphere(hero) {
  if (hero.useAsAtmosphere === false) return;
  let bg = hero.backgroundImage;
  if (!isUsableImageUrl(bg) && hero.featuredVideo && hero.featuredVideo.youtubeId) {
    bg = `https://img.youtube.com/vi/${hero.featuredVideo.youtubeId}/maxresdefault.jpg`;
  }
  if (!isUsableImageUrl(bg)) return;

  let layer = document.getElementById('site-atmosphere');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'site-atmosphere';
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
    // Ensure styles exist on non-home pages
    if (!document.getElementById('site-atmosphere-style')) {
      const style = document.createElement('style');
      style.id = 'site-atmosphere-style';
      style.textContent = `
        #site-atmosphere {
          position: fixed; inset: 0; z-index: -1; pointer-events: none;
          background-position: center; background-size: cover;
          opacity: 0.12; filter: saturate(0.85) brightness(0.5);
        }
      `;
      document.head.appendChild(style);
    }
  }
  layer.style.backgroundImage = `url('${bg}')`;
}

function renderHomeMerch(items) {
  const grid = document.getElementById('home-merch-grid');
  if (!grid) return;
  const cards = (items || []).slice(0, 3);
  if (!cards.length) {
    grid.innerHTML = '<p class="text-gray-400">Merch coming soon — visit the full shop.</p>';
    return;
  }

  grid.innerHTML = cards.map((item) => {
    const name = item.name || 'GMF Merch';
    const price = Number(item.price) || 25;
    const slug = item.slug || '';
    const image = item.image || 'assets/mockups/time-is-money-tee.jpg';
    const priceLabel = `$${price.toFixed(2)} USD`;
    const productHref = slug ? `product.html?slug=${encodeURIComponent(slug)}` : 'shop.html';
    const safeName = escapeHtml(name);
    const safeImage = escapeHtml(image);
    return `
      <div class="group bg-white/5 border border-white/10 rounded-lg overflow-hidden relative transition hover:border-brand-green">
        <a href="${productHref}" class="block aspect-square bg-gray-800 relative overflow-hidden">
          <img src="${safeImage}" alt="${safeName}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" loading="lazy" />
        </a>
        <div class="p-6">
          <h3 class="font-display text-xl uppercase font-bold mb-1">
            <a href="${productHref}" class="hover:text-brand-green transition">${safeName}</a>
          </h3>
          <p class="text-gray-400 mb-4">${priceLabel}</p>
          <button type="button"
            onclick="addToCart('${safeName.replace(/'/g, "\\'")}', ${price}, '${escapeHtml(slug)}', '${safeImage}')"
            class="w-full bg-white text-black py-3 font-bold uppercase tracking-wider hover:bg-brand-green transition">
            Add to Cart
          </button>
        </div>
      </div>`;
  }).join('');
}

function applySocial(social) {
  const map = {
    'social-instagram': social.instagram,
    'social-tiktok': social.tiktok,
    'social-youtube': social.youtube,
    'link-spotify': social.spotify,
    'link-apple': social.appleMusic,
    'link-ytmusic': social.youtubeMusic,
  };

  Object.entries(map).forEach(([id, href]) => {
    const el = document.getElementById(id);
    if (el && href) el.href = href;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
