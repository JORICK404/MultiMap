const crypto = require('crypto');
const {
  STATE_COOKIE, seal, unseal, readCookies, origin, addCookie, finishLogin, failLogin,
} = require('../_lib/session');

// Вход через Discord (OAuth2, scope=identify). Один адрес на оба шага:
// без ?code — отправляет в Discord, с ?code — принимает ответ.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  const clientId = process.env.DISCORD_CLIENT_ID, clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.status(503).json({ error: 'discord login is not configured' }); return; }

  const redirectUri = origin(req) + '/api/auth/discord';
  const { code, state, error } = req.query;

  if (!code && !error) {
    // state защищает от подмены ответа: тот же случайный код лежит в куке и уходит в Discord.
    const nonce = crypto.randomBytes(16).toString('hex');
    addCookie(req, res, STATE_COOKIE, seal('state', { nonce }, 600), 600);
    const url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
      response_type: 'code', client_id: clientId, scope: 'identify', state: nonce, redirect_uri: redirectUri,
    });
    res.redirect(302, url);
    return;
  }

  if (error) { failLogin(req, res, 'discord returned ' + error); return; }

  const saved = unseal('state', readCookies(req)[STATE_COOKIE]);
  if (!saved || saved.nonce !== state) { failLogin(req, res, 'discord state mismatch'); return; }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new Error('token exchange HTTP ' + tokenRes.status);
    const token = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + token.access_token },
    });
    if (!userRes.ok) throw new Error('users/@me HTTP ' + userRes.status);
    const user = await userRes.json();

    await finishLogin(req, res, {
      provider: 'discord',
      id: String(user.id),
      name: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
    });
  } catch (err) {
    failLogin(req, res, 'discord login failed', err);
  }
};
