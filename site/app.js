const WORLD = 4100, STAGE_W = 1600, STAGE_H = 1606;
const WORLD_NAME = 'Верхний мир';
// Игровые координаты 0,0 на картинке смещены от геометрического центра карты.
const ORIGIN_OFFSET_X = 50, ORIGIN_OFFSET_Z = 50;

// Территория задаётся списком регионов (region.json: regions[].firstPoint /
// secondPoint), каждый — два противоположных угла в любом порядке. Территория
// может состоять из нескольких регионов сразу (например, кусок сбоку) —
// все они рисуются как один слитный контур через unionOutline().
const ROLE_LABELS = { owner: 'Владелец', sherif: 'Шериф', resident: 'Житель' };

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function pctX(v) { return ((v + ORIGIN_OFFSET_X + WORLD / 2) / WORLD * 100).toFixed(3) + '%'; }
function pctZ(v) { return ((v + ORIGIN_OFFSET_Z + WORLD / 2) / WORLD * 100).toFixed(3) + '%'; }
function xPix(v) { return (v + ORIGIN_OFFSET_X + WORLD / 2) / WORLD * STAGE_W; }
function zPix(v) { return (v + ORIGIN_OFFSET_Z + WORLD / 2) / WORLD * STAGE_H; }

function rectWorld(r) {
  return {
    minX: Math.min(r.x1, r.x2), maxX: Math.max(r.x1, r.x2),
    minZ: Math.min(r.z1, r.z2), maxZ: Math.max(r.z1, r.z2)
  };
}

function rectPixels(r) {
  const w = rectWorld(r);
  return { x1: xPix(w.minX), x2: xPix(w.maxX), z1: zPix(w.minZ), z2: zPix(w.maxZ) };
}

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

