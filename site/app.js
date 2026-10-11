/* ============ данные ============ */

// sx/sz — знак X и Z четверти (в Minecraft север — это −Z, то есть верх карты).
const GUBS = [
  { id: 'green',  name: 'Зелёная', color: '#3DDC6B', sx: -1, sz: -1 },
  { id: 'red',    name: 'Красная', color: '#FF5A52', sx:  1, sz: -1 },
  { id: 'yellow', name: 'Жёлтая',  color: '#FFD23F', sx: -1, sz:  1 },
  { id: 'blue',   name: 'Синяя',   color: '#4FA3FF', sx:  1, sz:  1 },
];
const gubOf = (x, z) => GUBS.find(g => (x < 0 ? -1 : 1) === g.sx && (z < 0 ? -1 : 1) === g.sz);
const colorOf = id => GUBS.find(g => g.id === id).color;

// Магистрали хайперлупа: от спавна в четыре стороны.
const LINES = [
  { id: 'red',    name: 'Красная', dir: 'на север',  dx:  0, dz: -1 },
  { id: 'blue',   name: 'Синяя',   dir: 'на восток', dx:  1, dz:  0 },
  { id: 'yellow', name: 'Жёлтая',  dir: 'на юг',     dx:  0, dz:  1 },
  { id: 'green',  name: 'Зелёная', dir: 'на запад',  dx: -1, dz:  0 },
].map(l => ({ ...l, color: colorOf(l.id) }));

const BOSSES = [
  { name: 'Тотемник', x: -1866, z: 243 },
  { name: 'Флейтист', x: 1291, z: 498 },
  { name: 'Склеп', x: 45, z: -1265 },
];

const ROLES = { owner: 'владелец', sherif: 'шериф', resident: 'житель' };
const WORLDS = { over: { half: 3000, size: 6001, maxK: 8 }, nether: { half: 375, size: 751, maxK: 24 } };
const MAP_DIR = 'assets/map/';
const FRAME_OUT = .065;   // отступ подписи губернии от карты, в долях полумира
const EXIT_MIN_K = .55;   // выходы хайперлупа на верхней карте видны только вблизи
let TILE = 512, MAP_VERSION = 0;

let territories = [], stations = [];

/* ============ состояние ============ */

let world = 'over';
const layers = { gub: true, terr: true, boss: true, loop: true };
const LAYER_NAMES = { gub: 'Губернии', terr: 'Территории', boss: 'Боссы', loop: 'Порталы' };
let groupFilter = null, selected = null;
const view = { k: 1, tx: 0, ty: 0, fitK: 1 };
const anchors = [];
const registry = new Map();

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = () => WORLDS[world];
const px = v => v + W().half;
const num = n => String(Math.round(n)).replace('-', '−');
const SVG = 'http://www.w3.org/2000/svg';
const mq = matchMedia('(max-width: 820px)');
const mobile = () => mq.matches;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ============ тема ============ */

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = t === 'light' ? '#FFFFFF' : '#150C61';
  try { localStorage.setItem('theme', t); } catch (e) {}
}
{
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  setTheme(saved === 'light' ? 'light' : 'dark');
}

/* ============ подготовка данных ============ */

// Traces the outer boundary of a union of axis-aligned rectangles (a
// territory's region plus its subregions) as one closed rectilinear
// polygon, so region + subregions render as a single shape with no seam
// where they touch. Works by rasterising onto the grid formed by all
// rect edges, then keeping only edges between a covered and an uncovered
// cell (shared internal edges between two covered cells cancel out).
function unionOutline(rects) {
  const xsSet = new Set(), zsSet = new Set();
  rects.forEach(r => { xsSet.add(r.x1); xsSet.add(r.x2); zsSet.add(r.z1); zsSet.add(r.z2); });
  const xs = Array.from(xsSet).sort((a, b) => a - b);
  const zs = Array.from(zsSet).sort((a, b) => a - b);
  const nx = xs.length - 1, nz = zs.length - 1;

  const covered = Array.from({ length: nx }, (_, i) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    return Array.from({ length: nz }, (_, j) => {
      const cz = (zs[j] + zs[j + 1]) / 2;
      return rects.some(r => cx > r.x1 && cx < r.x2 && cz > r.z1 && cz < r.z2);
    });
  });

  const edges = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!covered[i][j]) continue;
      if (j === 0 || !covered[i][j - 1]) edges.push([[xs[i], zs[j]], [xs[i + 1], zs[j]]]);
      if (j === nz - 1 || !covered[i][j + 1]) edges.push([[xs[i], zs[j + 1]], [xs[i + 1], zs[j + 1]]]);
      if (i === 0 || !covered[i - 1][j]) edges.push([[xs[i], zs[j]], [xs[i], zs[j + 1]]]);
      if (i === nx - 1 || !covered[i + 1][j]) edges.push([[xs[i + 1], zs[j]], [xs[i + 1], zs[j + 1]]]);
    }
  }

  const key = p => p[0] + ',' + p[1];
  const adjacency = new Map();
  edges.forEach(([a, b]) => {
    [[a, b], [b, a]].forEach(([from, to]) => {
      const k = key(from);
      if (!adjacency.has(k)) adjacency.set(k, []);
      adjacency.get(k).push(to);
    });
  });

  const edgeKey = (a, b) => key(a) + '|' + key(b);
  const usedEdge = new Set();
  const loops = [];

  edges.forEach(([a, b]) => {
    if (usedEdge.has(edgeKey(a, b))) return;
    const loop = [a];
    usedEdge.add(edgeKey(a, b)); usedEdge.add(edgeKey(b, a));
    let cur = b;
    while (key(cur) !== key(loop[0])) {
      loop.push(cur);
      const next = (adjacency.get(key(cur)) || []).find(n => !usedEdge.has(edgeKey(cur, n)));
      if (!next) break;
      usedEdge.add(edgeKey(cur, next)); usedEdge.add(edgeKey(next, cur));
      cur = next;
    }
    if (loop.length >= 3) loops.push(simplifyLoop(loop));
  });

  return loops;
}

