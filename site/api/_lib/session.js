const crypto = require('crypto');
const { findAccount } = require('./multipunk');
const { canEdit } = require('./portals');

// Сессия целиком лежит в подписанной куке — хранилища на сервере нет.
// Файлы в api/_lib не становятся маршрутами (Vercel пропускает имена с «_»).
const SESSION_COOKIE = 'mp_session';
const STATE_COOKIE = 'mp_oauth_state';
const NEXT_COOKIE = 'mp_next';
// Подписка проверяется только при входе, поэтому сессия короткая:
// через неделю придётся войти заново, и проверка повторится.
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

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
  const session = unseal('session', readCookies(req)[SESSION_COOKIE]);
  return session && isAllowed(session) ? session : null;
}

// Куда вернуть после входа: только путь на этом же сайте, иначе главная.
function nextPath(req) {
  const next = readCookies(req)[NEXT_COOKIE] || '/';
  return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(next) ? next : '/';
}

// Закрытый режим: если задан AUTH_ALLOWLIST ("discord:123,telegram:456"),
// войти могут только перечисленные аккаунты. Пустой или не задан — входят все,
// у кого соцсеть привязана к аккаунту Multi Punk.
function allowlist() {
  return (process.env.AUTH_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
}
function isAllowed(identity) {
  const list = allowlist();
  return list.length === 0 || list.includes(identity.provider + ':' + identity.id);
}

// Кому карта доступна без подписки — по нику в игре: FREE_ACCESS_NICKS через запятую.
// Редакторы порталов входят сюда сами, иначе без подписки они не смогли бы править.
function hasFreeAccess(mp) {
  const nicks = (process.env.FREE_ACCESS_NICKS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(mp && mp.nick) && (nicks.includes(mp.nick.toLowerCase()) || canEdit({ mp }));
}

// Общий финал для всех способов входа: личность уже подтверждена провайдером.
async function finishLogin(req, res, identity) {
  if (!isAllowed(identity)) {
    // Свой id можно взять из этой строки лога и вписать в AUTH_ALLOWLIST.
    failLogin(req, res, `not in AUTH_ALLOWLIST: ${identity.provider}:${identity.id}`, null, 'denied');
    return;
  }
  // Пускаем только тех, чья соцсеть привязана к аккаунту Multi Punk
  // и у кого есть платная подписка. Исключение — аккаунты, прямо вписанные в AUTH_ALLOWLIST: им доверяем
  // и без ответа Multi Punk, иначе при сбое их API на сайт не попал бы никто.
  const trusted = allowlist().includes(identity.provider + ':' + identity.id);
  let mp = null;
  try {
    mp = await findAccount(identity.provider, identity.id);
  } catch (err) {
    if (!trusted) { failLogin(req, res, 'multipunk lookup failed', err, 'unavailable'); return; }
    console.error('[auth] multipunk lookup failed, letting allowlisted account in:', err.message);
  }
  if (!mp && !trusted) {
    failLogin(req, res, `no Multi Punk account for ${identity.provider}:${identity.id}`, null, 'notfound');
    return;
  }
  if (mp && !mp.subscribed && !trusted && !hasFreeAccess(mp)) {
    failLogin(req, res, `no paid subscription for ${identity.provider}:${identity.id}`, null, 'nosub');
    return;
  }
  addCookie(req, res, SESSION_COOKIE, seal('session', { ...identity, mp }, SESSION_MAX_AGE), SESSION_MAX_AGE);
  addCookie(req, res, STATE_COOKIE, '', 0);
  addCookie(req, res, NEXT_COOKIE, '', 0, false);
  res.redirect(302, nextPath(req));
}

function failLogin(req, res, reason, err, code = 'failed') {
  console.error('[auth] ' + reason, err || '');
  addCookie(req, res, STATE_COOKIE, '', 0);
  // Сайт закрыт для невошедших (middleware.js), поэтому показать ошибку может только страница входа.
  res.redirect(302, '/login.html?auth=' + code);
}

module.exports = {
  SESSION_COOKIE, STATE_COOKIE,
  seal, unseal, readCookies, origin, addCookie, getSession, finishLogin, failLogin,
};
