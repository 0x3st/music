const TUNEHUB_BASE = 'https://tunehub.sayqz.com/api';
const PLATFORMS = ['netease', 'kuwo', 'qq'];
const PLATFORM_LABELS = { netease: '网易云', qq: 'QQ', kuwo: '酷我' };

function evalTemplate(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
    try {
      const fn = new Function(...Object.keys(vars), 'return (' + expr + ')');
      return String(fn(...Object.values(vars)));
    } catch { return expr; }
  });
}

function deepEvalBody(obj, vars) {
  if (typeof obj === 'string') {
    const evaluated = evalTemplate(obj, vars);
    // If the original was a pure template like "{{page || 1}}", try to preserve the type
    if (/^\{\{.+\}\}$/.test(obj.trim())) {
      const num = Number(evaluated);
      if (!isNaN(num) && evaluated.trim() !== '') return num;
    }
    return evaluated;
  }
  if (Array.isArray(obj)) return obj.map(v => deepEvalBody(v, vars));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepEvalBody(v, vars);
    return out;
  }
  return obj;
}

async function searchPlatform(platform, keyword, page, limit) {
  const vars = { keyword, page, limit };
  const configRes = await fetch(`${TUNEHUB_BASE}/v1/methods/${platform}/search`);
  const configJson = await configRes.json();
  if (configJson.code !== 0) throw new Error('config fail');
  const config = configJson.data;

  let url = evalTemplate(config.url, vars);
  const headers = { ...(config.headers || {}) };

  if (config.method === 'GET' && config.params) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params)) {
      params.set(key, evalTemplate(String(value), vars));
    }
    url += (url.includes('?') ? '&' : '?') + params.toString();
  }

  const fetchOpts = { method: config.method, headers };
  if (config.method === 'POST' && config.body) {
    const body = deepEvalBody(config.body, vars);
    // QQ Music API requires updated comm params to return search results
    if (platform === 'qq' && body.comm) {
      body.comm.cv = 13020508;
      body.comm.ct = '11';
      body.comm.QIMEI36 = '6c9d3cd110abca9b16311cee10001e717614';
    }
    fetchOpts.body = JSON.stringify(body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }

  const upstream = await fetch(url, fetchOpts);
  const ct = upstream.headers.get('content-type') || '';
  let data;
  if (ct.includes('json')) { data = await upstream.json(); }
  else { const text = await upstream.text(); try { data = JSON.parse(text); } catch { data = text; } }

  if (config.transform) {
    const fn = new Function('return ' + config.transform)();
    data = fn(data);
  }

  // Normalize and tag with platform
  const songs = Array.isArray(data) ? data : [];
  return songs.map(s => ({ ...s, platform, platformLabel: PLATFORM_LABELS[platform] }));
}

function relevanceScore(song, keywords) {
  let score = 0;
  const name = (song.name || '').toLowerCase();
  const artist = (song.artist || '').toLowerCase();
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (name === k) score += 100;
    else if (name.includes(k)) score += 50;
    if (artist === k) score += 80;
    else if (artist.includes(k)) score += 40;
  }
  // Exact full match bonus
  const full = keywords.join(' ').toLowerCase();
  if (name === full) score += 200;
  if (name.includes(full)) score += 60;
  return score;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword, page = '1', limit = '20' } = req.query;
  if (!keyword) return res.status(400).json({ code: -1, msg: 'Missing keyword' });

  const pageNum = Number(page);
  const limitNum = Number(limit);

  // Search all platforms in parallel
  const results = await Promise.allSettled(
    PLATFORMS.map(p => searchPlatform(p, keyword, pageNum, limitNum))
  );

  let allSongs = [];
  const errors = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      allSongs = allSongs.concat(r.value);
    } else {
      errors[PLATFORMS[i]] = r.reason.message;
    }
  });

  // Sort by relevance
  const keywords = keyword.trim().split(/\s+/);
  allSongs.sort((a, b) => relevanceScore(b, keywords) - relevanceScore(a, keywords));

  return res.status(200).json({
    code: 0,
    data: allSongs,
    errors: Object.keys(errors).length ? errors : undefined
  });
}
