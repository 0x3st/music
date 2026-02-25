import { Readable } from 'stream';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).end();

  // Only proxy known music CDN domains
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).end(); }
  const allowed = [
    'kwcdn.kuwo.cn', 'sycdn.kuwo.cn', 'other.web.nf01.sycdn.kuwo.cn',
    'music.tc.qq.com', 'y.gtimg.cn', 'music.126.net',
    'p1.music.126.net', 'p2.music.126.net', 'p3.music.126.net'
  ];
  if (!allowed.some(d => parsed.hostname.endsWith(d))) {
    return res.status(403).end();
  }

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(url, { headers, redirect: 'follow' });

    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
