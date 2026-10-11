// Проверяет, каким заголовком API Multi Punk принимает ключ из site/.env.local.
// Делает только GET-запросы и печатает только коды ответов — сам ключ не выводится.
// Запуск из корня репозитория: node tools/check_mp_key.mjs
import { readFileSync } from 'node:fs';

const line = readFileSync('site/.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('MP_API_KEY='));
if (!line) throw new Error('В site/.env.local нет строки MP_API_KEY=...');
const key = line.slice('MP_API_KEY='.length).trim();

const BASE = 'https://multi-punk.ru';
const PATHS = [
  '/api/items/badges',
  '/api/items/badges/discord/1',
  '/api/items/badges/telegram/1',
  '/api/items/badges/xbox/1',
  '/api/items/emotes/discord/1',
  '/api/items/discord/1',
  '/api/users/discord/1',
];
const VARIANTS = {
  'без ключа (для сравнения)': {},
  'Authorization: Bearer <ключ>': { authorization: 'Bearer ' + key },
  'X-Api-Key: <ключ>': { 'x-api-key': key },
  'Authorization: ApiKey <ключ>': { authorization: 'ApiKey ' + key },
  'Authorization: <ключ>': { authorization: key },
};

for (const [name, headers] of Object.entries(VARIANTS)) {
  console.log(name);
  for (const path of PATHS) {
    try {
      const res = await fetch(BASE + path, { headers });
      const body = await res.text();
      const note = res.status === 200 ? `(${body.length} байт)` : body.length < 200 ? body.replaceAll(key, '<ключ>') : '';
      console.log(`  ${res.status}  ${path}  ${note}`);
    } catch (err) {
      console.log(`  ошибка  ${path}  ${err.message}`);
    }
  }
}
