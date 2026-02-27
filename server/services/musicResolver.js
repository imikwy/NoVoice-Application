const MAX_RESOLVED_TRACKS = 120;

const SUPPORTED_SPOTIFY_TYPES = new Set(['track', 'playlist', 'album']);

const spotifyTokenCache = {
  token: null,
  expiresAtMs: 0,
};
const deezerPreviewCache = new Map();

function normalizeLabel(value, fallback = '', maxLength = 180) {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength);
}

function clampDurationSec(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(12 * 60 * 60, Math.round(numeric * 1000) / 1000));
}

function inferTitleFromUrl(urlObj) {
  const pathPart = decodeURIComponent(urlObj.pathname || '/')
    .split('/')
    .filter(Boolean)
    .pop() || '';
  const titleLike = pathPart
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return normalizeLabel(titleLike || urlObj.hostname.replace(/^www\./, ''), 'Untitled');
}

function sourceLabel(source) {
  if (source === 'spotify') return 'Spotify';
  if (source === 'youtube') return 'YouTube';
  if (source === 'soundcloud') return 'SoundCloud';
  if (source === 'bandcamp') return 'Bandcamp';
  if (source === 'mixcloud') return 'Mixcloud';
  return 'Audio Link';
}

function extractYoutubeVideoId(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  if (host.includes('youtu.be')) {
    return urlObj.pathname.split('/').filter(Boolean)[0] || null;
  }
  if (host.includes('youtube.com')) {
    const v = urlObj.searchParams.get('v');
    if (v) return v;
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'v'].includes(parts[0])) return parts[1] || null;
  }
  return null;
}

async function resolveYoutube(urlObj, titleHint) {
  const videoId = extractYoutubeVideoId(urlObj);
  if (!videoId) return { tracks: [], error: 'invalid_youtube_url' };

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
  const metadata = await fetchJson(oembedUrl, {}, 6000);

  const title = normalizeLabel(
    titleHint || metadata?.title || inferTitleFromUrl(urlObj),
    'YouTube Video'
  );
  const coverUrl = metadata?.thumbnail_url
    || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return {
    tracks: [
      toResolvedTrack({
        url: canonicalUrl,
        title,
        source: 'youtube',
        coverUrl,
        durationSec: null,
        streamUrl: null,
        isPlayable: true,
        playbackHint: 'youtube',
        playerType: 'youtube',
        videoId,
      }),
    ],
    error: null,
  };
}

function inferSource(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.includes('spotify')) return 'spotify';
  if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('soundcloud')) return 'soundcloud';
  if (host.includes('bandcamp')) return 'bandcamp';
  if (host.includes('mixcloud')) return 'mixcloud';
  return 'direct';
}

function parseSpotifyResource(urlObj) {
  if (!urlObj.hostname.toLowerCase().includes('spotify.com')) return null;

  const parts = (urlObj.pathname || '')
    .split('/')
    .filter(Boolean)
    .filter((part) => !part.startsWith('intl-'));

  for (let i = 0; i < parts.length; i += 1) {
    if (!SUPPORTED_SPOTIFY_TYPES.has(parts[i])) continue;
    const resourceType = parts[i];
    const resourceId = (parts[i + 1] || '').split('?')[0].trim();
    if (!resourceId) return null;
    return { resourceType, resourceId };
  }

  return null;
}