function simplifyLoop(points) {
  const n = points.length;
  const out = points.filter((cur, i) => {
    const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
    const collinear = (prev[0] === cur[0] && cur[0] === next[0]) || (prev[1] === cur[1] && cur[1] === next[1]);
    return !collinear;
  });
  return out.length >= 3 ? out : points;
}

function buildTerritory(raw, i) {
  const rects = raw.regions.map(r => ({
    x1: Math.min(r.firstPoint.x, r.secondPoint.x), x2: Math.max(r.firstPoint.x, r.secondPoint.x),
    z1: Math.min(r.firstPoint.z, r.secondPoint.z), z2: Math.max(r.firstPoint.z, r.secondPoint.z),
  }));
  const b = rects.reduce((a, r) => ({
    x1: Math.min(a.x1, r.x1), x2: Math.max(a.x2, r.x2), z1: Math.min(a.z1, r.z1), z2: Math.max(a.z2, r.z2),
  }));
  const cx = Math.round((b.x1 + b.x2) / 2), cz = Math.round((b.z1 + b.z2) / 2);
  const owner = raw.residents.find(r => r.status === 'owner') || raw.residents[0];
  return {
    key: 't:' + i, type: 'terr', name: (raw.name || 'Без названия').trim(), about: raw.description || '',
    rects, b, cx, cz, owner: owner ? owner.name : '—', residents: raw.residents,
    group: raw.name === 'Спавн' ? null : gubOf(cx, cz),
    hay: [raw.name, ...raw.residents.map(r => r.name)].join(' ').toLowerCase(),
  };
}

// Порталы приходят с сервера (/api/portals), координаты — в аду.
function setPortals(list) {
  stations = [{ key: 's:hub', type: 'station', name: 'Спавн', x: 0, z: 0, hub: true, group: null }]
    .concat(list.map(p => ({
      key: 's:' + p.id, id: p.id, type: 'station', name: p.name, x: p.x, z: p.z,
      group: LINES.find(l => l.id === p.line) || LINES[0],
    })));
}

/* ============ отрисовка ============ */

