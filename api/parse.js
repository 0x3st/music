const TUNEHUB_BASE = 'https://tunehub.sayqz.com/api';

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

  const { platform, ids, quality = '320k' } = req.body || {};
  if (!platform || !ids) {
    return res.status(400).json({ code: -1, msg: 'Missing platform or ids' });
  }

  try {
    const upstream = await fetch(`${TUNEHUB_BASE}/v1/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ platform, ids: String(ids), quality })
    });

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ code: -1, msg: err.message });
  }
}
