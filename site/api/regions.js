const { put, get } = require('@vercel/blob');

// Single blob, always overwritten — no history, just the latest snapshot
// the plugin sent. Stored as private: the store itself is private-access-only,
// and this way the blob's real URL is never exposed to the client — this
// function is the only thing that reads it.
const PATHNAME = 'regions.json';

async function readStream(stream) {
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

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
        access: 'private',
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
      const result = await get(PATHNAME, { access: 'private' });
      if (!result) {
        res.status(404).json({ error: 'no data uploaded yet' });
        return;
      }
      const buf = await readStream(result.stream);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(buf);
    } catch (err) {
      console.error('[regions] get failed:', err);
      res.status(404).json({ error: 'no data uploaded yet' });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