function el(tag, attrs, parent) {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

function anchor(x, z, html, opts = {}) {
  const a = document.createElement('div');
  a.className = 'a';
  a.innerHTML = html;
  $('anchors').appendChild(a);
  anchors.push({ el: a, x: px(x), z: px(z), ...opts });
  return a;
}

const SKULL = '<svg viewBox="0 0 16 16"><path d="M3 2h10v2h1v6h-2v2h-1v2H5v-2H4v-2H2V4h1zM5 6v3h2V6zm4 0v3h2V6zM7 10v1h2v-1z"/></svg>';

function rebuild() {
  const g = $('world'), half = W().half, size = W().size;
  g.innerHTML = ''; $('anchors').innerHTML = ''; anchors.length = 0; registry.clear();
  $('map').classList.toggle('nether', world === 'nether');

  if (layers.gub || world === 'nether') {
    GUBS.forEach(q => {
      el('rect', {
        class: 'g-tint', fill: q.color, 'fill-opacity': world === 'nether' ? .05 : .14,
        x: q.sx < 0 ? 0 : half, y: q.sz < 0 ? 0 : half, width: half + (q.sx > 0 ? 1 : 0), height: half + (q.sz > 0 ? 1 : 0),
      }, g);
      if (world === 'over') {
                // Уголок — по краю самой карты, внутри рамки; подпись — за рамкой.
        const o = half * FRAME_OUT, arm = 0;   // 0 — уголок тянется до середины стороны, half — исчезает
        const cx = q.sx < 0 ? 0 : size, cz = q.sz < 0 ? 0 : size;
        el('path', { class: 'g-corner', stroke: q.color, d: `M${px(q.sx * arm)} ${cz}H${cx}V${px(q.sz * arm)}` }, g);
        anchor(q.sx * half * .5, q.sz * (half + o),
          `<div class="g-name ${q.sz < 0 ? 'top' : 'bot'}" style="--c:${q.color}">${q.name}</div>`);
      }
    });
    if (world === 'over') el('path', { class: 'g-axis', d: `M0 ${half}H${size}M${half} 0V${size}` }, g);
  }

  if (world === 'over') {
    if (layers.terr) territories.forEach(t => {
      const c = t.group ? t.group.color : '#fff';
      // Углы региона — включительные блоки, поэтому дальний край на +1.
      const d = unionOutline(t.rects.map(r => ({ x1: px(r.x1), x2: px(r.x2 + 1), z1: px(r.z1), z2: px(r.z2 + 1) })))
        .map(loop => 'M' + loop.map(p => p[0] + ' ' + p[1]).join('L') + 'Z').join('');
      el('path', { class: 't-case', d }, g);
      el('path', { class: 't-rect', d, stroke: c, fill: c, 'fill-opacity': .18, 'fill-rule': 'evenodd', 'data-sel': t.key }, g);
      registry.set(t.key, t);
    });
    if (layers.loop) stations.filter(s => !s.hub).forEach(s => {
      const o = { ...s, key: 'e' + s.key, type: 'exit', nx: s.x, nz: s.z, x: s.x * 8, z: s.z * 8 };
      anchor(o.x, o.z, `<div class="pin exit" style="--c:${s.group.color}" data-sel="${o.key}"></div>`, { minK: EXIT_MIN_K });
      registry.set(o.key, o);
    });
    if (layers.boss) BOSSES.forEach((b, i) => {
      const o = { ...b, key: 'b:' + i, type: 'boss', group: gubOf(b.x, b.z) };
      anchor(b.x, b.z, `<div class="pin boss" data-sel="${o.key}">${SKULL}</div><div class="cap below">${esc(b.name)}</div>`);
      registry.set(o.key, o);
    });
    anchor(0, 0, '<div class="spawn"></div><div class="cap">Спавн</div>');
  } else {
    // Магистраль идёт по оси от спавна, к каждому порталу — ответвление под прямым углом.
    LINES.forEach(l => {
      const stops = stations.filter(s => s.group === l);
      const reach = Math.max(120, ...stops.map(s => s.x * l.dx + s.z * l.dz)) + 30;
      const trunk = `M${px(0)} ${px(0)}L${px(l.dx * reach)} ${px(l.dz * reach)}`;
      const spurs = stops.map(s => `M${px(l.dx ? s.x : 0)} ${px(l.dz ? s.z : 0)}L${px(s.x)} ${px(s.z)}`).join('');
      el('path', { class: 'l-case', d: trunk }, g);
      el('path', { class: 'l-case l-spur', d: spurs }, g);
      el('path', { class: 'l-line l-spur', d: spurs, stroke: l.color }, g);
      el('path', { class: 'l-line', d: trunk, stroke: l.color }, g);
    });
    stations.forEach(s => {
      anchor(s.x, s.z, `<div class="pin station${s.hub ? ' hub' : ''}" style="--c:${s.group ? s.group.color : '#fff'}" data-sel="${s.key}"></div>` +
        `<div class="cap">${esc(s.name)}<small>${num(s.x)} / ${num(s.z)}</small></div>`);
      registry.set(s.key, s);
    });
  }
  markSelected();
  apply();
}

function markSelected() {
  document.querySelectorAll('.sel').forEach(n => n.classList.remove('sel'));
  if (selected) document.querySelectorAll(`[data-sel="${selected.key}"]`).forEach(n => n.classList.add('sel'));
}

/* ============ камера ============ */

const rect = () => $('view').getBoundingClientRect();

// Часть карты, не закрытая интерфейсом: всё центрируется относительно неё.
function insets() {
  if (!mobile()) return { l: 22, t: 22, r: 0, b: 0 };
  const card = $('card');
  return { l: 0, t: 64, r: 0, b: card.hidden ? peekH() : card.offsetHeight };
}
function center() {
  const r = rect(), i = insets();
  return { x: i.l + (r.width - i.l - i.r) / 2, y: i.t + (r.height - i.t - i.b) / 2 };
}

function fitK(x1, z1, x2, z2) {
  const r = rect(), i = insets(), pad = mobile() ? 10 : 24;
  return Math.min((r.width - i.l - i.r - pad * 2) / (x2 - x1), (r.height - i.t - i.b - pad * 2) / (z2 - z1));
}
// Весь мир вместе с рамкой и подписями губерний вокруг неё.
function worldFitK() {
  const h = W().half, mx = world === 'over' ? h * .09 : 0, mz = world === 'over' ? h * .16 : 0;
  return fitK(-h - mx, -h - mz, h + 1 + mx, h + 1 + mz);
}
function fitTo(x1, z1, x2, z2, maxK) {
  goto((x1 + x2) / 2, (z1 + z2) / 2, Math.min(fitK(x1, z1, x2, z2), maxK || Infinity));
}
function fit() {
  view.fitK = worldFitK();
  goto(.5, .5, view.fitK);
}
function goto(x, z, k) {
  const c = center();
  if (k) view.k = k;
  view.tx = c.x - px(x) * view.k;
  view.ty = c.y - px(z) * view.k;
  apply();
}

function zoomAt(sx, sy, f) {
  const next = Math.max(view.fitK * .7, Math.min(W().maxK, view.k * f)), ratio = next / view.k;
  view.tx = sx - (sx - view.tx) * ratio;
  view.ty = sy - (sy - view.ty) * ratio;
  view.k = next;
  apply();
}

function apply() {
  const r = rect(), s = W().size * view.k, c = center();
  view.tx = Math.min(c.x, Math.max(c.x - s, view.tx));
  view.ty = Math.min(c.y, Math.max(c.y - s, view.ty));

  const st = $('stage').style;
  st.width = st.height = s + 'px';
  st.transform = `translate(${view.tx}px, ${view.ty}px)`;
  const fr = $('frame').style;
  fr.width = fr.height = s * 1.1 + 'px';
  fr.transform = `translate(${view.tx - s * .05}px, ${view.ty - s * .05}px)`;
  if (world === 'nether') st.backgroundSize = `${16 * view.k}px ${16 * view.k}px`;
  $('world').setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);

  const far = view.k < view.fitK * 2.6;
  anchors.forEach(a => {
    a.el.style.transform = `translate(${view.tx + a.x * view.k}px, ${view.ty + a.z * view.k}px)`;
    if (a.far) a.el.style.opacity = far ? 1 : 0;
    if (a.minK) a.el.hidden = view.k < a.minK;
  });
  $('cross').style.left = c.x + 'px'; $('cross').style.top = c.y + 'px';
  updateTiles(r);
  if (!mobile()) { drawRulers(r); drawScale(); }
  updateHud();
  saveHash();
}

