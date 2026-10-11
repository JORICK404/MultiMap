const { getSession } = require('./_lib/session');
const { canEdit } = require('./_lib/portals');

// Кто вошёл и какие способы входа настроены на сервере.
module.exports = function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  let session = null;
  try {
    session = getSession(req);
  } catch (err) {
    console.error('[me]', err.message);
  }

  // Только имена незаданных переменных — чтобы было видно, чего не хватает на этом деплое.
  const missing = ['SESSION_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_NAME']
    .filter(name => !process.env[name]);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    user: session && {
      provider: session.provider, name: session.name, avatar: session.avatar, mp: session.mp,
      canEditPortals: canEdit(session),
    },
    missing,
    env: process.env.VERCEL_ENV || 'local',
    providers: {
      discord: Boolean(process.env.SESSION_SECRET && process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
      // Имя бота нужно странице, чтобы нарисовать кнопку Telegram; токен остаётся на сервере.
      telegram: (process.env.SESSION_SECRET && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_NAME) || null,
    },
  });
};
