// Проверяет ключ из site/.env.local на API Multi Punk: те же запросы, что делает вход.
// Только GET и только по HTTPS; печатает коды ответов и имена полей — без ключа и без значений.
// Запуск из корня репозитория: node tools/check_mp_key.mjs <telegram|discord> <id>
import { readFileSync } from 'node:fs';

const line = readFileSync('site/.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('MP_API_KEY='));
if (!line) throw new Error('В site/.env.local нет строки MP_API_KEY=...');
const key = line.slice('MP_API_KEY='.length).trim();

const BASE = 'https://multi-punk.ru';
const [provider = 'telegram', id = '1'] = process.argv.slice(2);

for (const who of [`${provider}/${id}`, `${provider}/1`]) {
  console.log(who === `${provider}/1` ? `${provider}/1 (заведомо чужой id)` : who);
  const paths = { привязка: `/api/users/${who}/${provider}`, xbox: `/api/users/${who}/xbox`, подписки: `/api/subscriptions/${who}` };
  for (const [name, path] of Object.entries(paths)) {
    try {
      const res = await fetch(BASE + path, { headers: { 'MULTI-API-KEY': key, accept: 'application/json' } });
      const text = await res.text();
      let shape;
      try {
        const data = JSON.parse(text);
        shape = Array.isArray(data)
          ? `массив из ${data.length}` + (data[0] ? `, поля: ${Object.keys(data[0]).join(', ')}` : '')
          : 'поля: ' + Object.keys(data).join(', ');
      } catch (err) {
        shape = text ? `не JSON, ${text.length} байт` : 'пусто';
      }
      console.log(`  ${res.status}  ${name.padEnd(9)} ${shape}`);
    } catch (err) {
      console.log(`  ошибка  ${name}  ${err.message}`);
    }
  }
}