/* ---------- тайлы (как в текущем app.js) ---------- */

const tileEls = new Map();
function updateTiles(r) {
  const want = new Set();
  if (world === 'over' && view.k >= .4 / Math.min(devicePixelRatio || 1, 2)) {
    const n = Math.ceil(W().size / TILE);
    const c0 = Math.max(0, Math.floor(-view.tx / view.k / TILE)), c1 = Math.min(n - 1, Math.floor((r.width - view.tx) / view.k / TILE));
    const r0 = Math.max(0, Math.floor(-view.ty / view.k / TILE)), r1 = Math.min(n - 1, Math.floor((r.height - view.ty) / view.k / TILE));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) want.add(x + '_' + y);
  }
  tileEls.forEach((n, id) => { if (!want.has(id)) { n.remove(); tileEls.delete(id); } });
  want.forEach(id => {
    if (tileEls.has(id)) return;
    const [x, y] = id.split('_').map(Number), S = W().size, n = document.createElement('div');
    n.className = 'tile';
    n.style.cssText = `left:${x * TILE / S * 100}%;top:${y * TILE / S * 100}%;width:${Math.min(S - x * TILE, TILE + 1) / S * 100}%;height:${Math.min(S - y * TILE, TILE + 1) / S * 100}%;background-image:url('${MAP_DIR}tiles/${id}.webp?v=${MAP_VERSION}')`;
    $('tiles').appendChild(n);
    tileEls.set(id, n);
  });
}

/* ---------- линейки, масштаб, HUD ---------- */

const niceStep = minPx => [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].find(s => s * view.k >= minPx) || 5000;

function drawRulers(r) {
  const R = 22, dpr = devicePixelRatio || 1, step = niceStep(64), half = W().half, zero = css('--zero'), tick = css('--muted');
  [[$('rulerX'), r.width, R, true], [$('rulerZ'), R, r.height, false]].forEach(([c, w, h, horiz]) => {
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = css('--bg'); ctx.fillRect(0, 0, w, h);
    ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
    const off = horiz ? view.tx : view.ty, len = horiz ? w : h;
    const from = Math.ceil(((0 - off) / view.k - half) / step) * step, to = (len - off) / view.k - half;
    for (let v = from; v <= to; v += step) {
      if (Math.abs(v) > half) continue;
      const p = Math.round(off + (v + half) * view.k);
      if (p < R) continue;
      ctx.fillStyle = v === 0 ? zero : tick;
      if (horiz) { ctx.fillRect(p, R - 6, 1, 6); ctx.fillText(num(v), p + 4, 10); }
      else { ctx.fillRect(R - 6, p, 6, 1); ctx.save(); ctx.translate(10, p - 4); ctx.rotate(-Math.PI / 2); ctx.fillText(num(v), 0, 0); ctx.restore(); }
    }
  });
}

function drawScale() {
  const step = niceStep(70);
  $('scaleLabel').textContent = step + ' блоков';
  $('scaleBar').style.width = step * view.k + 'px';
}

// На компьютере — координаты под курсором, на телефоне — под перекрестием.
let pointer = null;
function updateHud() {
  const r = rect(), c = center(), p = pointer ? { x: pointer.x - r.left, y: pointer.y - r.top } : c;
  const x = Math.floor((p.x - view.tx) / view.k - W().half), z = Math.floor((p.y - view.ty) / view.k - W().half);
  const other = world === 'over' ? `в аду ${num(Math.floor(x / 8))} / ${num(Math.floor(z / 8))}` : `наверху ${num(x * 8)} / ${num(z * 8)}`;
  const q = world === 'over' && Math.abs(x) <= W().half && Math.abs(z) <= W().half ? gubOf(x, z) : null;
  $('hud').innerHTML = `X ${num(x)}  Z ${num(z)}\n<span>${other}</span>` + (q ? `\n<b style="color:${q.color}">■</b> ${q.name}` : '');
}

