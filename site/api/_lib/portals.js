const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DEFAULTS = require('./default-portals.json');

// Порталы хайперлупа: один JSON-файл в том же хранилище, что и территории.
// Пока его никто не редактировал, отдаётся стартовый список из default-portals.json.
const PATHNAME = 'portals.json';
const LINES = ['red', 'blue', 'yellow', 'green'];
const MAX_PORTALS = 300;
// Локально, без хранилища Vercel, правки пишутся в файл рядом с сайтом (в гит не попадает).
const LOCAL_FILE = path.join(__dirname, '..', '..', '.data', PATHNAME);
// На Vercel всегда идём в его хранилище и не гадаем по переменным: как именно
// авторизоваться (токен или привязка хранилища к проекту), решает сама библиотека.
const useBlob = () => Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN);

// Кто может править порталы — по нику в игре. Свой список: PORTAL_EDITORS через запятую.
function editors() {
  const custom = (process.env.PORTAL_EDITORS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return custom.length ? custom : ['jorick404', 'wryfantom2020'];
}

// Все написания ника игрока (см. multipunk.js) в нижнем регистре.
function nicksOf(mp) {
  if (!mp) return [];
  return (Array.isArray(mp.nicks) ? mp.nicks : []).concat(mp.nick ? String(mp.nick).toLowerCase() : []);
}

function canEdit(session) {
  const list = editors();
  return nicksOf(session && session.mp).some(n => list.includes(n));
}

async function load() {
  if (useBlob()) {
    const { get, BlobNotFoundError } = require('@vercel/blob');
    let result = null;
    try {
      // useCache: false — читать само хранилище, а не кеш CDN: иначе сразу после
      // сохранения приходит старый список, и следующая правка затирает предыдущую.
      result = await get(PATHNAME, { access: 'private', useCache: false });
    } catch (err) {
      // Любая другая ошибка чтения должна прервать правку, а не подменить список стартовым.
      if (!(err instanceof BlobNotFoundError)) throw err;
    }
    if (!result) return DEFAULTS;
    return JSON.parse(await new Response(result.stream).text());
  }
  return fs.existsSync(LOCAL_FILE) ? JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')) : DEFAULTS;
}

async function save(portals) {
  const body = JSON.stringify(portals);
  if (useBlob()) {
    const { put } = require('@vercel/blob');
    await put(PATHNAME, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return;
  }
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, body);
}

// Возвращает чистый портал или строку с причиной отказа. Координаты — в аду.
function clean(raw) {
  if (!raw || typeof raw !== 'object') return 'нет данных портала';
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 40) return 'название должно быть от 1 до 40 символов';
  const x = Number(raw.x), z = Number(raw.z);
  if (!Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > 400 || Math.abs(z) > 400) {
    return 'координаты должны быть целыми числами от −400 до 400';
  }
  if (!LINES.includes(raw.line)) return 'неизвестная ветка';
  const id = typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : crypto.randomUUID().slice(0, 8);
  return { id, name, x, z, line: raw.line };
}

module.exports = { canEdit, nicksOf, load, save, clean, MAX_PORTALS };
