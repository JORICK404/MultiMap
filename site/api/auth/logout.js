const { SESSION_COOKIE, addCookie } = require('../_lib/session');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  addCookie(req, res, SESSION_COOKIE, '', 0);
  res.status(200).json({ ok: true });
};