let hashTimer;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const c = center(), x = Math.round((c.x - view.tx) / view.k - W().half), z = Math.round((c.y - view.ty) / view.k - W().half);
    history.replaceState(null, '', `#${world}/${x}/${z}/${(view.k / view.fitK).toFixed(2)}`);
  }, 250);
}

/* ============ ввод на карте ============ */

const pts = new Map();
let moved = 0, pinch = null;
const v = $('view');

v.addEventListener('pointerdown', e => {
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  v.setPointerCapture(e.pointerId);
  moved = 0; pinch = null;
  v.classList.add('dragging');
  $('tip').hidden = true;
  $('q').blur();
  if (sheet.state !== 'peek') setSheet('peek');
});
v.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY };
  if (!pts.has(e.pointerId)) { updateHud(); hover(e); return; }
  const prev = pts.get(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size >= 2) {
    const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = rect();
    if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch);
    pinch = d; moved = 99;
    return;
  }
  moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
  view.tx += e.clientX - prev.x; view.ty += e.clientY - prev.y;
  apply();
});
function up(e) {
  const tap = pts.size === 1 && moved <= 14;
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (!pts.size) v.classList.remove('dragging');
  if (!tap) return;
  // Захват указателя ломает обычный click по вложенным фигурам — ищем цель сами.
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const key = hit && hit.closest('[data-sel]');
  select(key ? registry.get(key.dataset.sel) : null);
}
v.addEventListener('pointerup', up);
v.addEventListener('pointercancel', up);
v.addEventListener('pointerleave', () => { pointer = null; $('tip').hidden = true; updateHud(); });
v.addEventListener('wheel', e => {
  e.preventDefault();
  const r = rect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * .0016));
}, { passive: false });
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => v.addEventListener(t, e => e.preventDefault()));

function hover(e) {
  const n = e.target.closest && e.target.closest('[data-sel]'), o = n && registry.get(n.dataset.sel), tip = $('tip');
  if (!o || o.type === 'station' || e.pointerType !== 'mouse') { tip.hidden = true; return; }
  const r = $('map').getBoundingClientRect();
  tip.hidden = false;
  tip.style.left = e.clientX - r.left + 'px'; tip.style.top = e.clientY - r.top + 'px';
  tip.innerHTML = esc(o.name) + `<small>${o.type === 'terr' ? esc(o.owner) + ' · ' + o.residents.length + ' жит.' : o.type === 'boss' ? 'босс' : 'портал'}</small>`;
}

$('zin').onclick = () => { const c = center(); zoomAt(c.x, c.y, 1.6); };
$('zout').onclick = () => { const c = center(); zoomAt(c.x, c.y, 1 / 1.6); };
$('zfit').onclick = fit;
window.addEventListener('keydown', e => { if (e.key === 'Escape') select(null); if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('q').focus(); } });

/* ============ шторка на телефоне ============ */