async function fetchJson(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toResolvedTrack({
  url,
  title,
  source,
  coverUrl = null,
  durationSec = null,
  streamUrl = null,
  isPlayable = false,
  playbackHint = 'external',
  searchTitle = '',
  searchArtist = '',
  playerType = 'audio',
  videoId = '',
}) {
  return {
    url: String(url || '').trim(),
    title: normalizeLabel(title, 'Untitled Track'),
    source,
    sourceLabel: sourceLabel(source),
    coverUrl: coverUrl ? String(coverUrl) : null,
    durationSec: clampDurationSec(durationSec),
    streamUrl: streamUrl ? String(streamUrl) : null,
    isPlayable: Boolean(isPlayable),
    playbackHint: String(playbackHint || (isPlayable ? 'stream' : 'external')),
    searchTitle: normalizeLabel(searchTitle, '', 140),
    searchArtist: normalizeLabel(searchArtist, '', 140),
    playerType: normalizeLabel(playerType || 'audio', 'audio', 20),
    videoId: normalizeLabel(videoId || '', '', 32),
  };
}

function mapSpotifyTrackToResolved(track, fallbackUrl = null, fallbackImage = null) {
  if (!track?.name) return null;

  const artists = Array.isArray(track.artists)
    ? track.artists.map((artist) => normalizeLabel(artist?.name)).filter(Boolean)
    : [];
  const artistLabel = artists.join(', ');
  const title = artistLabel ? `${track.name} - ${artistLabel}` : String(track.name);
  const coverUrl = track.album?.images?.[0]?.url || fallbackImage || null;
  const canonicalUrl = track.external_urls?.spotify || fallbackUrl || '';
  const previewUrl = track.preview_url ? String(track.preview_url) : null;

  return toResolvedTrack({
    url: canonicalUrl,
    title,
    source: 'spotify',
    coverUrl,
    // Spotify preview endpoints are short snippets (~30s), not full-track streams.
    // Keep UI/server timing honest so playback state doesn't pretend a full song is playing.
    durationSec: previewUrl
      ? 30
      : (Number.isFinite(Number(track.duration_ms)) ? Number(track.duration_ms) / 1000 : null),
    streamUrl: previewUrl,
    isPlayable: Boolean(previewUrl),
    playbackHint: previewUrl ? 'preview' : 'external',
    searchTitle: normalizeLabel(track.name, '', 140),
    searchArtist: normalizeLabel(artists[0], '', 140),
  });
}

async function getSpotifyAccessToken() {
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;

  const nowMs = Date.now();
  if (spotifyTokenCache.token && spotifyTokenCache.expiresAtMs > nowMs + 20_000) {
    return spotifyTokenCache.token;
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const payload = await fetchJson(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
    7000
  );

  if (!payload?.access_token) return null;

  const expiresInSec = Number(payload.expires_in);
  spotifyTokenCache.token = payload.access_token;
  spotifyTokenCache.expiresAtMs = Date.now() + (Number.isFinite(expiresInSec) ? expiresInSec * 1000 : 3500 * 1000);

  return spotifyTokenCache.token;
}

async function fetchSpotifyApi(pathname, token) {
  return fetchJson(`https://api.spotify.com/v1${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function resolveSpotifyWithApi(urlObj, maxTracks) {
  const resource = parseSpotifyResource(urlObj);
  if (!resource) return null;

  const token = await getSpotifyAccessToken();
  if (!token) return null;

  if (resource.resourceType === 'track') {
    const track = await fetchSpotifyApi(`/tracks/${resource.resourceId}`, token);
    const resolved = mapSpotifyTrackToResolved(track, urlObj.toString(), null);
    return resolved ? [resolved] : [];
  }

  if (resource.resourceType === 'album') {
    const album = await fetchSpotifyApi(`/albums/${resource.resourceId}`, token);
    if (!album) return [];

    const albumImage = album.images?.[0]?.url || null;
    const tracks = Array.isArray(album.tracks?.items) ? album.tracks.items : [];
    return tracks
      .slice(0, maxTracks)
      .map((track) => mapSpotifyTrackToResolved(
        {
          ...track,
          album: { images: album.images || [] },
          external_urls: track.external_urls || album.external_urls,
        },
        track.external_urls?.spotify || album.external_urls?.spotify || urlObj.toString(),
        albumImage
      ))
      .filter(Boolean);
  }

  if (resource.resourceType === 'playlist') {
    const playlist = await fetchSpotifyApi(
      `/playlists/${resource.resourceId}?fields=name,images,external_urls,tracks.items(track(name,duration_ms,preview_url,external_urls,artists(name),album(images))),tracks.next`,
      token
    );
    if (!playlist) return [];

    const resolvedTracks = [];
    const pushTrack = (trackObj) => {
      if (!trackObj || resolvedTracks.length >= maxTracks) return;
      const mapped = mapSpotifyTrackToResolved(
        trackObj,
        trackObj.external_urls?.spotify || playlist.external_urls?.spotify || urlObj.toString(),
        playlist.images?.[0]?.url || null
      );
      if (mapped) resolvedTracks.push(mapped);
    };

    const firstBatch = Array.isArray(playlist.tracks?.items) ? playlist.tracks.items : [];
    firstBatch.forEach((item) => pushTrack(item?.track || null));

    let nextPageUrl = playlist.tracks?.next || null;
    while (nextPageUrl && resolvedTracks.length < maxTracks) {
      const page = await fetchJson(nextPageUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!page) break;

      const items = Array.isArray(page.items) ? page.items : [];
      items.forEach((item) => pushTrack(item?.track || null));
      nextPageUrl = page.next || null;
    }

    return resolvedTracks;
  }

  return null;
}

async function resolveSpotifyWithOEmbed(urlObj, titleHint) {
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(urlObj.toString())}`;
  const metadata = await fetchJson(oembedUrl, {}, 6000);
  if (!metadata) return [];

  return [
    toResolvedTrack({
      url: urlObj.toString(),
      title: normalizeLabel(titleHint, normalizeLabel(metadata.title, inferTitleFromUrl(urlObj))),
      source: 'spotify',
      coverUrl: metadata.thumbnail_url || null,
      durationSec: null,
      streamUrl: null,
      isPlayable: false,
      playbackHint: 'external',
      searchTitle: normalizeLabel(metadata.title, '', 140),
      searchArtist: '',
    }),
  ];
}

async function resolveSpotifyTrackUrlWithOEmbed(trackUrl, titleHint = '') {
  let parsed;
  try {
    parsed = new URL(trackUrl);
  } catch {
    return null;
  }

  const tracks = await resolveSpotifyWithOEmbed(parsed, titleHint);
  return tracks[0] || null;
}

function extractSpotifyTrackUrlsFromHtml(html) {
  if (!html) return [];
  const urls = [];
  const metaTagRegex = /<meta\s+[^>]*>/gi;
  let match;
  while ((match = metaTagRegex.exec(html)) !== null) {
    const metaTag = String(match[0] || '');
    if (!/(?:property|name)="music:song"/i.test(metaTag)) continue;
    const contentMatch = metaTag.match(/content="([^"]+)"/i);
    const url = String(contentMatch?.[1] || '').trim();
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

async function mapWithConcurrency(items, limit, worker) {
  const boundedLimit = Math.max(1, Math.min(8, Number(limit) || 4));
  const output = [];
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const nextValue = await worker(items[index], index);
      output[index] = nextValue;
    }
  }

  const workers = Array.from({ length: boundedLimit }, () => runOne());
  await Promise.all(workers);
  return output;
}

async function resolveSpotifyCollectionViaHtml(urlObj, maxTracks) {
  const html = await fetchText(urlObj.toString(), {}, 9000);
  if (!html) return [];

  const trackUrls = extractSpotifyTrackUrlsFromHtml(html).slice(0, maxTracks);
  if (trackUrls.length === 0) return [];

  const mapped = await mapWithConcurrency(
    trackUrls,
    5,
    async (trackUrl) => resolveSpotifyTrackUrlWithOEmbed(trackUrl)
  );

  return mapped.filter(Boolean);
}

function escapeDeezerTerm(value) {
  return String(value || '').replace(/"/g, '').trim();
}

function parseArtistFromSpotifyTitle(title) {
  const value = String(title || '');
  const match = value.match(/\s+-\s+(.+)$/);
  if (match?.[1]) return normalizeLabel(match[1], '', 140);

  const byMatch = value.match(/\s+by\s+(.+)$/i);
  if (byMatch?.[1]) return normalizeLabel(byMatch[1], '', 140);

  return '';
}

async function resolveDeezerPreviewForTrack(track) {
  if (!track || track.source !== 'spotify' || track.isPlayable) return track;

  const searchTitle = normalizeLabel(track.searchTitle, normalizeLabel(track.title.split(' - ')[0], '', 140), 140);
  const searchArtist = normalizeLabel(track.searchArtist, parseArtistFromSpotifyTitle(track.title), 140);
  const cacheKey = `${searchTitle.toLowerCase()}::${searchArtist.toLowerCase()}`;
  if (deezerPreviewCache.has(cacheKey)) {
    const cached = deezerPreviewCache.get(cacheKey);
    if (!cached?.streamUrl) return track;
    return {
      ...track,
      streamUrl: cached.streamUrl,
      isPlayable: true,
      playbackHint: 'preview',
      durationSec: 30,
      coverUrl: track.coverUrl || cached.coverUrl || null,
    };
  }

  const queryParts = [];
  if (searchTitle) queryParts.push(`track:"${escapeDeezerTerm(searchTitle)}"`);
  if (searchArtist) queryParts.push(`artist:"${escapeDeezerTerm(searchArtist)}"`);
  if (queryParts.length === 0) {
    deezerPreviewCache.set(cacheKey, null);
    return track;
  }

  const data = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(queryParts.join(' '))}`, {}, 6500);
  const items = Array.isArray(data?.data) ? data.data : [];
  const match = items.find((item) => item?.preview) || null;
  if (!match?.preview) {
    deezerPreviewCache.set(cacheKey, null);
    return track;
  }

  const normalized = {
    streamUrl: String(match.preview),
    durationSec: clampDurationSec(match.duration),
    coverUrl: match.album?.cover_xl || match.album?.cover_big || match.album?.cover_medium || null,
  };
  deezerPreviewCache.set(cacheKey, normalized);

  return {
    ...track,
    streamUrl: normalized.streamUrl,
    isPlayable: true,
    playbackHint: 'preview',
    // Deezer preview URLs are also snippets (~30s), even if metadata contains full track length.
    durationSec: 30,
    coverUrl: track.coverUrl || normalized.coverUrl || null,
  };
}

async function enrichSpotifyTracksWithPreviews(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return tracks || [];

  const mapped = await mapWithConcurrency(
    tracks,
    6,
    async (track) => resolveDeezerPreviewForTrack(track)
  );

  return mapped.map((track) => {
    if (!track || track.source !== 'spotify') return track;
    const { searchTitle, searchArtist, ...clean } = track;
    return clean;
  });
}

async function resolveSpotify(urlObj, { titleHint, maxTracks }) {
  const resource = parseSpotifyResource(urlObj);
  const viaApi = await resolveSpotifyWithApi(urlObj, maxTracks);
  if (Array.isArray(viaApi) && viaApi.length > 0) {
    if (titleHint && viaApi.length === 1) {
      viaApi[0].title = normalizeLabel(titleHint, viaApi[0].title);
    }
    return enrichSpotifyTracksWithPreviews(viaApi.slice(0, maxTracks));
  }

  if (resource?.resourceType === 'playlist' || resource?.resourceType === 'album') {
    const viaHtmlCollection = await resolveSpotifyCollectionViaHtml(urlObj, maxTracks);
    if (viaHtmlCollection.length > 0) {
      return enrichSpotifyTracksWithPreviews(viaHtmlCollection);
    }
  }

  const viaFallback = await resolveSpotifyWithOEmbed(urlObj, titleHint);
  return enrichSpotifyTracksWithPreviews(viaFallback);
}

async function resolveMusicInputUrl(inputUrl, { titleHint = '', maxTracks = MAX_RESOLVED_TRACKS } = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(String(inputUrl || '').trim());
  } catch {
    return { tracks: [], error: 'invalid_url' };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { tracks: [], error: 'invalid_protocol' };
  }

  const boundedMax = Math.max(1, Math.min(MAX_RESOLVED_TRACKS, Number(maxTracks) || MAX_RESOLVED_TRACKS));
  const source = inferSource(parsedUrl.hostname);

  if (source === 'spotify') {
    const tracks = await resolveSpotify(parsedUrl, { titleHint, maxTracks: boundedMax });
    return { tracks: tracks.slice(0, boundedMax), error: null };
  }

  if (source === 'youtube') {
    return resolveYoutube(parsedUrl, titleHint);
  }

  return { tracks: [], error: 'unsupported_source' };
}

module.exports = {
  resolveMusicInputUrl,
};
