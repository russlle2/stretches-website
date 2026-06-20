const fs = require('fs');
const path = require('path');
const { json } = require('./_shared/supabase');

const FALLBACK_MEDIA = {
  videos: [
    {
      id: 'search-aint-no-sunshine',
      title: 'Aint No Sunshine',
      embedUrl: 'https://www.youtube.com/embed?listType=search&list=GMF+Productions+Aint+No+Sunshine+music+video',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      type: 'search',
    },
    {
      id: 'search-get-em-gone',
      title: "Get Em' Gone",
      embedUrl: 'https://www.youtube.com/embed?listType=search&list=GMF+Productions+Get+Em+Gone',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      type: 'search',
    },
  ],
};

function loadCuratedMedia() {
  try {
    const mediaPath = path.join(__dirname, '../../gmf-site/content/media.json');
    const raw = fs.readFileSync(mediaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return FALLBACK_MEDIA;
  }
}

async function fetchYouTubeChannelVideos(apiKey, channelId, maxResults = 6) {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('channelId', channelId);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('order', 'date');
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('key', apiKey);

  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
    publishedAt: item.snippet.publishedAt,
    type: 'video',
  }));
}

async function searchYouTubeVideos(apiKey, query, maxResults = 4) {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('key', apiKey);

  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
    publishedAt: item.snippet.publishedAt,
    type: 'video',
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  const curated = loadCuratedMedia();
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  try {
    let videos = curated.videos || FALLBACK_MEDIA.videos;

    if (apiKey && channelId) {
      videos = await fetchYouTubeChannelVideos(apiKey, channelId);
    } else if (apiKey) {
      videos = await searchYouTubeVideos(apiKey, 'GMF Productions OR GMF Productions music video');
    }

    return json(200, {
      videos,
      tracks: curated.tracks || [],
      social: curated.social || {},
      hero: curated.hero || {},
      source: apiKey ? (channelId ? 'youtube-channel' : 'youtube-search') : 'curated',
    });
  } catch (err) {
    console.error('YouTube feed error:', err);
    return json(200, {
      videos: curated.videos || FALLBACK_MEDIA.videos,
      tracks: curated.tracks || [],
      social: curated.social || {},
      hero: curated.hero || {},
      source: 'curated-fallback',
      warning: err.message,
    });
  }
};