const sheet = { state: 'peek', y: 0 };
const peekH = () => $('scroll').offsetTop + 2;
function snapY(state) {
  const h = $('side').offsetHeight;
  return { full: 0, half: Math.max(0, h - innerHeight * .52), peek: h - peekH() }[state];
}
function setSheet(state) {
  sheet.state = state;
  sheet.y = snapY(state);
  $('side').style.setProperty('--y', sheet.y + 'px');
  document.documentElement.style.setProperty('--peek', peekH() + 'px');
}
{
  const grab = $('grab'), side = $('side');
  let start = null;
  grab.addEventListener('pointerdown', e => { start = { py: e.clientY, y: sheet.y, moved: 0 }; grab.setPointerCapture(e.pointerId); side.classList.add('dragging'); });
  grab.addEventListener('pointermove', e => {
    if (!start) return;
    const dy = e.clientY - start.py;
    start.moved = Math.max(start.moved, Math.abs(dy));
    sheet.y = Math.max(0, Math.min(snapY('peek'), start.y + dy));
    side.style.setProperty('--y', sheet.y + 'px');
  });
  const end = () => {
    if (!start) return;
    side.classList.remove('dragging');
    if (start.moved < 6) setSheet({ peek: 'half', half: 'full', full: 'peek' }[sheet.state]);
    else setSheet(['full', 'half', 'peek'].sort((a, b) => Math.abs(snapY(a) - sheet.y) - Math.abs(snapY(b) - sheet.y))[0]);
    start = null;
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
  $('q').addEventListener('focus', () => { if (mobile()) setSheet('full'); });
}

/* ============ карточка ============ */

function select(o) {
  selected = o || null;
  markSelected();
  const card = $('card');
  card.hidden = !o;
  document.body.classList.toggle('has-card', !!o);
  if (!o) { apply(); return; }
  const g = o.group, tag = { terr: 'Территория', boss: 'Босс', station: 'Портал', exit: 'Портал' }[o.type];
  let rows = '', extra = '';
  const row = (k, val) => rows += `<dt>${k}</dt><dd>${val}</dd>`;
  if (o.type === 'terr') {
    row('Границы', `X ${num(o.b.x1)} … ${num(o.b.x2)}<br>Z ${num(o.b.z1)} … ${num(o.b.z2)}`);
    row('Размер', `${o.b.x2 - o.b.x1 + 1} × ${o.b.z2 - o.b.z1 + 1}`);
    row('В аду это', `${num(o.cx / 8)} / ${num(o.cz / 8)}`);
    extra = `<h4>Жители · ${o.residents.length}</h4><ul>` + o.residents.map(r => `<li>${esc(r.name)}<span>${ROLES[r.status] || esc(r.status)}</span></li>`).join('') + '</ul>';
  } else if (o.type === 'boss') {
    row('Координаты', `${num(o.x)} / ${num(o.z)}`);
    row('В аду это', `${num(o.x / 8)} / ${num(o.z / 8)}`);
    row('Ближайший портал', nearestStation(o.x, o.z));
  } else {
    const nx = o.type === 'exit' ? o.nx : o.x, nz = o.type === 'exit' ? o.nz : o.z;
    row('В аду', `${num(nx)} / ${num(nz)}`);
    row('В верхнем мире', `${num(nx * 8)} / ${num(nz * 8)}`);
    if (g) row('Ветка', `${g.name}, ${g.dir}`);
    if (canEditPortals() && !o.hub) extra = '<button class="edit" data-act="edit">Изменить портал</button>';
  }
  const where = g ? (o.type === 'terr' || o.type === 'boss' ? ` · ${g.name} губерния` : ` · ${g.name} ветка`) : '';
  card.style.setProperty('--c', g ? g.color : '#DEFFEA');
  card.innerHTML = `<header><div class="tag">${tag}${where}</div><h2>${esc(o.name)}</h2><button class="x" data-act="close" aria-label="Закрыть">✕</button></header>` +
    `<div class="body">${o.about ? `<p>${esc(o.about)}</p>` : ''}<dl>${rows}</dl>${extra}</div>`;
}

// Показывает объект в свободной от карточки части экрана.
function focusOn(o) {
  select(o);
  if (o.type === 'terr') fitTo(o.b.x1 - 40, o.b.z1 - 40, o.b.x2 + 41, o.b.z2 + 41, 3);
  else goto(o.x, o.z, Math.max(view.k, world === 'over' ? .8 : view.fitK * 2));
}

function nearestStation(x, z) {
  const d = s => Math.hypot(s.x * 8 - x, s.z * 8 - z), s = stations.slice().sort((a, b) => d(a) - d(b))[0];
  return s ? `${esc(s.name)}<br>${Math.round(d(s))} бл.` : '—';
}

$('card').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const o = selected, act = b.dataset.act;
  if (act === 'close') select(null);
  if (act === 'edit') editPortal(o.type === 'exit' ? stations.find(s => 'e' + s.key === o.key) : o);
  if (act === 'cancel') select(portalForm && portalForm.id ? stations.find(s => s.id === portalForm.id) : null);
  if (act === 'save') savePortal(b);
  if (act === 'remove') removePortal(b);
});

/* ============ редактор порталов ============ */

// Кнопки правки видят только те, кого сервер считает редактором; права он проверяет ещё раз при сохранении.
const canEditPortals = () => Boolean(auth && auth.user && auth.user.canEditPortals);
let portalForm = null;

// portal === null — новый портал: координаты берутся из центра экрана, ветка — по ближайшей оси.
function editPortal(portal) {
  if (world !== 'nether') setWorld('nether');
  const c = center(), h = W().half;
  const at = portal || { x: Math.round((c.x - view.tx) / view.k - h), z: Math.round((c.y - view.ty) / view.k - h) };
  const line = portal ? portal.group : LINES.slice().sort((a, b) => (b.dx * at.x + b.dz * at.z) - (a.dx * at.x + a.dz * at.z))[0];
  portalForm = { id: portal ? portal.id : null };
  selected = portal;
  markSelected();

  const card = $('card');
  card.hidden = false;
  document.body.classList.add('has-card');
  card.style.setProperty('--c', line.color);
  card.innerHTML = `<header><div class="tag">Портал · ${portal ? 'правка' : 'новый'}</div><h2>${portal ? esc(portal.name) : 'Новый портал'}</h2>` +
    '<button class="x" data-act="cancel" aria-label="Закрыть">✕</button></header>' +
    '<div class="body"><form id="portalForm" autocomplete="off">' +
    `<label>Название<input name="name" maxlength="40" value="${portal ? esc(portal.name) : ''}"></label>` +
    `<div class="pair"><label>X в аду<input name="x" type="number" step="1" inputmode="numeric" value="${at.x}"></label>` +
    `<label>Z в аду<input name="z" type="number" step="1" inputmode="numeric" value="${at.z}"></label></div>` +
    `<label>Ветка<select name="line">${LINES.map(l => `<option value="${l.id}"${l === line ? ' selected' : ''}>${l.name}, ${l.dir}</option>`).join('')}</select></label>` +
    '<p class="err" id="portalErr" hidden></p></form></div>' +
    `<footer><button data-act="save">Сохранить</button>${portal ? '<button data-act="remove">Удалить</button>' : '<button data-act="cancel">Отмена</button>'}</footer>`;
  $('portalForm').addEventListener('submit', e => { e.preventDefault(); savePortal(card.querySelector('[data-act="save"]')); });
  if (!portal) $('portalForm').elements.name.focus();
}

