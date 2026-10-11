const crypto = require('crypto');
const { finishLogin, failLogin } = require('../_lib/session');

const MAX_AGE_SECONDS = 600;

// Вход через Telegram Login Widget в режиме data-auth-url: Telegram сам
// перенаправляет сюда с данными пользователя в адресе и подписью hash.
// Подпись проверяется токеном бота, поэтому подделать её без токена нельзя.
function verify(query, botToken) {
  const { hash, ...fields } = query;
  if (typeof hash !== 'string') return false;
  const checkString = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const key = crypto.createHash('sha256').update(botToken).digest();
  const want = Buffer.from(crypto.createHmac('sha256', key).update(checkString).digest('hex'));
  const got = Buffer.from(hash);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) { res.status(503).json({ error: 'telegram login is not configured' }); return; }

  const q = req.query;
  if (!verify(q, botToken)) { failLogin(req, res, 'telegram hash mismatch'); return; }
  // Старую ссылку с верной подписью повторно использовать нельзя.
  if (Math.abs(Date.now() / 1000 - Number(q.auth_date)) > MAX_AGE_SECONDS) {
    failLogin(req, res, 'telegram auth_date is too old');
    return;
  }

  await finishLogin(req, res, {
    provider: 'telegram',
    id: String(q.id),
    name: [q.first_name, q.last_name].filter(Boolean).join(' ') || q.username || 'Telegram',
    avatar: typeof q.photo_url === 'string' && q.photo_url.startsWith('https://t.me/') ? q.photo_url : null,
  });
};

module.exports.verify = verify;
