const TUNEHUB_BASE = 'https://tunehub.sayqz.com/api';

function proxyUrl(url) {
  if (!url || url.startsWith('https://')) return url;
  return '/api/proxy?url=' + encodeURIComponent(url);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.TUNEHUB_API_KEY;
  if (!API_KEY) return res.status(500).json({ code: -1, msg: 'API Key not configured' });

  if (req.method !== 'POST') {
    return res.status(405).json({ code: -1, msg: 'POST only' });
  }

  const { platform, ids, quality = 'flac24bit' } = req.body || {};
  if (!platform || !ids) {
    return res.status(400).json({ code: -1, msg: 'Missing platform or ids' });
  }

  // Kuwo doesn't support flac24bit, cap at flac
  const actualQuality = (platform === 'kuwo' && quality === 'flac24bit') ? 'flac' : quality;

  try {
    const upstream = await fetch(`${TUNEHUB_BASE}/v1/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ platform, ids: String(ids), quality: actualQuality })
    });

    const raw = await upstream.json();
    if (raw.code !== 0) return res.status(200).json({ code: -1, msg: raw.message || 'Parse failed' });

    const items = raw.data?.data || [];
    const result = items.map(item => {
      if (!item.success) return { id: item.id, error: item.error };
      return {
        id: item.id,
        url: proxyUrl(item.url),
        name: item.info?.name || '',
        artist: item.info?.artist || '',
        album: item.info?.album || '',
        duration: item.info?.duration || 0,
        cover: proxyUrl(item.cover),
        lyrics: item.lyrics || ''
      };
    });

    return res.status(200).json({ code: 0, data: result });
  } catch (err) {
    return res.status(500).json({ code: -1, msg: err.message });
  }
}