function sendPortal(body, btn) {
  btn.disabled = true;
  return fetch('/api/portals', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json().catch(() => ({})).then(data => r.ok ? data : Promise.reject(new Error(data.error || 'ошибка ' + r.status))))
    .then(data => { setPortals(data.portals); renderSide(); rebuild(); return data; })
    .catch(err => {
      btn.disabled = false;
      const box = $('portalErr');
      if (box) { box.textContent = 'Не сохранилось: ' + err.message; box.hidden = false; }
    });
}

function savePortal(btn) {
  const f = $('portalForm').elements;
  const portal = { name: f.name.value, x: Number(f.x.value), z: Number(f.z.value), line: f.line.value };
  if (portalForm.id) portal.id = portalForm.id;
  sendPortal({ op: 'upsert', portal }, btn).then(data => {
    if (data) focusOn(stations.find(s => s.id === data.id));
  });
}

function removePortal(btn) {
  if (!confirm('Удалить этот портал со схемы?')) return;
  sendPortal({ op: 'delete', id: portalForm.id }, btn).then(data => { if (data) select(null); });
}

/* ============ панель ============ */

function renderSide() {
  const over = world === 'over';
  $('layers').innerHTML = over ? Object.keys(layers).map(k => {
    const n = { gub: 4, terr: territories.length, boss: BOSSES.length, loop: stations.length - 1 }[k];
    return `<button class="chip" data-layer="${k}" aria-pressed="${layers[k]}">${LAYER_NAMES[k]}<i>${n}</i></button>`;
  }).join('') : LINES.map(l => `<button class="chip" data-group="${l.id}" aria-pressed="${groupFilter === l}" style="${groupFilter === l ? 'background:' + l.color : ''}">${l.name}<i>${l.dir}</i></button>`).join('');
  $('gubs').parentElement.hidden = !over;
  $('gubs').innerHTML = GUBS.map(g =>
    `<button class="gub" data-group="${g.id}" style="--c:${g.color}" aria-pressed="${groupFilter === g}">${g.name}<small>${territories.filter(t => t.group === g).length} терр.</small></button>`).join('');
  $('listTitle').textContent = over ? 'Территории' : 'Порталы';
  $('addPortal').hidden = over || !canEditPortals();
  $('q').placeholder = over ? 'Территория, владелец, житель' : 'Название портала';
  renderList();
  if (mobile()) setSheet(sheet.state);
}

function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const src = world === 'over' ? territories : stations;
  const out = src.filter(o => (!groupFilter || o.group === groupFilter) && (!q || (o.hay || o.name.toLowerCase()).includes(q)));
  $('found').textContent = 'найдено: ' + out.length;
  $('clearFilter').hidden = !groupFilter && !q;
  $('list').innerHTML = out.map(o => {
    const c = o.group ? o.group.color : '#DEFFEA';
    const sub = o.type === 'terr' ? `${esc(o.owner)} · ${o.residents.length} жит.` : o.hub ? 'все четыре ветки' : `${o.group.name} ветка`;
    const xy = o.type === 'terr' ? `${num(o.cx)}<br>${num(o.cz)}` : `${num(o.x)}<br>${num(o.z)}`;
    return `<button class="item" style="--c:${c}" data-key="${o.key}"><strong>${esc(o.name)}</strong><span>${sub}</span><em>${xy}</em></button>`;
  }).join('') || '<div class="empty">Ничего не нашлось.</div>';
}

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if ('acct' in b.dataset) openAuth();
  if (b.dataset.auth === 'close') $('auth').hidden = true;
  if (b.dataset.auth === 'logout') logout();
  if ('themeToggle' in b.dataset) { setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); apply(); }
  if (b.dataset.world) setWorld(b.dataset.world);
  if (b.dataset.layer) { layers[b.dataset.layer] = !layers[b.dataset.layer]; renderSide(); rebuild(); }
  if (b.dataset.group) {
    const g = (world === 'over' ? GUBS : LINES).find(x => x.id === b.dataset.group), h = W().half;
    groupFilter = groupFilter === g ? null : g;
    renderSide();
    if (world === 'over') {
      if (mobile()) setSheet('half');
      groupFilter ? fitTo(g.sx < 0 ? -h : 0, g.sz < 0 ? -h : 0, g.sx < 0 ? 0 : h, g.sz < 0 ? 0 : h) : fit();
    }
  }
  if (b.id === 'addPortal') { setSheet('peek'); editPortal(null); }
  if (b.id === 'clearFilter') { groupFilter = null; $('q').value = ''; renderSide(); }
  if (b.dataset.key) {
    $('q').blur();
    setSheet('peek');
    focusOn((world === 'over' ? territories : stations).find(x => x.key === b.dataset.key));
  }
});
$('q').addEventListener('input', renderList);

function setWorld(w) {
  world = w; groupFilter = null; select(null);
  document.querySelectorAll('[data-world]').forEach(b => b.setAttribute('aria-pressed', b.dataset.world === w));
  $('stage').style.backgroundImage = w === 'over' ? `url('${MAP_DIR}low.webp?v=${MAP_VERSION}'), url('${MAP_DIR}preview.webp?v=${MAP_VERSION}')` : '';
  $('stage').style.backgroundSize = '';
  renderSide(); rebuild(); fit();
}

