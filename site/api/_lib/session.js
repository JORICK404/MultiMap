const crypto = require('crypto');
const { findAccount } = require('./multipunk');

// Сессия целиком лежит в подписанной куке — хранилища на сервере нет.
// Файлы в api/_lib не становятся маршрутами (Vercel пропускает имена с «_»).
const SESSION_COOKIE = 'mp_session';
const STATE_COOKIE = 'mp_oauth_state';
const NEXT_COOKIE = 'mp_next';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is not set (need at least 32 characters)');
  return s;
}

// purpose подмешивается в подпись, чтобы куку одного назначения
// (например, state) нельзя было подсунуть как другую (сессию).
function sign(purpose, body) {
  return crypto.createHmac('sha256', secret()).update(purpose + '.' + body).digest('base64url');
}

function seal(purpose, payload, maxAge) {
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  return body + '.' + sign(purpose, body);
}

function unseal(purpose, token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const got = Buffer.from(sig), want = Buffer.from(sign(purpose, body));
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch (err) {
    return null;
  }
}

function readCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (err) {}
  });
  return out;
}

function origin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}

function addCookie(req, res, name, value, maxAge, httpOnly = true) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${maxAge}`, 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (origin(req).startsWith('https://')) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [].concat(prev || [], parts.join('; ')));
}

function getSession(req) {
  return unseal('session', readCookies(req)[SESSION_COOKIE]);
}

// Куда вернуть после входа: только путь на этом же сайте, иначе главная.
function nextPath(req) {
  const next = readCookies(req)[NEXT_COOKIE] || '/';
  return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(next) ? next : '/';
}

// Закрытый режим: если задан AUTH_ALLOWLIST ("discord:123,telegram:456"),
// войти могут только перечисленные аккаунты. Пустой или не задан — входят все.
function isAllowed(identity) {
  const list = (process.env.AUTH_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(identity.provider + ':' + identity.id);
}

// Общий финал для всех способов входа: личность уже подтверждена провайдером.
async function finishLogin(req, res, identity) {
  if (!isAllowed(identity)) {
    // Свой id можно взять из этой строки лога и вписать в AUTH_ALLOWLIST.
    failLogin(req, res, `not in AUTH_ALLOWLIST: ${identity.provider}:${identity.id}`, null, 'denied');
    return;
  }
  let mp = null;
  try {
    mp = await findAccount(identity.provider, identity.id);
  } catch (err) {
    console.error('[auth] multipunk lookup failed:', err);
  }
  addCookie(req, res, SESSION_COOKIE, seal('session', { ...identity, mp }, SESSION_MAX_AGE), SESSION_MAX_AGE);
  addCookie(req, res, STATE_COOKIE, '', 0);
  addCookie(req, res, NEXT_COOKIE, '', 0, false);
  res.redirect(302, nextPath(req));
}

function failLogin(req, res, reason, err, code = 'failed') {
  console.error('[auth] ' + reason, err || '');
  const next = nextPath(req).split('#')[0];
  addCookie(req, res, STATE_COOKIE, '', 0);
  res.redirect(302, next + (next.includes('?') ? '&' : '?') + 'auth=' + code);
}

module.exports = {
  SESSION_COOKIE, STATE_COOKIE,
  seal, unseal, readCookies, origin, addCookie, getSession, finishLogin, failLogin,
};
