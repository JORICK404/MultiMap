const { getSession } = require('./_lib/session');

// Кто вошёл и какие способы входа настроены на сервере.
module.exports = function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  let session = null;
  try {
    session = getSession(req);
  } catch (err) {
    console.error('[me]', err.message);
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    user: session && { provider: session.provider, name: session.name, avatar: session.avatar, mp: session.mp },
    providers: {
      discord: Boolean(process.env.SESSION_SECRET && process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
      // Имя бота нужно странице, чтобы нарисовать кнопку Telegram; токен остаётся на сервере.
      telegram: (process.env.SESSION_SECRET && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_NAME) || null,
    },
  });
};
