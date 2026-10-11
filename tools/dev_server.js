// Локальная замена Vercel: отдаёт файлы из site/ и выполняет функции из site/api/.
// Только для разработки. Запуск из корня репозитория: node tools/dev_server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
};

// Переменные из site/.env.local — как на Vercel, только с диска.
try {
  fs.readFileSync(path.join(SITE, '.env.local'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  });
} catch (err) {
  console.warn('site/.env.local не найден — вход работать не будет');
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      try { resolve(text ? JSON.parse(text) : undefined); } catch (err) { resolve(text); }
    });
  });
}

async function runFunction(req, res, url) {
  // /api/auth/discord → site/api/auth/discord.js; папки и файлы с «_» наружу не отдаются, как на Vercel.
  const parts = url.pathname.split('/').filter(Boolean);
  const file = path.join(SITE, ...parts) + '.js';
  if (parts.some(p => p.startsWith('_') || p.startsWith('.')) || !fs.existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
  res.send = data => res.end(data);
  res.redirect = (code, location) => { res.writeHead(code, { Location: location }).end(); };
  delete require.cache[require.resolve(file)];
  try {
    await require(file)(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Function crashed');
  }
}

function serveFile(res, url) {
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(SITE, rel);
  const hidden = rel.split('/').some(p => p.startsWith('.')) || rel.startsWith('/node_modules/');
  if (!file.startsWith(SITE + path.sep) || hidden || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) runFunction(req, res, url);
  else serveFile(res, url);
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/mockup.html`));
