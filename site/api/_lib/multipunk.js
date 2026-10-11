// Связь с API Multi Punk: по id в соцсети найти привязанный аккаунт,
// его ник в игре и платные подписки. Ключ передаётся заголовком MULTI-API-KEY.
const BASE = process.env.MP_API_URL || 'https://multi-punk.ru';

// Подписки, с которыми пускаем на карту. Свой список можно задать
// через MP_PAID_SUBSCRIPTIONS (id через запятую), не меняя код.
const PAID_SUBSCRIPTIONS = [
  'c356e55f-4824-4485-8e07-639521a82ef9',
  '9c7b0955-9aab-4648-ab11-aa159ff905e7',
  '7d274741-54e4-481d-999b-ccb3601ee239',
  '51f6a574-aa8a-4dfa-9ff4-3b798ae9a20f',
];

function paidIds() {
  const custom = (process.env.MP_PAID_SUBSCRIPTIONS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return custom.length ? custom : PAID_SUBSCRIPTIONS;
}

// null — такого нет (404); ошибка — API недоступен или не принял ключ.
async function call(path) {
  const key = process.env.MP_API_KEY;
  if (!key) throw new Error('MP_API_KEY is not set');
  const res = await fetch(BASE + path, { headers: { 'MULTI-API-KEY': key, accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Multi Punk API ${path.replace(/\d{5,}/, '…')} → HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// provider — 'discord' | 'telegram', id — id пользователя в этой соцсети.
// Возвращает null, если к этой соцсети аккаунт Multi Punk не привязан, иначе
// { nick, subscribed }: ник в игре (null без привязки Xbox) и есть ли платная подписка.
async function findAccount(provider, id) {
  const who = `${encodeURIComponent(provider)}/${encodeURIComponent(id)}`;
  // Сама привязка: /api/users/telegram/{id}/telegram или /api/users/discord/{id}/discord.
  const linked = await call(`/api/users/${who}/${encodeURIComponent(provider)}`);
  if (!linked) return null;

  const [xbox, subscriptions] = await Promise.all([
    call(`/api/users/${who}/xbox`),
    call(`/api/subscriptions/${who}`),
  ]);
  const paid = paidIds(), now = Date.now();
  const subscribed = (Array.isArray(subscriptions) ? subscriptions : []).some(s =>
    paid.includes(String(s.id).toLowerCase()) && (!s.expiresAt || Date.parse(s.expiresAt) > now));

  return { nick: (xbox && xbox.modernGamerTag) || null, subscribed };
}

module.exports = { findAccount };
