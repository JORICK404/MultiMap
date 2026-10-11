const { getSession } = require('./_lib/session');
const { canEdit, load, save, clean, MAX_PORTALS } = require('./_lib/portals');

// GET  — список порталов (видят все вошедшие; пускает middleware).
// POST — правка одного портала, только для редакторов:
//   { op: 'upsert', portal: { id?, name, x, z, line } }  — добавить или изменить
//   { op: 'delete', id }                                 — удалить
// Правится по одному порталу, чтобы два редактора не затирали работу друг друга целым списком.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      res.status(200).json(await load());
    } catch (err) {
      console.error('[portals] load failed:', err);
      res.status(500).json({ error: 'не удалось прочитать порталы' });
    }
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  let session = null;
  try { session = getSession(req); } catch (err) { console.error('[portals]', err.message); }
  if (!canEdit(session)) { res.status(403).json({ error: 'нет прав на редактирование порталов' }); return; }

  const body = req.body || {};
  try {
    let portals = await load();
    if (body.op === 'upsert') {
      const portal = clean(body.portal);
      if (typeof portal === 'string') { res.status(400).json({ error: portal }); return; }
      const at = portals.findIndex(p => p.id === portal.id);
      if (at >= 0) portals[at] = portal;
      else if (portals.length >= MAX_PORTALS) { res.status(400).json({ error: 'слишком много порталов' }); return; }
      else portals = portals.concat(portal);
      await save(portals);
      console.log(`[portals] ${session.mp.nick} saved ${portal.id} "${portal.name}"`);
      res.status(200).json({ portals, id: portal.id });
    } else if (body.op === 'delete') {
      const left = portals.filter(p => p.id !== body.id);
      if (left.length === portals.length) { res.status(404).json({ error: 'такого портала уже нет' }); return; }
      await save(left);
      console.log(`[portals] ${session.mp.nick} deleted ${body.id}`);
      res.status(200).json({ portals: left });
    } else {
      res.status(400).json({ error: 'неизвестная операция' });
    }
  } catch (err) {
    console.error('[portals] save failed:', err);
    res.status(500).json({ error: 'не удалось сохранить' });
  }
};
