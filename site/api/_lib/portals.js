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

// Кто может править порталы — по нику в игре. Свой список: PORTAL_EDITORS через запятую.
function editors() {
  const custom = (process.env.PORTAL_EDITORS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return custom.length ? custom : ['jorick404', 'wryfantom2020'];
}

function canEdit(session) {
  const nick = session && session.mp && session.mp.nick;
  return Boolean(nick) && editors().includes(String(nick).toLowerCase());
}

async function load() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { get } = require('@vercel/blob');
    let result = null;
    try { result = await get(PATHNAME, { access: 'private' }); } catch (err) { /* файла ещё нет */ }
    if (!result) return DEFAULTS;
    return JSON.parse(await new Response(result.stream).text());
  }
  return fs.existsSync(LOCAL_FILE) ? JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')) : DEFAULTS;
}

async function save(portals) {
  const body = JSON.stringify(portals);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    await put(PATHNAME, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return;
  }
  if (process.env.VERCEL) throw new Error('BLOB_READ_WRITE_TOKEN is not set');
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

module.exports = { canEdit, load, save, clean, MAX_PORTALS };
