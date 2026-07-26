const { put, head } = require('@vercel/blob');

// Single blob, always overwritten — no history, just the latest snapshot
// the plugin sent.
const PATHNAME = 'regions.json';

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!process.env.REGIONS_UPDATE_TOKEN || token !== process.env.REGIONS_UPDATE_TOKEN) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const body = req.body;
    if (!Array.isArray(body)) {
      res.status(400).json({ error: 'expected a JSON array of territories' });
      return;
    }

    try {
      await put(PATHNAME, JSON.stringify(body), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
    } catch (err) {
      console.error('[regions] put failed:', err);
      res.status(500).json({ error: 'blob write failed', message: String(err && err.message || err) });
      return;
    }

    res.status(200).json({ ok: true, count: body.length });
    return;
  }

  if (req.method === 'GET') {
    try {
      const info = await head(PATHNAME);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.redirect(307, info.url);
    } catch (err) {
      console.error('[regions] head failed:', err);
      res.status(404).json({ error: 'no data uploaded yet' });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