function buildTerritory(raw, index) {
  const rects = raw.regions.map(reg => ({
    x1: reg.firstPoint.x, z1: reg.firstPoint.z,
    x2: reg.secondPoint.x, z2: reg.secondPoint.z
  }));
  const bbox = rects.map(rectWorld).reduce((acc, w) => ({
    minX: Math.min(acc.minX, w.minX), maxX: Math.max(acc.maxX, w.maxX),
    minZ: Math.min(acc.minZ, w.minZ), maxZ: Math.max(acc.maxZ, w.maxZ)
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  const centerX = Math.round((bbox.minX + bbox.maxX) / 2);
  const centerZ = Math.round((bbox.minZ + bbox.maxZ) / 2);
  const owner = raw.residents.find(r => r.status === 'owner') || raw.residents[0];
  const hue = hashHue(raw.name || String(index));
  const stroke = `hsl(${hue} 78% 68%)`;

  return {
    id: 't' + index,
    name: raw.name || 'Без названия',
    kind: 'Территория',
    owner: owner ? owner.name : '—',
    stroke,
    about: raw.description || '',
    outlineLoops: unionOutline(rects.map(rectPixels)),
    labelX: xPix(centerX), labelZ: zPix(bbox.minZ),
    fill: `hsl(${hue} 78% 68% / 0.18)`,
    centerX, centerZ,
    coords: `X ${bbox.minX} … ${bbox.maxX}   ·   Z ${bbox.minZ} … ${bbox.maxZ}`,
    short: `${centerX} / ${centerZ}`,
    area: `${bbox.maxX - bbox.minX}×${bbox.maxZ - bbox.minZ}`,
    residentsDetailed: raw.residents.map(r => ({
      name: r.name,
      role: ROLE_LABELS[r.status] || r.status,
      initial: (r.name || '?')[0].toUpperCase()
    }))
  };
}

let territories = [];

const els = {
  worldName: document.getElementById('worldName'),
  toggleListBtn: document.getElementById('toggleListBtn'),
  viewport: document.getElementById('viewport'),
  stage: document.getElementById('stage'),
  mapImg: document.getElementById('mapImg'),
  gridOverlay: document.getElementById('gridOverlay'),
  territoriesLayer: document.getElementById('territories'),
  screenOverlay: document.getElementById('screenOverlay'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  resetBtn: document.getElementById('resetBtn'),
  zoomLabel: document.getElementById('zoomLabel'),
  coordLabel: document.getElementById('coordLabel'),
  sheetBackdrop: document.getElementById('sheetBackdrop'),
  detailSheet: document.getElementById('detailSheet'),
  detailKind: document.getElementById('detailKind'),
  detailName: document.getElementById('detailName'),
  detailCoords: document.getElementById('detailCoords'),
  detailOwner: document.getElementById('detailOwner'),
  detailArea: document.getElementById('detailArea'),
  detailAbout: document.getElementById('detailAbout'),
  detailCount: document.getElementById('detailCount'),
  detailResidents: document.getElementById('detailResidents'),
  detailCloseBtn: document.getElementById('detailCloseBtn'),
  listSheet: document.getElementById('listSheet'),
  listCloseBtn: document.getElementById('listCloseBtn'),
  searchInput: document.getElementById('searchInput'),
  territoryList: document.getElementById('territoryList'),
  toast: document.getElementById('toast')
};

els.worldName.textContent = WORLD_NAME;

const view = { k: 0.25, tx: 0, ty: 0, fitK: 0.25 };
const overlayAnchors = [];
const territoryShapes = [];

function pathFromLoopsScreen(loops) {
  return loops.map(loop => 'M ' + loop.map(p =>
    (view.tx + p[0] * view.k).toFixed(1) + ' ' + (view.ty + p[1] * view.k).toFixed(1)
  ).join(' L ') + ' Z').join(' ');
}
let selectedId = null;
let listOpen = false;
let moved = 0;
let dragging = false;
const pts = new Map();
let pinchDist = null;
let lastPointer = null;
const TAP_THRESHOLD = 14;

function fit() {
  const r = els.viewport.getBoundingClientRect();
  view.fitK = Math.min(r.width / STAGE_W, r.height / STAGE_H) * 0.98;
  view.k = view.fitK;
  view.tx = (r.width - STAGE_W * view.k) / 2;
  view.ty = (r.height - STAGE_H * view.k) / 2;
  apply();
}

function clamp() {
  const r = els.viewport.getBoundingClientRect();
  const w = STAGE_W * view.k, h = STAGE_H * view.k;
  const mx = Math.min(r.width * 0.5, w * 0.5), my = Math.min(r.height * 0.5, h * 0.5);
  view.tx = Math.min(r.width - mx, Math.max(mx - w, view.tx));
  view.ty = Math.min(r.height - my, Math.max(my - h, view.ty));
}

function apply() {
  clamp();
  els.stage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`;
  overlayAnchors.forEach(a => {
    a.el.style.left = (view.tx + a.x * view.k) + 'px';
    a.el.style.top = (view.ty + a.z * view.k) + 'px';
  });
  territoryShapes.forEach(s => {
    s.el.setAttribute('d', pathFromLoopsScreen(s.loops));
    s.el.style.strokeWidth = (3 * view.k) + 'px';
  });
  els.zoomLabel.textContent = Math.round((view.k / view.fitK) * 100) + '%';
  updateCoordLabel();
}

function updateCoordLabel() {
  const r = els.viewport.getBoundingClientRect();
  const px = lastPointer ? lastPointer.x - r.left : r.width / 2;
  const py = lastPointer ? lastPointer.y - r.top : r.height / 2;
  const sx = (px - view.tx) / view.k, sy = (py - view.ty) / view.k;
  const bx = Math.round(sx / STAGE_W * WORLD - WORLD / 2 - ORIGIN_OFFSET_X);
  const bz = Math.round(sy / STAGE_H * WORLD - WORLD / 2 - ORIGIN_OFFSET_Z);
  els.coordLabel.textContent = `X ${bx} · Z ${bz}`;
}

function zoomAt(px, py, factor) {
  const next = Math.max(view.fitK * 0.85, Math.min(view.fitK * 14, view.k * factor));
  const ratio = next / view.k;
  view.tx = px - (px - view.tx) * ratio;
  view.ty = py - (py - view.ty) * ratio;
  view.k = next;
  apply();
}

function zoomCenter(factor) {
  const r = els.viewport.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, factor);
}

function focus(t) {
  const r = els.viewport.getBoundingClientRect();
  view.k = Math.max(view.k, view.fitK * 3);
  const sx = (t.centerX + ORIGIN_OFFSET_X + WORLD / 2) / WORLD * STAGE_W, sy = (t.centerZ + ORIGIN_OFFSET_Z + WORLD / 2) / WORLD * STAGE_H;
  view.tx = r.width / 2 - sx * view.k;
  view.ty = r.height * 0.32 - sy * view.k;
  apply();
}

/* ---------- pointer / wheel interaction ---------- */

els.viewport.addEventListener('pointerdown', e => {
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  els.viewport.setPointerCapture(e.pointerId);
  moved = 0;
  pinchDist = null;
  dragging = true;
  els.viewport.classList.add('dragging');
  lastPointer = { x: e.clientX, y: e.clientY };
  updateCoordLabel();
});

els.viewport.addEventListener('pointermove', e => {
  lastPointer = { x: e.clientX, y: e.clientY };
  updateCoordLabel();
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size >= 2) {
    const [a, b] = Array.from(pts.values());
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const r = els.viewport.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    if (pinchDist) zoomAt(cx, cy, dist / pinchDist);
    pinchDist = dist;
    moved = 99;
    return;
  }
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  moved += Math.abs(dx) + Math.abs(dy);
  view.tx += dx; view.ty += dy;
  apply();
});

function handleTap(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const hit = el && el.closest ? el.closest('.territory, .territory-label') : null;
  if (hit && hit.dataset.id) select(hit.dataset.id);
  else clearSelection();
}

function onPointerEnd(e) {
  const tap = pts.size === 1 && moved <= TAP_THRESHOLD;
  pts.delete(e.pointerId);
  if (pts.size < 2) pinchDist = null;
  dragging = pts.size > 0;
  if (!dragging) els.viewport.classList.remove('dragging');
  // Native click targeting is unreliable here: setPointerCapture retargets
  // the mouse-synthesized click to the capturing element (this happens for
  // real mouse pointers but not touch), so nested territories/labels never
  // receive it on desktop. Resolving the tap target ourselves via
  // elementFromPoint sidesteps that inconsistency for both input types.
  if (tap) handleTap(e.clientX, e.clientY);
}
els.viewport.addEventListener('pointerup', onPointerEnd);
els.viewport.addEventListener('pointercancel', onPointerEnd);

els.viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const r = els.viewport.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
}, { passive: false });

// Safari drives pinch-zoom through its own legacy gesture events, which
// `touch-action: none` does not suppress — left unblocked, a pinch that
// exceeds our zoom cap falls through to the OS-level page zoom, which
// scales the whole layout (labels included) on top of our own transform,
// making them keep growing past the size our counter-scale locks in.
['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
  els.viewport.addEventListener(type, e => e.preventDefault());
});

els.viewport.addEventListener('pointerleave', () => {
  if (pts.size === 0) { lastPointer = null; updateCoordLabel(); }
});

window.addEventListener('resize', fit);

els.zoomInBtn.addEventListener('click', () => zoomCenter(1.5));
els.zoomOutBtn.addEventListener('click', () => zoomCenter(1 / 1.5));
els.resetBtn.addEventListener('click', fit);

/* ---------- territories render ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderMap() {
  els.territoriesLayer.innerHTML = '';
  els.screenOverlay.innerHTML = '';
  territoryShapes.length = 0;
  overlayAnchors.length = 0;

  territories.forEach(t => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'territory');
    path.style.fill = t.fill;
    path.style.stroke = t.stroke;
    path.dataset.id = t.id;
    els.territoriesLayer.appendChild(path);
    territoryShapes.push({ el: path, loops: t.outlineLoops });

    const alwaysLabel = t.name === 'Спавн';
    const label = document.createElement('div');
    label.className = alwaysLabel ? 'territory-label' : 'territory-label hover-only';
    label.dataset.id = t.id;
    label.innerHTML = `<span class="territory-label-inner" style="--stroke:${t.stroke}"><span class="territory-label-dot" style="--stroke:${t.stroke}"></span>${t.name}</span>`;
    els.screenOverlay.appendChild(label);
    overlayAnchors.push({ el: label, x: t.labelX, z: t.labelZ });

    if (!alwaysLabel) {
      path.addEventListener('pointerenter', () => label.classList.add('is-visible'));
      path.addEventListener('pointerleave', () => label.classList.remove('is-visible'));
    }
  });

  const axisX = document.createElement('div');
  axisX.className = 'axis-line axis-x';
  axisX.style.top = pctZ(0);
  els.stage.appendChild(axisX);

  const axisZ = document.createElement('div');
  axisZ.className = 'axis-line axis-z';
  axisZ.style.left = pctX(0);
  els.stage.appendChild(axisZ);

  const originMarker = document.createElement('div');
  originMarker.className = 'origin-marker';
  originMarker.innerHTML = '<span class="origin-marker-ring"></span><span class="origin-marker-dot"></span>';
  els.screenOverlay.appendChild(originMarker);
  overlayAnchors.push({ el: originMarker, x: xPix(0), z: zPix(0) });
}

/* ---------- selection / detail sheet ---------- */

function select(id) {
  selectedId = id;
  listOpen = false;
  renderSheets();
}

function clearSelection() {
  if (moved > TAP_THRESHOLD) return;
  selectedId = null;
  renderSheets();
}

function renderSheets() {
  const selected = territories.find(t => t.id === selectedId) || null;

  els.detailSheet.hidden = !selected;
  els.listSheet.hidden = !listOpen;
  els.sheetBackdrop.hidden = !listOpen;

  if (selected) {
    els.detailKind.textContent = selected.kind;
    els.detailKind.style.color = selected.stroke;
    els.detailName.textContent = selected.name;
    els.detailCoords.textContent = selected.coords;
    els.detailOwner.textContent = selected.owner;
    els.detailArea.textContent = selected.area;
    els.detailAbout.textContent = selected.about;
    els.detailCount.textContent = selected.residentsDetailed.length;
    els.detailResidents.innerHTML = '';
    selected.residentsDetailed.forEach(r => {
      const row = document.createElement('div');
      row.className = 'resident-row';
      row.innerHTML = `<span class="resident-initial">${r.initial}</span><span class="resident-name">${r.name}</span><div class="spacer"></div><span class="resident-role">${r.role}</span>`;
      els.detailResidents.appendChild(row);
    });
  }

  renderList();
}

els.detailCloseBtn.addEventListener('click', clearSelection);

/* ---------- list sheet ---------- */

function toggleList() {
  listOpen = !listOpen;
  renderSheets();
}

els.toggleListBtn.addEventListener('click', toggleList);
els.listCloseBtn.addEventListener('click', toggleList);
els.sheetBackdrop.addEventListener('click', toggleList);

els.searchInput.addEventListener('input', renderList);

function renderList() {
  const q = els.searchInput.value.trim().toLowerCase();
  const filtered = q ? territories.filter(t => (t.name + ' ' + t.owner).toLowerCase().includes(q)) : territories;
  els.territoryList.innerHTML = '';
  filtered.forEach(t => {
    const item = document.createElement('button');
    item.className = 'territory-item';
    item.type = 'button';
    item.innerHTML = `
      <span class="territory-swatch" style="--stroke:${t.stroke}"></span>
      <span class="territory-item-text">
        <span class="territory-item-name">${t.name}</span>
        <span class="territory-item-meta">${t.owner} · ${t.residentsDetailed.length} жит.</span>
      </span>
      <span class="territory-item-short">${t.short}</span>`;
    item.addEventListener('click', () => { select(t.id); focus(t); });
    els.territoryList.appendChild(item);
  });
}

/* ---------- toast ---------- */

let toastTimer = null;
function ping(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
}

/* ---------- init ---------- */

fetch('region.json?v=1')
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then(raw => { territories = raw.map(buildTerritory); })
  .catch(err => {
    console.error('Не удалось загрузить region.json', err);
    territories = [];
    ping('Не удалось загрузить территории');
  })
  .finally(() => {
    renderMap();
    fit();
    renderSheets();
  });
