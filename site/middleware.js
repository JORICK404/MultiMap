// Закрывает весь сайт для невошедших: Vercel выполняет этот файл перед
// каждым запросом — и к страницам, и к тайлам карты, и к /api.
// Без действующей сессии доступны только страница входа и сам вход.
//
// Работает в Edge-окружении (без модулей Node), поэтому подпись куки
// проверяется через Web Crypto. Формат куки задаёт api/_lib/session.js —
// при изменениях там править и здесь.

const PUBLIC = [
  /^\/login\.html$/,
  /^\/api\/auth\//,
  /^\/api\/me$/,
  /^\/assets\/(logo\.svg|favicon\.png)$/,
  /^\/_vercel\//,
];

function fromBase64Url(text) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function readSession(request) {
  const secret = process.env.SESSION_SECRET;
  const match = /(?:^|;\s*)mp_session=([^;]+)/.exec(request.headers.get('cookie') || '');
  if (!secret || !match) return null;
  try {
    const [body, sig] = decodeURIComponent(match[1]).split('.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('HMAC', key, fromBase64Url(sig), enc.encode('session.' + body))) return null;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    return session.exp > Date.now() / 1000 ? session : null;
  } catch (err) {
    return null;
  }
}

// Тот же список, что при входе: если аккаунт убрали из AUTH_ALLOWLIST,
// уже выданная сессия перестаёт пускать.
function isAllowed(session) {
  const list = (process.env.AUTH_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(session.provider + ':' + session.id);
}

const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  const url = new URL(request.url);
  if (PUBLIC.some(re => re.test(url.pathname))) return pass();
  // Плагин сервера присылает территории со своим токеном — его проверяет сама функция.
  if (url.pathname === '/api/regions' && request.method === 'POST') return pass();

  const session = await readSession(request);
  if (session && isAllowed(session)) return pass();

  // Страницы уводим на вход (и запоминаем, куда человек шёл), остальное — просто отказ.
  if (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html')) {
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/login.html',
        'Set-Cookie': `mp_next=${encodeURIComponent(url.pathname + url.search)}; Path=/; Max-Age=600; SameSite=Lax${secure}`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
