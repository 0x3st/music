const TUNEHUB_BASE = 'https://tunehub.sayqz.com/api';

function evalTemplate(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
    try {
      const fn = new Function(...Object.keys(vars), `return (${expr})`);
      return fn(...Object.values(vars));
    } catch { return expr; }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { platform, keyword, page = '1', limit = '30' } = req.query;
  if (!platform || !keyword) {
    return res.status(400).json({ code: -1, msg: 'Missing platform or keyword' });
  }

  const vars = { keyword, page: Number(page), limit: Number(limit) };

  try {
    // Step 1: Get method config
    const configRes = await fetch(`${TUNEHUB_BASE}/v1/methods/${platform}/search`);
    const configJson = await configRes.json();
    if (configJson.code !== 0) {
      return res.status(502).json({ code: -1, msg: 'Failed to get method config', detail: configJson });
    }
    const config = configJson.data;

    // Step 2: Build request with evaluated templates
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
      const body = JSON.parse(JSON.stringify(config.body), (k, v) =>
        typeof v === 'string' ? evalTemplate(v, vars) : v
      );
      fetchOpts.body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    // Step 3: Execute upstream
    const upstream = await fetch(url, fetchOpts);
    const ct = upstream.headers.get('content-type') || '';
    let data;
    if (ct.includes('json')) {
      data = await upstream.json();
    } else {
      const text = await upstream.text();
      try { data = JSON.parse(text); } catch { data = text; }
    }

    // Step 4: Apply transform
    if (config.transform) {
      try {
        const fn = new Function('return ' + config.transform)();
        data = fn(data);
      } catch {}
    }

    return res.status(200).json({ code: 0, data });
  } catch (err) {
    return res.status(500).json({ code: -1, msg: err.message });
  }
}