function relayout() {
  setSheet(mobile() ? sheet.state : 'peek');
  const atFit = view.k <= view.fitK * 1.01;
  view.fitK = worldFitK();
  atFit ? fit() : apply();
}
window.addEventListener('resize', relayout);

/* ============ вход ============ */

// auth === null — сервер входа недоступен (например, сайт открыт как статика).
let auth = null, authError = '';
const PROVIDER_NAMES = { discord: 'Discord', telegram: 'Telegram' };

function loadMe() {
  return fetch('/api/me', { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(data => { auth = data; })
    .catch(() => { auth = null; })
    .then(renderAcct);
}

function renderAcct() {
  const user = auth && auth.user;
  document.querySelectorAll('[data-acct]').forEach(b => {
    b.classList.toggle('in', !!user);
    if (user && user.avatar) b.innerHTML = `<img src="${esc(user.avatar)}" alt="">`;
  });
  $('addPortal').hidden = world === 'over' || !canEditPortals();
}

function openAuth() {
  const box = $('authBox'), user = auth && auth.user, close = '<button class="x" data-auth="close" aria-label="Закрыть">✕</button>';
  if (user) {
    const mp = !user.mp ? 'Вход по списку доступа, без проверки аккаунта Multi Punk.'
      : user.mp.nick ? `Ник в игре: <b>${esc(user.mp.nick)}</b>`
      : 'К аккаунту Multi Punk не привязан Minecraft, поэтому ника нет.';
    box.innerHTML = `<h2>Аккаунт</h2>${close}<div class="who">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : ''}` +
      `<div><b>${esc(user.name)}</b><span>вход через ${PROVIDER_NAMES[user.provider] || esc(user.provider)}</span></div></div>` +
      `<p class="note">${mp}</p><button class="way main" data-auth="logout">Выйти</button>`;
  } else {
    const p = auth ? auth.providers : {};
    box.innerHTML = `<h2>Вход</h2>${close}` +
      (authError === 'denied' ? '<p class="err">Вход пока открыт только для своих — этого аккаунта нет в списке.</p>' : authError ? '<p class="err">Войти не получилось. Попробуй ещё раз.</p>' : '') +
      '<p>Войди через соцсеть, которая привязана к твоему аккаунту Multi Punk.</p>' +
      (p.discord ? '<a class="way discord" href="/api/auth/discord" data-login>Войти через Discord</a>' : '<div class="way off">Discord не настроен</div>') +
      (p.telegram ? '<div id="tgSlot"></div>' : '<div class="way off">Telegram не настроен</div>') +
      (auth && auth.missing && auth.missing.length ? `<p class="note">На сервере (окружение ${esc(auth.env)}) не заданы: ${auth.missing.map(esc).join(', ')}</p>` : '') +
      (auth ? '' : '<p class="note">Сервер входа недоступен: страница открыта без функций Vercel.</p>');
    if (p.telegram) {
      // Кнопку Telegram рисует его собственный скрипт; после входа он сам уводит на data-auth-url.
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://telegram.org/js/telegram-widget.js?22';
      s.dataset.telegramLogin = p.telegram;
      s.dataset.size = 'large';
      s.dataset.radius = '5';
      s.dataset.authUrl = location.origin + '/api/auth/telegram';
      $('tgSlot').appendChild(s);
    }
  }
  // Сервер вернёт сюда же, с тем же местом на карте.
  document.cookie = 'mp_next=' + encodeURIComponent(location.pathname + location.hash) + '; Path=/; Max-Age=600; SameSite=Lax';
  $('auth').hidden = false;
}

function logout() {
  fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(() => location.reload());
}

$('auth').addEventListener('click', e => { if (e.target === $('auth')) $('auth').hidden = true; });

/* ============ запуск ============ */

loadMe().then(() => {
  const params = new URLSearchParams(location.search);
  if (!params.get('auth')) return;
  authError = params.get('auth');
  history.replaceState(null, '', location.pathname + location.hash);
  openAuth();
});

const json = url => fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(url + ' ' + r.status)));

json(MAP_DIR + 'meta.json').then(m => {
  MAP_VERSION = m.version || 0; TILE = m.tile;
  WORLDS.over.size = m.width; WORLDS.over.half = Math.floor(m.width / 2);
  const d = new Date(MAP_VERSION * 1000);
  $('stamp').textContent = (isNaN(d) ? '' : 'Снимок карты: ') + d.toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}).catch(() => {})
  .then(() => json('/api/regions').catch(() => json('region.json')))
  .then(raw => { territories = raw.map(buildTerritory); })
  .catch(err => console.error(err))
  .then(() => json('/api/portals'))
  .then(setPortals)
  .catch(err => console.error('Не удалось загрузить порталы', err))
  .then(() => {
    const h = location.hash.slice(1).split('/');
    setWorld(h[0] === 'nether' ? 'nether' : 'over');
    if (h.length === 4 && h.slice(1).every(n => isFinite(n))) goto(+h[1], +h[2], view.fitK * Math.max(.7, +h[3]));
  });
