const TUNEHUB_BASE = 'https://tunehub.sayqz.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.TUNEHUB_API_KEY;
  if (!API_KEY) return res.status(500).json({ code: -1, msg: 'API Key not configured' });

  const { platform, keyword, page = '0', pageSize = '30' } = req.query;
  if (!platform || !keyword) {
    return res.status(400).json({ code: -1, msg: 'Missing platform or keyword' });
  }

  try {
    // Step 1: Get method config from TuneHub
    const configRes = await fetch(`${TUNEHUB_BASE}/v1/methods/${platform}/search`, {
      headers: { 'X-API-Key': API_KEY }
    });
    const configJson = await configRes.json();
    if (configJson.code !== 0) {
      return res.status(502).json({ code: -1, msg: 'Failed to get method config', detail: configJson });
    }

    const config = configJson.data;

    // Step 2: Replace template variables in params/body/url
    const replaceVars = (str) => {
      if (typeof str !== 'string') return str;
      return str
        .replace(/\{\{keyword\}\}/g, keyword)
        .replace(/\{\{page\}\}/g, page)
        .replace(/\{\{pageSize\}\}/g, pageSize);
    };

    let url = replaceVars(config.url);
    const headers = config.headers || {};

    if (config.method === 'GET' && config.params) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(config.params)) {
        params.set(key, replaceVars(String(value)));
      }
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    // Step 3: Execute upstream request
    const fetchOpts = { method: config.method, headers };
    if (config.method === 'POST' && config.body) {
      const body = JSON.parse(JSON.stringify(config.body), (key, val) =>
        typeof val === 'string' ? replaceVars(val) : val
      );
      fetchOpts.body = JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const upstream = await fetch(url, fetchOpts);
    const contentType = upstream.headers.get('content-type') || '';
    let data;
    if (contentType.includes('json')) {
      data = await upstream.json();
    } else {
      data = await upstream.text();
      // Try parsing as JSON anyway
      try { data = JSON.parse(data); } catch {}
    }

    // Step 4: Apply transform if available
    if (config.transform) {
      try {
        const fn = new Function('return ' + config.transform)();
        data = fn(data);
      } catch (e) {
        // Transform failed, return raw data
      }
    }

    return res.status(200).json({ code: 0, data });
  } catch (err) {
    return res.status(500).json({ code: -1, msg: err.message });
  }
}
