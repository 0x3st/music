import { Readable } from 'stream';
import http from 'http';
import https from 'https';

function fetchViaNode(url, headers) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchViaNode(res.headers.location, headers).then(resolve, reject);
        res.resume();
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).end();

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).end(); }
  const allowed = [
    'kwcdn.kuwo.cn', 'sycdn.kuwo.cn',
    'music.tc.qq.com', 'y.gtimg.cn', 'music.126.net'
  ];
  if (!allowed.some(d => parsed.hostname.endsWith(d))) {
    return res.status(403).end();
  }

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetchViaNode(url, headers);

    res.status(upstream.statusCode);
    if (upstream.headers['content-type']) res.setHeader('Content-Type', upstream.headers['content-type']);
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range']) res.setHeader('Content-Range', upstream.headers['content-range']);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    upstream.pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
