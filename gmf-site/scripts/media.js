// media.js — loads videos, tracks, and hero content from API + media.json fallback
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
  applySocial(media.social || {});
});

function renderVideos(videos) {
  const grid = document.getElementById('videos-grid');
  if (!grid || !videos.length) return;

  grid.innerHTML = videos.slice(0, 4).map((video) => `
    <div class="video-card aspect-video w-full bg-gray-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
      <iframe
        width="100%"
        height="100%"
        src="${video.embedUrl}"
        title="${escapeHtml(video.title)}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"
      ></iframe>
    </div>
  `).join('');
}

function renderTracks(tracks) {
  const list = document.getElementById('tracks-list');
  if (!list) return;

  const topTracks = tracks.filter((t) => !t.featured).slice(0, 6);
  if (!topTracks.length) return;

  list.innerHTML = topTracks.map((track, i) => {
    const spotifyUrl = track.spotifyTrackId
      ? `https://open.spotify.com/track/${track.spotifyTrackId}`
      : track.spotifySearch
        ? `https://open.spotify.com/search/${encodeURIComponent(track.spotifySearch)}`
        : '#';
    return `
      <li class="track-item flex justify-between items-center p-4 bg-white/5 hover:bg-white/10 transition cursor-pointer"
          onclick="window.open('${spotifyUrl}', '_blank')">
        <span class="font-bold">${track.rank || i + 1}. ${escapeHtml(track.title)}</span>
        <span class="text-brand-green text-sm">▶ Stream</span>
      </li>
    `;
  }).join('');
}

function applyHero(hero) {
  if (hero.backgroundImage) {
    const header = document.getElementById('home');
    if (header) {
      header.style.backgroundImage = `linear-gradient(to bottom, rgba(10,10,10,0.3), rgba(10,10,10,1)), url('${hero.backgroundImage}')`;
    }
  }

  const featured = hero.featuredTrack;
  if (!featured) return;

  const titleEl = document.getElementById('featured-track-title');
  const descEl = document.getElementById('featured-track-desc');
  const dateEl = document.getElementById('featured-track-date');
  const embedEl = document.getElementById('spotify-embed');

  if (titleEl) titleEl.textContent = featured.title;
  if (descEl) descEl.textContent = featured.description || '';
  if (dateEl) dateEl.textContent = `Released ${featured.released} • GETTIN' MONEY FOREVER Productions`;
  if (embedEl && featured.spotifyTrackId) {
    embedEl.src = `https://open.spotify.com/embed/track/${featured.spotifyTrackId}?utm_source=generator&theme=0`;
  }
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
