// Ilha dos Araújos — jogo de mundo aberto
// Coordenadas: x = leste (m), z = sul (m). Origem perto do centro da ilha.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildInterior } from './interiors.js';
import { buildLugares } from './lugares.js';
import { startNet } from './net.js';
import { createCombat, makeWeaponMesh, placeHeld, WEAPONS, WIDS } from './combat.js';
import { createNPC } from './npc.js';
let npcTalk = null;
// versão publicada na internet (não é o computador do jogador): esconde placas de endereço particulares
const PUBLIC_SITE = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let combat = null, net = null; // armas e multiplayer (criados quando o jogo começa)

const $ = id => document.getElementById(id);
const setStatus = t => { $('loadmsg').textContent = t; };
const pause = () => new Promise(r => setTimeout(r, 0));

setStatus('Carregando mapa…');
const W = await (await fetch('data/world.json')).json();
let OV = [];
// ajustes de fidelidade: uma linha JSON por construção revisada (fotos / Street View)
try { const r = await fetch('data/overrides.jsonl', { cache: 'no-store' }); if (r.ok) OV = (await r.text()).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { }

// comércios e lugares reais (nome, posição e categoria levantados no Google Maps)
let PLACES = [];
try { const r = await fetch('data/places.json', { cache: 'no-store' }); if (r.ok) PLACES = await r.json(); } catch (e) { }
const LAT0 = -18.8676, LON0 = -41.9445, MX = 111320 * Math.cos(LAT0 * Math.PI / 180), MY = 110540;
const toLocal = (lat, lon) => [(lon - LON0) * MX, -(lat - LAT0) * MY];

// ---------------------------------------------------------------- utilidades
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash2 = (x, z) => (Math.imul(Math.floor(x * 10), 73856093) ^ Math.imul(Math.floor(z * 10), 19349663)) >>> 0;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function clean(poly) {
  const p = [];
  for (const q of poly) { const l = p[p.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.4) p.push(q); }
  if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.4) p.pop();
  return p;
}
function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > p[1]) != (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) c = !c; } return c; }
// SÓ A ILHA: o continente vira apenas margem verde do rio (sem ruas, casas nem trânsito)
const MAIN_SHAPE = W.mainland; W.mainland = [];
{
  const I = W.island, on = p => inside(p, I), near = p => I.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 80);
  W.roads = W.roads.filter(r => r.p.some(on) || (r.t.bridge && r.p.some(near)));
  W.trees = W.trees.filter(on);
  W.buildings = W.buildings.filter(b => b.p.some(on));
  W.areas = W.areas.filter(a => a.p.some(on));
  W.pois = W.pois.filter(p => on(p.p));
}
function area(poly) { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function centroid(poly) { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; }
function inset(poly, d) {
  const n = poly.length, sg = area(poly) > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    let e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1; e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
    const n1 = [-e1[1] * sg, e1[0] * sg], n2 = [-e2[1] * sg, e2[0] * sg];
    let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(...m);
    m = ml < 1e-6 ? n1 : [m[0] / ml, m[1] / ml];
    const k = d / Math.max(m[0] * n1[0] + m[1] * n1[1], 0.4);
    out.push([p1[0] + m[0] * k, p1[1] + m[1] * k]);
  }
  return out;
}
function distSeg(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz; let t = l ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l : 0; t = clamp(t, 0, 1); return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz); }
// caixa orientada: {x,z,w,d,ex:[..],nx:[..]}  (w ao longo de ex, d ao longo de nx)
function obbOverlap(a, b, pad = 0.2) {
  for (const ax of [a.ex, a.nx, b.ex, b.nx]) {
    const ra = Math.abs(a.w / 2 * (a.ex[0] * ax[0] + a.ex[1] * ax[1])) + Math.abs(a.d / 2 * (a.nx[0] * ax[0] + a.nx[1] * ax[1]));
    const rb = Math.abs(b.w / 2 * (b.ex[0] * ax[0] + b.ex[1] * ax[1])) + Math.abs(b.d / 2 * (b.nx[0] * ax[0] + b.nx[1] * ax[1]));
    const dist = Math.abs((b.x - a.x) * ax[0] + (b.z - a.z) * ax[1]);
    if (dist > ra + rb + pad) return false;
  }
  return true;
}
function corners(b) { const r = []; for (const s of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push([b.x + b.ex[0] * b.w / 2 * s[0] + b.nx[0] * b.d / 2 * s[1], b.z + b.ex[1] * b.w / 2 * s[0] + b.nx[1] * b.d / 2 * s[1]]); return r; }
// caixa que cabe num polígono (orientada pela aresta mais longa)
function fitBox(poly, shrink = 0.8) {
  let best = 0, e = [1, 0];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; e = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; } }
  const n = [-e[1], e[0]]; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const p of poly) { const u = p[0] * e[0] + p[1] * e[1], v = p[0] * n[0] + p[1] * n[1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  return { x: e[0] * uc + n[0] * vc, z: e[1] * uc + n[1] * vc, w: (u1 - u0) * shrink, d: (v1 - v0) * shrink, ex: e, nx: n };
}

// ---------------------------------------------------------------- grade de colisão / terreno
const B = { x0: -2600, z0: -2600, x1: 2600, z1: 2600, cell: 2 };
B.nx = Math.ceil((B.x1 - B.x0) / B.cell); B.nz = Math.ceil((B.z1 - B.z0) / B.cell);
const landGrid = new Uint8Array(B.nx * B.nz); // 1 = terra, 2 = calçada (quarteirão)
function fillPoly(poly, val, onlyIf = -1) {
  let z0 = 1e9, z1 = -1e9; for (const p of poly) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const r0 = clamp(Math.floor((z0 - B.z0) / B.cell), 0, B.nz - 1), r1 = clamp(Math.ceil((z1 - B.z0) / B.cell), 0, B.nz - 1);
  for (let r = r0; r <= r1; r++) {
    const z = B.z0 + (r + 0.5) * B.cell, xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) != (b[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = clamp(Math.ceil((xs[k] - B.x0) / B.cell - 0.5), 0, B.nx - 1), c1 = clamp(Math.floor((xs[k + 1] - B.x0) / B.cell - 0.5), 0, B.nx - 1);
      for (let c = c0; c <= c1; c++) { const i = r * B.nx + c; if (onlyIf < 0 || landGrid[i] === onlyIf) landGrid[i] = val; }
    }
  }
}
function fillSeg(a, b, w, val) {
  const x0 = Math.min(a[0], b[0]) - w, x1 = Math.max(a[0], b[0]) + w, z0 = Math.min(a[1], b[1]) - w, z1 = Math.max(a[1], b[1]) + w;
  for (let z = z0; z <= z1; z += B.cell) for (let x = x0; x <= x1; x += B.cell) if (distSeg(x, z, a, b) <= w / 2) { const c = Math.floor((x - B.x0) / B.cell), r = Math.floor((z - B.z0) / B.cell); if (c >= 0 && r >= 0 && c < B.nx && r < B.nz) landGrid[r * B.nx + c] = Math.max(landGrid[r * B.nx + c], val); }
}
const gridAt = (x, z) => { const c = Math.floor((x - B.x0) / B.cell), r = Math.floor((z - B.z0) / B.cell); return (c < 0 || r < 0 || c >= B.nx || r >= B.nz) ? 0 : landGrid[r * B.nx + c]; };
const isLand = (x, z) => gridAt(x, z) > 0;
const groundY = (x, z) => gridAt(x, z) === 2 ? 0.18 : 0.04;

// obstáculos (caixas orientadas) em grade espacial
const OB_CELL = 24, obGrid = new Map(), obstacles = [];
function addObstacle(b) {
  obstacles.push(b); const r = Math.hypot(b.w, b.d) / 2;
  for (let cx = Math.floor((b.x - r) / OB_CELL); cx <= Math.floor((b.x + r) / OB_CELL); cx++)
    for (let cz = Math.floor((b.z - r) / OB_CELL); cz <= Math.floor((b.z + r) / OB_CELL); cz++) { const k = cx * 100003 + cz; if (!obGrid.has(k)) obGrid.set(k, []); obGrid.get(k).push(b); }
}
let dynObs = []; // móveis dos interiores carregados no momento
function pushOut(x, z, rad) {
  const k = Math.floor(x / OB_CELL) * 100003 + Math.floor(z / OB_CELL); const grid = obGrid.get(k); let hit = false;
  const list = dynObs.length ? (grid || []).concat(dynObs) : grid;
  if (!list) return { x, z, hit };
  for (const b of list) {
    const dx = x - b.x, dz = z - b.z; const u = dx * b.ex[0] + dz * b.ex[1], v = dx * b.nx[0] + dz * b.nx[1];
    const hw = b.w / 2, hd = b.d / 2;
    if (Math.abs(u) > hw + rad || Math.abs(v) > hd + rad) continue;
    const cu = clamp(u, -hw, hw), cv = clamp(v, -hd, hd);
    let du = u - cu, dv = v - cv, dist = Math.hypot(du, dv);
    if (dist >= rad) continue;
    hit = true;
    let nu, nv, pen;
    if (dist > 1e-4) { nu = du / dist; nv = dv / dist; pen = rad - dist; }
    else { const pu = hw - Math.abs(u), pv = hd - Math.abs(v); if (pu < pv) { nu = Math.sign(u) || 1; nv = 0; pen = pu + rad; } else { nu = 0; nv = Math.sign(v) || 1; pen = pv + rad; } }
    x += (b.ex[0] * nu + b.nx[0] * nv) * pen; z += (b.ex[1] * nu + b.nx[1] * nv) * pen;
  }
  return { x, z, hit };
}

// ---------------------------------------------------------------- estradas
const ROAD_W = { primary: 14, secondary: 12, tertiary: 10, tertiary_link: 8, residential: 8, unclassified: 7, living_street: 6, service: 5, track: 4, services: 6 };
const FOOT = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway']);
const roadWidth = t => FOOT.has(t.highway) ? (t.highway === 'pedestrian' ? 5 : 2.4) : (ROAD_W[t.highway] || 7);
const allRoads = [...W.roads, ...W.mainland.filter(m => m.k === 'road')];
const SEG_CELL = 30, segGrid = new Map();
for (const r of allRoads) {
  r.w = roadWidth(r.t); r.foot = FOOT.has(r.t.highway);
  for (let i = 0; i + 1 < r.p.length; i++) {
    const a = r.p[i], b = r.p[i + 1], seg = { a, b, r };
    const x0 = Math.floor((Math.min(a[0], b[0]) - 15) / SEG_CELL), x1 = Math.floor((Math.max(a[0], b[0]) + 15) / SEG_CELL);
    const z0 = Math.floor((Math.min(a[1], b[1]) - 15) / SEG_CELL), z1 = Math.floor((Math.max(a[1], b[1]) + 15) / SEG_CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const k = cx * 100003 + cz; if (!segGrid.has(k)) segGrid.set(k, []); segGrid.get(k).push(seg); }
  }
}
function nearestRoad(x, z, maxd, filter) {
  const list = segGrid.get(Math.floor(x / SEG_CELL) * 100003 + Math.floor(z / SEG_CELL)); let best = null, bd = maxd;
  if (list) for (const s of list) { if (filter && !filter(s.r)) continue; const d = distSeg(x, z, s.a, s.b); if (d < bd) { bd = d; best = s; } }
  return best ? { seg: best, d: bd } : null;
}

// ---------------------------------------------------------------- cena
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#9fc6e8');
scene.background = SKY; scene.fog = new THREE.Fog(SKY, 300, 7000); // dia limpo: dá para ver a Ibituruna da ilha
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 9000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

scene.add(new THREE.HemisphereLight('#dbeeff', '#6b6248', 1.05));
const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 400 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
{ let on = false; try { on = localStorage.getItem('ilha_sombras') === '1'; } catch {} // sombras desligadas por padrão (G liga)
  renderer.shadowMap.enabled = on; sun.castShadow = on; }
const SUN_DIR = new THREE.Vector3(-0.45, 1, 0.35).normalize();

const shapeOf = poly => { const s = new THREE.Shape(); poly.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); return s; };
function flatGeo(poly, y, depth = 0) {
  const g = depth > 0 ? new THREE.ExtrudeGeometry(shapeOf(poly), { depth, bevelEnabled: false }) : new THREE.ShapeGeometry(shapeOf(poly));
  g.rotateX(-Math.PI / 2); g.translate(0, y - (depth > 0 ? 0 : 0), 0);
  return g;
}
function tint(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function strip(g) { const ng = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'color'].includes(k)) ng.deleteAttribute(k); ng.clearGroups(); return ng; }
const VC = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---------------------------------------------------------------- terreno, água e montanha
setStatus('Montando o terreno…'); await pause();
const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshPhongMaterial({ color: '#8a6a4c', shininess: 40, specular: '#4a4038' }));
water.rotation.x = -Math.PI / 2; water.position.y = -0.9; scene.add(water);

const island = clean(W.island);
fillPoly(island, 1);
// continente: terra em volta das ruas e quarteirões mapeados
const mainMask = new Uint8Array(B.nx * B.nz);
{
  const save = landGrid.slice(); landGrid.fill(0);
  for (const m of MAIN_SHAPE) {
    if (m.k === 'road') { const w = roadWidth(m.t) + 22; for (let i = 0; i + 1 < m.p.length; i++) fillSeg(m.p[i], m.p[i + 1], w, 1); }
    else { const p = clean(m.p); if (p.length > 2) fillPoly(inset(p, -10), 1); }
  }
  // fechamento morfológico (preenche os miolos de quadra entre as ruas)
  const R = 20, tmp = new Uint8Array(landGrid.length);
  const dil = (src, dst, val) => { // passa em x e depois em z (caixa)
    const t2 = new Uint8Array(src.length);
    for (let r = 0; r < B.nz; r++) { let run = -1e9; for (let c = 0; c < B.nx; c++) { if (!!src[r * B.nx + c] === val) run = c; t2[r * B.nx + c] = c - run <= R ? 1 : 0; } run = 1e9; for (let c = B.nx - 1; c >= 0; c--) { if (!!src[r * B.nx + c] === val) run = c; if (run - c <= R) t2[r * B.nx + c] = 1; } }
    for (let c = 0; c < B.nx; c++) { let run = -1e9; for (let r = 0; r < B.nz; r++) { if (t2[r * B.nx + c]) run = r; dst[r * B.nx + c] = r - run <= R ? 1 : 0; } run = 1e9; for (let r = B.nz - 1; r >= 0; r--) { if (t2[r * B.nx + c]) run = r; if (run - r <= R) dst[r * B.nx + c] = 1; } }
  };
  dil(landGrid, tmp, true); // dilata a terra
  const inv = new Uint8Array(tmp.length); for (let i = 0; i < tmp.length; i++) inv[i] = tmp[i] ? 0 : 1;
  const water2 = new Uint8Array(tmp.length); dil(inv, water2, true); // dilata a água de volta (= erosão da terra)
  for (let i = 0; i < landGrid.length; i++) { mainMask[i] = (landGrid[i] || !water2[i]) && !inside0(i) ? 1 : 0; landGrid[i] = save[i] || mainMask[i]; }
  function inside0(i) { return save[i] > 0; }
}
{
  const mk = (poly, top) => { const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: 3, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2); g.translate(0, -3, 0); return new THREE.Mesh(g, [new THREE.MeshLambertMaterial({ color: top }), new THREE.MeshLambertMaterial({ color: '#7a6448' })]); };
  const im = mk(island, '#7fa25a'); im.receiveShadow = true; scene.add(im);
  for (const it of W.islets) { const p = clean(it.p); if (p.length > 2) { const m = mk(p, '#5f8a45'); m.position.y = -0.3; scene.add(m); } }
  // chão do continente (textura gerada da máscara, 4 m por pixel)
  const tw = B.nx / 2, th = B.nz / 2, data = new Uint8Array(tw * th * 4), r = rng(3);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = (2 * y) * B.nx + 2 * x; if (!mainMask[i]) continue;
    const o = ((th - 1 - y) * tw + x) * 4, n = r() * 14;
    data[o] = 128 + n; data[o + 1] = 146 + n; data[o + 2] = 98 + n; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, tw, th); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter;
  const pg = new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0); pg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 }));
  ground.position.set((B.x0 + B.x1) / 2, -0.03, (B.z0 + B.z1) / 2); ground.receiveShadow = true; scene.add(ground);
  // margem (barranco) do continente
  const bank = new THREE.Mesh(pg.clone(), new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, color: '#8c7556' }));
  bank.position.set(ground.position.x, -0.6, ground.position.z); scene.add(bank);
}
// Pico da Ibituruna — 1.123 m de altitude (~950 m acima do rio), a sudeste da ilha, do outro lado do Rio Doce.
// Posição do cume pelo OpenStreetMap; maciço de granito com paredões de pedra no lado norte e mata nas encostas.
const IBI = toLocal(-18.8862518, -41.9185250);
function ibiHeight(x, z) {
  const dx = x - IBI[0], dz = z - IBI[1];
  // cume: cone íngreme e um pouco alongado leste-oeste
  const d = Math.hypot(dx * 0.85, dz * 1.15);
  let h = 950 * Math.exp(-Math.pow(d / 820, 1.35));
  // crista que segue para leste, mais baixa
  const t = clamp((dx + 300) / 3800, 0, 1), ridgeZ = IBI[1] + 250 + dx * 0.12;
  h = Math.max(h, (620 - 260 * t) * Math.exp(-Math.pow((z - ridgeZ) / 650, 2)) * (dx > -400 ? 1 : Math.exp(-Math.pow((dx + 400) / 500, 2))));
  // morros menores em volta
  h += 120 * Math.exp(-Math.pow(Math.hypot(x - IBI[0] + 1300, z - IBI[1] - 900) / 600, 2));
  h += 90 * Math.exp(-Math.pow(Math.hypot(x - IBI[0] - 800, z - IBI[1] + 900) / 500, 2));
  // rugosidade
  h += (26 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) + 14 * Math.sin(x * 0.031 + z * 0.023) + 7 * Math.sin(x * 0.07 - z * 0.05)) * clamp(h / 150, 0, 1);
  // pé do morro: planície baixa some sob a água / chão do continente
  return h - 60;
}
{
  const X0 = IBI[0] - 2600, X1 = IBI[0] + 4400, Z0 = IBI[1] - 1700, Z1 = IBI[1] + 2600, NX = 220, NZ = 140;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + (X0 + X1) / 2, z = pos.getZ(i) + (Z0 + Z1) / 2; pos.setXYZ(i, x, Math.max(-3, ibiHeight(x, z)), z); }
  g.computeVertexNormals();
  const col = new Float32Array(pos.count * 3), nrm = g.attributes.normal, r = rng(21), c = new THREE.Color(), haze = new THREE.Color('#a9c3d6');
  const forest = [new THREE.Color('#3d5a32'), new THREE.Color('#4a6b3a'), new THREE.Color('#566f40')], rock = new THREE.Color('#8e8b84'), rockDark = new THREE.Color('#6f6c66'), pasture = new THREE.Color('#8a9a5a');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nrm.getY(i), x = pos.getX(i), z = pos.getZ(i);
    if (ny < 0.62 && y > 120) c.copy(r() < 0.5 ? rock : rockDark);                 // paredão de granito
    else if (y < 90) c.copy(pasture).lerp(forest[1], r() * 0.4);                    // pasto no pé do morro
    else c.copy(forest[Math.floor(r() * 3)]);
    if (y > 820 && ny < 0.8) c.copy(rock);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.position.y = -0.4; m.receiveShadow = false; scene.add(m);
  // antenas no cume
  const top = ibiHeight(IBI[0], IBI[1]);
  for (const [ox, oz, hh] of [[0, 0, 45], [35, 20, 32], [-30, 15, 28]]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, hh, 4).translate(0, hh / 2, 0), new THREE.MeshLambertMaterial({ color: '#c8c8c8', fog: false }));
    a.position.set(IBI[0] + ox, ibiHeight(IBI[0] + ox, IBI[1] + oz) - 2, IBI[1] + oz); scene.add(a);
  }
}

// ---------------------------------------------------------------- texturas de fachada
const texCache = {};
function facadeTex(type, floors) {
  const key = type + floors; if (texCache[key]) return texCache[key];
  const FH = 128, c = document.createElement('canvas'); c.width = 256; c.height = FH * floors; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, c.height);
  const win = (x, y, w, h, bars = true) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
    g.fillStyle = '#4f6273'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 3, y + 3, w * 0.3, h - 6);
    if (bars) { g.fillStyle = '#2a2a2a'; for (let i = 1; i < 5; i++) g.fillRect(x + i * w / 5 - 1, y, 2, h); g.fillRect(x, y + h / 2 - 1, w, 2); }
  };
  for (let f = 0; f < floors; f++) {
    const y0 = c.height - (f + 1) * FH, ground = f === 0;
    if (ground && type === 'shop') {
      g.fillStyle = '#9a9a9a'; g.fillRect(8, y0 + 8, 240, 18);
      g.fillStyle = '#2f383d'; g.fillRect(12, y0 + 28, 232, FH - 28);
      g.fillStyle = '#56646c'; for (let i = 0; i < 4; i++) g.fillRect(18 + i * 57, y0 + 34, 50, FH - 40);
      g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(24, y0 + 36, 10, FH - 44); g.fillRect(138, y0 + 36, 10, FH - 44);
    } else if (type === 'mod') { // sobrado moderno: portão de enrolar na garagem, porta e vidraças com guarda-corpo de vidro
      if (ground) {
        g.fillStyle = '#8f9396'; g.fillRect(14, y0 + 26, 132, FH - 26); g.fillStyle = '#7b7f82'; for (let k2 = y0 + 30; k2 < y0 + FH; k2 += 7) g.fillRect(14, k2, 132, 2);
        g.fillStyle = '#3b3027'; g.fillRect(166, y0 + 30, 40, FH - 30); g.fillStyle = '#4f6273'; g.fillRect(214, y0 + 40, 30, 50);
      } else {
        g.fillStyle = '#7a5236'; g.fillRect(10, y0 + 14, 70, 100); // painel amadeirado
        g.fillStyle = '#4a5d6c'; g.fillRect(92, y0 + 20, 150, 78); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(98, y0 + 24, 30, 70);
        g.fillStyle = 'rgba(170,215,230,.75)'; g.fillRect(86, y0 + 78, 162, 30); g.fillStyle = '#9aa3a8'; g.fillRect(86, y0 + 76, 162, 3);
      }
    } else if (ground && type === 'res') {
      win(36, y0 + 36, 78, 52);
      g.fillStyle = '#6a4b33'; g.fillRect(156, y0 + 30, 52, FH - 30); g.fillStyle = '#d8b04a'; g.fillRect(198, y0 + 80, 5, 5);
    } else if (type === 'apt') {
      win(18, y0 + 30, 56, 58, false); win(100, y0 + 30, 56, 58, false); win(182, y0 + 30, 56, 58, false);
      g.fillStyle = '#d0d0d0'; g.fillRect(0, y0 + 96, 256, 6);
    } else {
      win(40, y0 + 30, 64, 56); win(152, y0 + 30, 64, 56);
    }
    g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, y0 + FH - 4, 256, 4);
  }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, c.height - 10, 256, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return texCache[key] = t;
}

// ---------------------------------------------------------------- geração de construções
setStatus('Construindo as casas…'); await pause();
const RES_COLORS = ['#f4efe4', '#efe3c2', '#f2d9a0', '#e8c58a', '#d9e5c8', '#c7dcd0', '#f0cfc4', '#e7b8a6', '#cfe0ea', '#ffffff', '#ececec', '#d8c3a5', '#f3e7a1', '#b9d3a8', '#e3a87a', '#cfc6e6', '#f6d6e0', '#bfd8e8'];
const MOD_COLORS = ['#f4f4f2', '#ffffff', '#e2e3e3', '#c9cbcc', '#9fa3a6', '#5d6166', '#e9e1d2', '#d8cbb5'];
const SHOP_COLORS = ['#ffffff', '#f2f2f2', '#e9e4da', '#d6d6d6', '#f3e1b5', '#cfe1ef', '#e8d3c4'];
const ROOF_COLORS = ['#a5502e', '#b4603a', '#8f4428', '#9b5a3c', '#7d4a36', '#ad6a46'];
const GATE_COLORS = ['#2b2b2b', '#3b3f44', '#5b3d26', '#6d6f72', '#1f3b5a', '#7a2b22'];
const AWN_COLORS = ['#c0392b', '#2e6fb5', '#2e8b57', '#e0a400', '#7b3fa0', '#d35400', '#16808a'];

const heightOf = b => b.type === 'shop' ? 4 + (b.floors - 1) * 3 : b.floors * 3 + 0.3;
const buildings = []; // casas, lojas, prédios
const walls = [];     // muros
const yardTrees = [];
const MAJOR = r => !r.foot && /primary|secondary|tertiary/.test(r.t.highway);

function genBlock(poly0, kind, seed, opt = {}) {
  const poly = clean(poly0); if (poly.length < 3 || Math.abs(area(poly)) < 60) return;
  const r = rng(seed), sg = area(poly) > 0 ? 1 : -1, n = poly.length;
  const SW = opt.sidewalk ?? 2.4;
  const inner = inset(poly, SW - 0.3);
  const placed = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 9) continue;
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nr = [-e[1] * sg, e[0] * sg];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const onMajor = !!nearestRoad(mid[0] - nr[0] * 3, mid[1] - nr[1] * 3, 12, MAJOR);
    let pos = 3;
    while (pos < L - 3) {
      let k = kind;
      if (kind === 'res' && r() < (onMajor ? 0.35 : 0.07)) k = 'shop';
      const modern = k === 'res' && r() < 0.32; // sobrados modernos (comuns na Ilha, ex.: Rua Doze)
      let f = k === 'shop' ? 8 + r() * 9 : k === 'apt' ? 18 + r() * 10 : k === 'city' ? 10 + r() * 12 : 8 + r() * 5;
      if (pos + f > L - 2) f = L - 2 - pos; if (f < 6) break;
      const setback = modern ? 0.2 : k === 'res' ? 1.5 + r() * 3 : k === 'apt' ? 3 + r() * 2 : 0;
      const w = f - 0.3 - r() * 0.7;
      let ok = null;
      for (const depth of [k === 'apt' ? 13 + r() * 5 : k === 'city' ? 14 + r() * 10 : k === 'shop' ? 12 + r() * 9 : 9 + r() * 7]) {
        for (const dd of [depth, depth * 0.75, depth * 0.55]) {
          if (dd < 5) break;
          const cd = SW + setback + dd / 2, t = pos + f / 2;
          const box = { x: a[0] + e[0] * t + nr[0] * cd, z: a[1] + e[1] * t + nr[1] * cd, w, d: dd, ex: e, nx: nr };
          if (!corners(box).every(c => inside(c, inner))) continue;
          if (placed.some(p => obbOverlap(p, box))) continue;
          ok = box; break;
        }
      }
      if (ok) {
        placed.push(ok);
        let floors;
        if (k === 'res') floors = r() < 0.6 ? 1 : r() < 0.88 ? 2 : 3;
        else if (k === 'shop') floors = r() < 0.55 ? 1 : r() < 0.85 ? 2 : 3;
        else if (k === 'apt') floors = opt.floors || (4 + Math.floor(r() * 2));
        else floors = r() < 0.4 ? 2 + Math.floor(r() * 2) : 4 + Math.floor(r() * 9);
        const type = k === 'res' ? 'res' : k === 'shop' ? 'shop' : (k === 'city' && floors <= 3) ? 'shop' : 'apt';
        const bl = Object.assign(ok, {
          kind: k, type, floors, setback, lot: f, edgeA: a, along: pos, sw: SW,
          color: type === 'shop' ? pick(r, SHOP_COLORS) : pick(r, RES_COLORS),
          roof: type === 'res' ? (r() < 0.58 ? 'ceramic' : 'flat') : (type === 'shop' && r() < 0.25 ? 'ceramic' : 'flat'),
          roofColor: pick(r, ROOF_COLORS),
          tank: r() < 0.8,
          wall: k === 'res' && setback >= 1.5 ? (r() < 0.5 ? null : pick(r, ['#e9e5dc', '#cfc9bd', '#b8b2a6', '#ffffff'])) : undefined,
          gate: pick(r, GATE_COLORS),
          awning: type === 'shop' && r() < 0.5 ? pick(r, AWN_COLORS) : null,
          band: type === 'shop' && r() < 0.7 ? pick(r, AWN_COLORS) : null,
        });
        if (bl.wall === null) bl.wall = bl.color;
        if (modern) Object.assign(bl, { type: 'mod', floors: r() < 0.8 ? 2 : 3, roof: 'flat', wall: undefined, color: pick(r, MOD_COLORS) });
        buildings.push(bl);
      }
      pos += f;
    }
  }
  // árvores no quintal
  if (opt.yardTrees !== false) {
    const c = centroid(poly); const inner2 = inset(poly, 8);
    for (let t = 0; t < 3; t++) { const p = [c[0] + (r() - 0.5) * 30, c[1] + (r() - 0.5) * 30]; if (inside(p, inner2) && !placed.some(b => Math.hypot(b.x - p[0], b.z - p[1]) < Math.max(b.w, b.d) / 2 + 2)) yardTrees.push(p); }
  }
}

// grandes construções especiais
const specials = []; // {box, h, color, kind, name}
function removeIn(poly, pad = 0) {
  const P = pad ? inset(poly, -pad) : poly;
  for (let i = buildings.length - 1; i >= 0; i--) { const b = buildings[i]; if (inside([b.x, b.z], P) || corners(b).some(c => inside(c, P))) buildings.splice(i, 1); }
}

// quarteirões da ilha
const blockMeshes = [];
const plazaGeos = [], woodGeos = [], sideGeos = [];
for (const bl of W.blocks) {
  const t = bl.t, poly = clean(bl.p); if (poly.length < 3) continue;
  const c = centroid(poly), seed = hash2(c[0], c[1]);
  fillPoly(poly, 2);
  if (t.leisure === 'park') { plazaGeos.push(tint(strip(flatGeo(poly, 0.18)), '#8fb36a')); sideGeos.push(tint(strip(flatGeo(poly, 0, 0.17)), '#c9c4b8')); bl.kind = 'park'; continue; }
  if (t.natural === 'wood') { woodGeos.push(tint(strip(flatGeo(poly, 0.06)), '#4d7a3a')); bl.kind = 'wood'; const r = rng(seed); const P = inset(poly, 2); for (let i = 0; i < Math.abs(area(poly)) / 90; i++) { const p = [c[0] + (r() - 0.5) * 400, c[1] + (r() - 0.5) * 400]; if (inside(p, P)) yardTrees.push(p); } fillPoly(poly, 1); continue; }
  sideGeos.push(tint(strip(flatGeo(poly, 0, 0.18)), '#cbc6ba'));
  if (t.leisure === 'resort') { bl.kind = 'club'; plazaGeos.push(tint(strip(flatGeo(inset(poly, 2.4), 0.19)), '#7fae5e')); const fb = fitBox(inset(poly, 4), 0.35); specials.push({ box: fb, h: 7, color: '#f1f1f1', kind: 'club', name: t.name }); continue; }
  if (t.landuse === 'education' || t.amenity === 'school') { bl.kind = 'school'; genBlock(poly, 'res', seed); removeIn(poly); const fb = fitBox(inset(poly, 4), 0.62); specials.push({ box: fb, h: 7, color: '#f3e3b3', kind: 'school', name: t.name }); continue; }
  if (t.landuse === 'retail') { bl.kind = 'shop'; genBlock(poly, 'shop', seed); continue; }
  if (t.residential === 'apartments') { bl.kind = 'apt'; genBlock(poly, 'apt', seed, { floors: 4 }); continue; }
  bl.kind = 'res'; genBlock(poly, 'res', seed);
}
// continente (Centro, Lourdes, Santa Terezinha…)
for (const m of W.mainland) if (m.k === 'block') {
  const poly = clean(m.p); if (poly.length < 3) continue; const c = centroid(poly);
  fillPoly(poly, 2, 1);
  sideGeos.push(tint(strip(flatGeo(poly, 0, 0.18)), '#c3beb2'));
  if (m.t.amenity === 'school' || m.t.landuse === 'education') { specials.push({ box: fitBox(inset(poly, 4), 0.6), h: 8, color: '#efe2c0', kind: 'school', name: m.t.name }); continue; }
  if (m.t.leisure === 'park') { plazaGeos.push(tint(strip(flatGeo(poly, 0.19)), '#8fb36a')); continue; }
  const centro = m.t['addr:suburb'] === 'Centro' || m.t.landuse === 'commercial' || m.t.landuse === 'retail';
  genBlock(poly, centro ? 'city' : 'res', hash2(c[0], c[1]), { yardTrees: false });
}
// onde o mapa não tem quarteirões: casas ao longo das ruas do continente
{
  const r = rng(77), HC = 20, hb = new Map();
  const hk = (x, z) => Math.floor(x / HC) * 100003 + Math.floor(z / HC);
  const addH = b => { const rad = Math.hypot(b.w, b.d) / 2; for (let x = b.x - rad; x <= b.x + rad + HC; x += HC) for (let z = b.z - rad; z <= b.z + rad + HC; z += HC) { const k = hk(x, z); if (!hb.has(k)) hb.set(k, []); hb.get(k).push(b); } };
  const hits = b => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const l = hb.get(hk(b.x + dx * HC, b.z + dz * HC)); if (l) for (const o of l) if (obbOverlap(o, b, 0.6)) return true; } return false; };
  const onMain = (x, z) => { const c = Math.floor((x - B.x0) / B.cell), q = Math.floor((z - B.z0) / B.cell); return c >= 0 && q >= 0 && c < B.nx && q < B.nz && mainMask[q * B.nx + c] && landGrid[q * B.nx + c] !== 2; };
  const clearOfRoads = (x, z) => { const nr = nearestRoad(x, z, 30, rd => !rd.foot); return !nr || nr.d > nr.seg.r.w / 2 + 1.2; };
  for (const b of buildings) addH(b);
  for (const m of W.mainland) if (m.k === 'road') {
    const w = roadWidth(m.t); if (w < 6 || m.t.bridge) continue;
    for (let i = 0; i + 1 < m.p.length; i++) {
      const a = m.p[i], b = m.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 12) continue;
      const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-e[1], e[0]];
      for (const side of [-1, 1]) {
        let s = 4;
        while (s < L - 6) {
          const f = 9 + r() * 7, depth = 10 + r() * 9, off = w / 2 + 2.4 + depth / 2;
          const box = { x: a[0] + e[0] * (s + f / 2) + n[0] * side * off, z: a[1] + e[1] * (s + f / 2) + n[1] * side * off, w: f - 0.6, d: depth, ex: e, nx: [n[0] * side, n[1] * side] };
          s += f;
          const back = [box.x + box.nx[0] * (depth / 2 + 7), box.z + box.nx[1] * (depth / 2 + 7)];
          if (!corners(box).every(c => onMain(c[0], c[1]) && clearOfRoads(c[0], c[1])) || !clearOfRoads(box.x, box.z) || !clearOfRoads(back[0], back[1]) || hits(box)) continue;
          const big = r() < 0.12, floors = big ? 4 + Math.floor(r() * 8) : (r() < 0.6 ? 1 : 2);
          const type = big ? 'apt' : (r() < 0.2 ? 'shop' : 'res');
          Object.assign(box, { kind: type, type, floors, color: pick(r, type === 'shop' ? SHOP_COLORS : RES_COLORS), roof: type === 'res' && r() < 0.6 ? 'ceramic' : 'flat', roofColor: pick(r, ROOF_COLORS), tank: r() < 0.8, gate: pick(r, GATE_COLORS), awning: type === 'shop' && r() < 0.5 ? pick(r, AWN_COLORS) : null, band: type === 'shop' ? pick(r, AWN_COLORS) : null });
          buildings.push(box); addH(box);
        }
      }
    }
  }
}
for (const m of W.mainland) if (m.k === 'bld') {
  const poly = clean(m.p); if (poly.length < 3) continue; removeIn(poly, 1);
  const lv = +(m.t['building:levels'] || 0); const h = m.t.height ? +m.t.height : lv ? lv * 3.1 : 8;
  specials.push({ poly, h, color: '#e6e0d4', kind: 'osm', name: m.t.name, box: fitBox(poly, 1) });
}
// áreas do OSM dentro da ilha (escolas, igreja, polícia, quadras, piscinas…)
const pitchGeos = [], poolGeos = [], parkingGeos = [];
for (const a of W.areas) {
  const t = a.t, poly = clean(a.p); if (poly.length < 3) continue;
  if (t.amenity === 'school' || t.amenity === 'police' || t.amenity === 'place_of_worship') {
    removeIn(poly, 1);
    const fb = fitBox(inset(poly, 3), t.amenity === 'place_of_worship' ? 0.55 : 0.6);
    specials.push({ box: fb, area: poly, h: t.amenity === 'place_of_worship' ? 10 : t.amenity === 'police' ? 5 : 7.5, color: t.amenity === 'police' ? '#e8e8e8' : t.amenity === 'place_of_worship' ? '#f5f0e2' : '#f2dfae', kind: t.amenity, name: t.name });
  } else if (t.leisure === 'pitch') { removeIn(poly); pitchGeos.push(tint(strip(flatGeo(poly, 0.21)), t.surface === 'concrete' || /basket|futsal|skate/.test(t.sport || '') ? '#6d8fa3' : '#4f9a45')); }
  else if (t.leisure === 'swimming_pool') { removeIn(poly); poolGeos.push(tint(strip(flatGeo(poly, 0.22)), '#3fb6d6')); }
  else if (t.amenity === 'parking') { removeIn(poly); parkingGeos.push(tint(strip(flatGeo(poly, 0.2)), '#6f6f6f')); }
  else if (t.leisure === 'park' || t.leisure === 'garden') { plazaGeos.push(tint(strip(flatGeo(poly, 0.2)), '#88b065')); }
  else if (t.natural === 'wood') { woodGeos.push(tint(strip(flatGeo(poly, 0.07)), '#4d7a3a')); }
}
// prédios desenhados no OSM
// afasta os vértices do contorno para fora do leito das ruas (o desenho do OSM do Coelho Diniz invade a Av. Piracicaba)
function offRoads(poly, margin = 2.6) {
  const P = poly.map(p => p.slice());
  for (let pass = 0; pass < 4; pass++) for (const p of P) {
    const nr = nearestRoad(p[0], p[1], 25, r => !r.foot); if (!nr) continue;
    const need = nr.seg.r.w / 2 + margin; if (nr.d >= need) continue;
    const { a, b } = nr.seg, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    let nx = -dz / L, nz = dx / L; const C = centroid(P); if ((C[0] - p[0]) * nx + (C[1] - p[1]) * nz < 0 && false) { }
    const side = (p[0] - a[0]) * nx + (p[1] - a[1]) * nz; const sgn = side === 0 ? ((C[0] - a[0]) * nx + (C[1] - a[1]) * nz > 0 ? 1 : -1) : Math.sign(side);
    const mv = need - nr.d; p[0] += nx * sgn * mv; p[1] += nz * sgn * mv;
  }
  return P;
}
for (const b of W.buildings) {
  let poly = clean(b.p); if (poly.length < 3) continue;
  if (/Coelho Diniz/.test(b.t.name || '')) poly = offRoads(poly, 2.6);
  removeIn(poly, 2);
  const lv = +(b.t['building:levels'] || 0); const h = b.t.height ? +b.t.height : lv ? lv * 3.2 : (b.t.building === 'roof' ? 5.5 : 7);
  const coelho = /Coelho Diniz/.test(b.t.name || '');
  specials.push({ poly, h: coelho ? 11 : h, color: b.t.amenity === 'fuel' ? '#e9e9e9' : '#efe6d4', kind: coelho ? 'coelho' : b.t.building === 'roof' ? 'canopy' : 'osm', name: coelho ? 'Coelho Diniz - Ilha dos Araújos' : b.t.name, box: fitBox(poly, 1) });
}

// pontos com nome viram lojas com placa
const landmarks = [];
const CAT_COLOR = { Padaria: '#d35400', Confeitaria: '#c2577a', Farmácia: '#1f8a4c', Bar: '#7a2b22', Restaurante: '#a0301f', Churrascaria: '#8f2a1a', Pizzaria: '#c0392b', Hamburgueria: '#b0441f', Lanchonete: '#6a2c91', Academia: '#222831', Igreja: '#3b5b92', Pet: '#2a8fbd', 'Pet Shop': '#2a8fbd', Sorveteria: '#7b3fa0', Açaí: '#5b2a7a', 'Salão de beleza': '#c2577a', 'Materiais de construção': '#e67e22', Calçados: '#2c3e50', 'Moda feminina': '#9b3b6b' };
const placePts = [];
for (const [nm, la, lo, cat] of PLACES) {
  const p = toLocal(la, lo); if (!inside(p, island) || /^Coelho Diniz/.test(nm)) continue;
  placePts.push(p);
  let best = null, bd = 28; for (const b of buildings) { if (b.name) continue; const d = Math.hypot(b.x - p[0], b.z - p[1]); if (d < bd) { bd = d; best = b; } }
  const band = CAT_COLOR[cat] || '#34495e';
  if (best) {
    best.name = nm; best.cat = cat; best.band = band; best.wall = undefined; best.roof = cat === 'Igreja' ? best.roof : 'flat';
    if (cat !== 'Igreja') { best.type = 'shop'; best.kind = 'shop'; best.floors = Math.max(1, Math.min(best.floors, 2)); if (/Bar|Restaurante|Churrascaria|Lanchonete|Açaí|Sorveteria|Pizzaria|Hamburgueria/.test(cat)) best.awning = best.awning || band; }
    landmarks.push({ x: best.x, z: best.z, name: nm, h: heightOf(best) + 3 });
  } else landmarks.push({ x: p[0], z: p[1], name: nm, h: 6 });
}
for (const p of W.pois) {
  const nm = p.t.name; if (!nm || nm === 'Ilha dos Araújos' || /^Entrada /.test(nm)) continue;
  if (placePts.some(q => Math.hypot(q[0] - p.p[0], q[1] - p.p[1]) < 40)) continue; // o Google Maps tem o nome mais atual
  let best = null, bd = 30; for (const b of buildings) { const d = Math.hypot(b.x - p.p[0], b.z - p.p[1]); if (d < bd) { bd = d; best = b; } }
  if (best) { best.type = 'shop'; best.kind = 'shop'; best.name = nm; best.wall = undefined; best.roof = 'flat'; best.floors = Math.max(1, Math.min(best.floors, 2)); best.band = best.band || '#c0392b'; landmarks.push({ x: best.x, z: best.z, name: nm, h: best.floors * 3.5 + 3 }); }
  else landmarks.push({ x: p.p[0], z: p.p[1], name: nm, h: 6 });
}
for (const s of specials) if (s.name) landmarks.push({ x: s.box.x, z: s.box.z, name: s.name, h: s.h + 4 });
for (const bl of W.blocks) if (bl.kind === 'park' && bl.t.name) { const c = centroid(clean(bl.p)); landmarks.push({ x: c[0], z: c[1], name: bl.t.name, h: 6 }); }

// ajustes manuais (fotos / Street View)
const applied = [];
for (const o of OV) {
  // at: [x, z, rumo da câmera (graus), distância à frente, deslocamento para a direita da imagem]
  let p = o.pos || (o.latlon ? toLocal(o.latlon[0], o.latlon[1]) : null);
  if (o.at) { const [x, z, hd, d = 14, lat = 0] = o.at, h = hd * Math.PI / 180, h2 = h + Math.PI / 2; p = [x + Math.sin(h) * d + Math.sin(h2) * lat, z - Math.cos(h) * d - Math.cos(h2) * lat]; }
  if (!p) continue;
  let best = null, bd = o.radius || 15;
  for (const b of buildings) { const d = Math.hypot(b.x - p[0], b.z - p[1]); if (d < bd) { bd = d; best = b; } }
  if (!best) continue;
  if (o.remove) { buildings.splice(buildings.indexOf(best), 1); applied.push(o); continue; } // terreno vazio / estacionamento
  if (o.type) { best.type = o.type; best.kind = o.type; if (o.type !== 'res') best.wall = undefined; }
  for (const k of ['color', 'floors', 'roof', 'roofColor', 'awning', 'band', 'gate', 'tank']) if (o[k] !== undefined) best[k] = o[k];
  if (o.wall !== undefined) best.wall = o.wall || undefined;
  if (o.name) { best.name = o.name; landmarks.push({ x: best.x, z: best.z, name: o.name, h: best.floors * 3.5 + 3 }); }
  { const mn = /^(\d{1,5}[A-Z]?)\s/.exec(o.note || ''); if (mn) best.num = mn[1]; } // número real visto no Street View
  applied.push(o);
}

// ---------------------------------------------------------------- malhas das construções
setStatus('Levantando as paredes…'); await pause();
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
const yawOf = e => Math.atan2(-e[1], e[0]);
function setInst(mesh, i, x, y, z, yaw, sx, sy, sz, color) {
  tmpQ.setFromAxisAngle(UP, yaw); tmpP.set(x, y, z); tmpS.set(sx, sy, sz); tmpM.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(i, tmpM);
  if (color !== undefined) mesh.setColorAt(i, tmpC.set(color));
}
{
  const groups = {};
  for (const b of buildings) { b.h = heightOf(b); if (b.name) continue; /* estabelecimentos: casca aberta, montada à parte */ const k = b.type + '|' + b.floors; (groups[k] ||= []).push(b); }
  const topMat = new THREE.MeshLambertMaterial({ color: '#a7a29a' });
  for (const [k, list] of Object.entries(groups)) {
    const [type, fl] = k.split('|');
    const wm = new THREE.MeshLambertMaterial({ map: facadeTex(type, +fl) });
    const m = new THREE.InstancedMesh(unitBox, [wm, wm, topMat, topMat, wm, wm], list.length);
    list.forEach((b, i) => setInst(m, i, b.x, 0.15, b.z, yawOf(b.ex), b.w, b.h, b.d, b.color));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  for (const b of buildings) if (!b.name) addObstacle({ x: b.x, z: b.z, w: b.w, d: b.d, ex: b.ex, nx: b.nx });

  // telhados de cerâmica
  const hip = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const ceramic = buildings.filter(b => b.roof === 'ceramic');
  const rm = new THREE.InstancedMesh(hip, new THREE.MeshLambertMaterial(), ceramic.length);
  ceramic.forEach((b, i) => setInst(rm, i, b.x, 0.15 + b.h, b.z, yawOf(b.ex), b.w + 0.9, 1.4 + Math.min(b.w, b.d) * 0.08, b.d + 0.9, b.roofColor));
  rm.castShadow = true; scene.add(rm);

  // caixas d'água e platibandas nas lajes
  const flat = buildings.filter(b => b.roof === 'flat');
  const tankB = flat.filter(b => b.tank);
  const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.65, 1.1, 12).translate(0, 0.55, 0), new THREE.MeshLambertMaterial({ color: '#2b62b5' }), tankB.length);
  tankB.forEach((b, i) => { const ox = b.w * 0.25, oz = b.d * 0.2; setInst(tm, i, b.x + b.ex[0] * ox + b.nx[0] * oz, 0.15 + b.h, b.z + b.ex[1] * ox + b.nx[1] * oz, 0, 1, 1, 1); });
  tm.castShadow = true; scene.add(tm);
  const pm = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial(), flat.length);
  flat.forEach((b, i) => setInst(pm, i, b.x, 0.15 + b.h, b.z, yawOf(b.ex), b.w + 0.15, 0.6, b.d + 0.15, b.color));
  scene.add(pm);
  // a platibanda é uma caixa: rebaixamos o miolo com uma "laje" escura por cima
  const lm = new THREE.InstancedMesh(unitBox, topMat, flat.length);
  flat.forEach((b, i) => setInst(lm, i, b.x, 0.15 + b.h + 0.45, b.z, yawOf(b.ex), b.w - 0.4, 0.2, b.d - 0.4));
  scene.add(lm);

  // muros com portão
  const wallB = buildings.filter(b => b.wall);
  const wm = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial(), wallB.length * 3);
  const gm = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial(), wallB.length);
  wallB.forEach((b, i) => {
    const wh = 1.9 + (hash2(b.x, b.z) % 7) / 10, t0 = b.along, f = b.lot, a = b.edgeA, e = b.ex, nr = b.nx;
    const fx = a[0] + e[0] * (t0 + f / 2) + nr[0] * (b.sw + 0.12), fz = a[1] + e[1] * (t0 + f / 2) + nr[1] * (b.sw + 0.12);
    const y = 0.18, yaw = yawOf(e);
    setInst(wm, i * 3, fx, y, fz, yaw, f - 0.1, wh, 0.22, b.wall);
    const sbd = b.setback + 0.1;
    for (const s of [-1, 1]) setInst(wm, i * 3 + (s < 0 ? 1 : 2), fx + e[0] * s * (f / 2 - 0.1) + nr[0] * sbd / 2, y, fz + e[1] * s * (f / 2 - 0.1) + nr[1] * sbd / 2, yaw, 0.2, wh * 0.9, sbd, b.wall);
    const gw = Math.min(3, f * 0.4);
    setInst(gm, i, fx - e[0] * (f * 0.18), y, fz - e[1] * (f * 0.18), yaw, gw, wh - 0.15, 0.32, b.gate);
    const wb = { x: fx, z: fz, w: f - 0.1, d: 0.3, ex: e, nx: nr }; walls.push(wb); addObstacle(wb);
  });
  wm.castShadow = true; scene.add(wm, gm);

  // toldos e faixas de loja
  const awn = buildings.filter(b => b.awning), band = buildings.filter(b => b.band);
  const am = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial(), awn.length);
  awn.forEach((b, i) => setInst(am, i, b.x - b.nx[0] * (b.d / 2 + 0.8), 3.0, b.z - b.nx[1] * (b.d / 2 + 0.8), yawOf(b.ex), b.w * 0.92, 0.15, 1.6, b.awning));
  const bm = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial(), band.length);
  band.forEach((b, i) => setInst(bm, i, b.x - b.nx[0] * (b.d / 2 + 0.06), 3.25, b.z - b.nx[1] * (b.d / 2 + 0.06), yawOf(b.ex), b.w * 0.96, 0.9, 0.12, b.band));
  am.castShadow = true; scene.add(am, bm);
}

// ---------------------------------------------------------------- números das casas
// Em Valadares a numeração é métrica: o número é a distância (em metros) desde o começo da rua,
// pares do lado direito e ímpares do lado esquerdo. Onde o Street View mostrou o número real, vale o real.
{
  // eixo de cada rua (todas as partes com o mesmo nome): as ruas no sentido do comprimento da ilha começam na ponta
  // norte (Rio Doce 1688 no Garfo → 2813 no Lourdinas: 1125 números em ~1165 m); as transversais começam no lado oeste.
  const AX = [-0.487, 0.873], AXP = [0.873, 0.487], streets = new Map();
  for (const r of allRoads) { if (r.foot || !r.t.name) continue; let s = streets.get(r.t.name); if (!s) streets.set(r.t.name, s = { pts: [] }); s.pts.push(...r.p); }
  for (const s of streets.values()) {
    let best = [0, 1, 0]; for (let i = 0; i < s.pts.length; i += 3) for (let j = i + 1; j < s.pts.length; j += 3) { const d = Math.hypot(s.pts[j][0] - s.pts[i][0], s.pts[j][1] - s.pts[i][1]); if (d > best[2]) best = [i, j, d]; }
    let d = [(s.pts[best[1]][0] - s.pts[best[0]][0]) / (best[2] || 1), (s.pts[best[1]][1] - s.pts[best[0]][1]) / (best[2] || 1)];
    const ref = Math.abs(d[0] * AX[0] + d[1] * AX[1]) > 0.6 ? AX : AXP; if (d[0] * ref[0] + d[1] * ref[1] < 0) d = [-d[0], -d[1]];
    s.d = d; s.min = Math.min(...s.pts.map(p => p[0] * d[0] + p[1] * d[1])); s.cal = [];
  }
  const info = new Map();
  for (const b of buildings) {
    const f = [-b.nx[0], -b.nx[1]], q = [b.x + f[0] * (b.d / 2 + 6), b.z + f[1] * (b.d / 2 + 6)];
    const nr = nearestRoad(q[0], q[1], 40, r => !r.foot && !!r.t.name); if (!nr) continue;
    const s = streets.get(nr.seg.r.t.name); if (!s) continue;
    const proj = b.x * s.d[0] + b.z * s.d[1] - s.min, right = (b.x - nr.seg.a[0]) * -s.d[1] + (b.z - nr.seg.a[1]) * s.d[0] > 0;
    info.set(b, { s, proj, right, name: nr.seg.r.t.name });
    if (b.num) s.cal.push(parseInt(b.num) - proj); // número real conhecido calibra a rua
  }
  for (const s of streets.values()) { if (s.cal.length) { s.cal.sort((a, b) => a - b); s.off = s.cal[s.cal.length >> 1]; } else s.off = 1; }
  // endereços reais conhecidos (Google Maps): duas âncoras definem a rua por inteiro
  const ANCHORS = { 'Avenida Rio Doce': [[593, -801, 1688], [272, 316, 2813]], 'Rua Trinta e Seis': [[70, 170, 404], [245, 272, 596]] };
  for (const [name, [[x1, z1, n1], [x2, z2, n2]]] of Object.entries(ANCHORS)) {
    const s = streets.get(name); if (!s) continue; const L = Math.hypot(x2 - x1, z2 - z1), d = [(x2 - x1) / L, (z2 - z1) / L], k = (n2 - n1) / L;
    for (const [b, it] of info) if (it.s === s) { it.proj = ((b.x - x1) * d[0] + (b.z - z1) * d[1]) * k + n1 - 1; it.right = (b.x - x1) * -d[1] + (b.z - z1) * d[0] > 0; }
    s.off = 1;
  }
  const used = new Set(['Rua Doze592']), plates = []; // 592/592A têm modelo próprio (lugares.js)
  for (const b of buildings) {
    const f = [-b.nx[0], -b.nx[1]]; // frente (para a rua)
    let cx, cy, cz;
    if (b.wall && b.edgeA) { // na frente do muro, ao lado do portão
      const wh = 1.9 + (hash2(b.x, b.z) % 7) / 10, a = b.edgeA, e = b.ex, nr = b.nx, t = b.along + b.lot / 2 + b.lot * 0.28;
      cx = a[0] + e[0] * t + nr[0] * (b.sw + 0.12) + f[0] * 0.14; cz = a[1] + e[1] * t + nr[1] * (b.sw + 0.12) + f[1] * 0.14; cy = 0.18 + wh * 0.62;
    } else { cx = b.x + f[0] * (b.d / 2 + 0.04) + b.ex[0] * b.w * 0.3; cz = b.z + f[1] * (b.d / 2 + 0.04) + b.ex[1] * b.w * 0.3; cy = 2.25; }
    let num = b.num;
    if (!num) {
      const it = info.get(b); let n = 1 + (hash2(b.x, b.z) % 900), key = 'x';
      if (it) { n = Math.max(1, Math.round(it.proj + it.s.off)); if ((n % 2 === 0) !== it.right) n += 1; key = it.name; }
      while (used.has(key + n)) n += 2; used.add(key + n); num = String(n);
    }
    b.num = num; plates.push({ c: [cx, cy, cz], f, num });
  }
  // todas as plaquinhas numa textura só (atlas) e numa malha só = leve
  const CW = 64, CH = 32, COLS = 32, rows = Math.ceil(plates.length / COLS), AW = CW * COLS, AH = Math.max(32, 2 ** Math.ceil(Math.log2(rows * CH)));
  const cvs = document.createElement('canvas'); cvs.width = AW; cvs.height = AH; const g = cvs.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  plates.forEach((p, i) => { const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH; g.fillStyle = '#f4f1e8'; g.fillRect(x + 1, y + 1, CW - 2, CH - 2); g.strokeStyle = '#1d3f7a'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, CW - 6, CH - 6); g.fillStyle = '#1d2a44'; g.font = `700 ${p.num.length > 3 ? 19 : 22}px Arial, sans-serif`; g.fillText(p.num, x + CW / 2, y + CH / 2 + 1); });
  const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const pos = [], uv = [], idx = [], PW = 0.42, PH = 0.21;
  plates.forEach((p, i) => {
    const [cx, cy, cz] = p.c, rx = p.f[1], rz = -p.f[0]; // direita de quem olha para a placa
    const u0 = (i % COLS) * CW / AW, u1 = u0 + CW / AW, v1 = 1 - Math.floor(i / COLS) * CH / AH, v0 = v1 - CH / AH, k = i * 4;
    pos.push(cx - rx * PW / 2, cy - PH / 2, cz - rz * PW / 2, cx + rx * PW / 2, cy - PH / 2, cz + rz * PW / 2, cx + rx * PW / 2, cy + PH / 2, cz + rz * PW / 2, cx - rx * PW / 2, cy + PH / 2, cz - rz * PW / 2);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1); idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: '#555555', emissiveMap: tex })));
}

// placas com nome
function textTex(text, bg = '#c0392b', fg = '#fff', w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; let fs = 64; g.font = `700 ${fs}px system-ui, sans-serif`;
  while (g.measureText(text).width > w - 30 && fs > 18) { fs -= 4; g.font = `700 ${fs}px system-ui, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
for (const b of buildings) if (b.name) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(b.w * 0.9, 9), Math.min(b.w * 0.9, 9) / 4), new THREE.MeshBasicMaterial({ map: textTex(b.name, b.band || '#c0392b') }));
  m.position.set(b.x - b.nx[0] * (b.d / 2 + 0.15), 3.3, b.z - b.nx[1] * (b.d / 2 + 0.15)); m.rotation.y = Math.atan2(-b.nx[0], -b.nx[1]); scene.add(m);
}

// ---------------------------------------------------------------- lugares onde dá para entrar
// Cada estabelecimento é uma "casca" com a porta aberta; o interior é montado lá dentro quando o jogador chega perto.
const enterables = [];
const rotXZ = (th, lx, lz) => [Math.cos(th) * lx + Math.sin(th) * lz, -Math.sin(th) * lx + Math.cos(th) * lz];
function staticWall(cx, cz, th, lx, lz, w, d) { const p = rotXZ(th, lx, lz); addObstacle({ x: cx + p[0], z: cz + p[1], w, d, ex: [Math.cos(th), -Math.sin(th)], nx: [Math.sin(th), Math.cos(th)] }); }
{
  const roofTop = new THREE.MeshLambertMaterial({ color: '#a7a29a' }), glassM = new THREE.MeshLambertMaterial({ color: '#33424a', emissive: '#1d2a30' });
  for (const b of buildings) if (b.name) {
    const out = [-b.nx[0], -b.nx[1]], th = Math.atan2(out[0], out[1]), h = b.h, t = 0.25, dw = 2.2, dh = 2.7, side = (b.w - dw) / 2;
    const G = new THREE.Group(); G.position.set(b.x, 0.15, b.z); G.rotation.y = th; scene.add(G);
    const wm = new THREE.MeshLambertMaterial({ color: b.color });
    const add = (x, y, z, sx, sy, sz, m = wm) => { const me = new THREE.Mesh(unitBox, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); me.castShadow = true; G.add(me); return me; };
    add(0, 0, -b.d / 2 + t / 2, b.w, h, t); add(-b.w / 2 + t / 2, 0, 0, t, h, b.d); add(b.w / 2 - t / 2, 0, 0, t, h, b.d);
    add(-(dw / 2 + side / 2), 0, b.d / 2 - t / 2, side, h, t); add(dw / 2 + side / 2, 0, b.d / 2 - t / 2, side, h, t); add(0, dh, b.d / 2 - t / 2, dw, h - dh, t);
    add(0, h - 0.25, 0, b.w, 0.25, b.d, roofTop);
    for (const s of [-1, 1]) if (side > 1.2) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(side - 0.6, 2.1), glassM); gl.position.set(s * (dw / 2 + side / 2), 1.35, b.d / 2 + 0.01); G.add(gl); }
    if (h > 4.5) { const up = new THREE.Mesh(new THREE.PlaneGeometry(b.w, h - 3.6), new THREE.MeshLambertMaterial({ map: facadeTex('res', Math.max(1, b.floors - 1)), color: b.color })); up.position.set(0, 3.6 + (h - 3.6) / 2, b.d / 2 + 0.01); G.add(up); }
    // paredes com colisão (a porta fica livre)
    staticWall(b.x, b.z, th, 0, -b.d / 2 + t / 2, b.w, t); staticWall(b.x, b.z, th, -b.w / 2 + t / 2, 0, t, b.d); staticWall(b.x, b.z, th, b.w / 2 - t / 2, 0, t, b.d);
    staticWall(b.x, b.z, th, -(dw / 2 + side / 2), b.d / 2 - t / 2, side, t); staticWall(b.x, b.z, th, dw / 2 + side / 2, b.d / 2 - t / 2, side, t);
    const dp = rotXZ(th, 0, b.d / 2 + 0.9);
    enterables.push({ x: b.x + dp[0], z: b.z + dp[1], out, name: b.name, kind: 'shop', cat: b.cat || 'Loja', color: b.band, seed: hash2(b.x, b.z), cx: b.x, cz: b.z, th, W: b.w - 2 * t - 0.1, D: b.d - 2 * t - 0.1, y0: 0.16 });
  }
}

// Paróquia Nossa Senhora Aparecida — Av. Paranaíba, 256 (fotos do Google Maps, jul/2024):
// igreja em "A" com telhado que desce quase até o chão, empena com grande vitral em arco ogival,
// marquise branca com colunas, parede salmão com portas de vidro e palmeiras na frente.
function buildParoquia(s) {
  const P = clean(s.area), C = centroid(P);
  let best = null, bd = 1e9;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 12) continue;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nr = nearestRoad(mid[0], mid[1], 80, r => r.t.name === 'Avenida Paranaiba');
    const d = nr ? nr.d : 1e8; if (d < bd) { bd = d; best = { a, b, L, mid }; }
  }
  let e = [(best.b[0] - best.a[0]) / best.L, (best.b[1] - best.a[1]) / best.L], n = [-e[1], e[0]];
  if ((C[0] - best.mid[0]) * n[0] + (C[1] - best.mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
  let th = Math.atan2(-e[1], e[0]); if (Math.sin(th) * n[0] + Math.cos(th) * n[1] < 0) { e = [-e[0], -e[1]]; th = Math.atan2(-e[1], e[0]); }
  const O = [best.mid[0] + n[0] * 6, best.mid[1] + n[1] * 6];
  const G = new THREE.Group(); G.position.set(O[0], 0.18, O[1]); G.rotation.y = th; scene.add(G);
  const W = 22, L = 34, H = 21, h0 = 1.4;
  const M = c => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });
  // telhado em "A" (prisma triangular)
  const v = [-W / 2, h0, 0, 0, H, 0, 0, H, L, -W / 2, h0, 0, 0, H, L, -W / 2, h0, L, W / 2, h0, 0, W / 2, h0, L, 0, H, L, W / 2, h0, 0, 0, H, L, 0, H, 0];
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); rg.computeVertexNormals();
  const roof = new THREE.Mesh(rg, M('#a9a49b')); roof.castShadow = roof.receiveShadow = true; G.add(roof);
  for (const s2 of [-1, 1]) { const w = new THREE.Mesh(unitBox, M('#d98a6a')); w.position.set(s2 * (W / 2 - 0.2), 0, L / 2); w.scale.set(0.4, h0, L); G.add(w); }
  // empena da frente (creme) e do fundo
  const tri = (z, c) => { const t = new THREE.BufferGeometry(); t.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, z, W / 2, 0, z, W / 2, h0, z, -W / 2, 0, z, W / 2, h0, z, -W / 2, h0, z, -W / 2, h0, z, W / 2, h0, z, 0, H, z], 3)); t.computeVertexNormals(); const m = new THREE.Mesh(t, M(c)); G.add(m); };
  tri(L, '#efe3cf');
  { const hw4 = W / 2 * (H - 4) / (H - h0), t = new THREE.BufferGeometry(); t.setAttribute('position', new THREE.Float32BufferAttribute([-hw4, 4, 0.6, hw4, 4, 0.6, 0, H, 0.6], 3)); t.computeVertexNormals(); G.add(new THREE.Mesh(t, M('#efe3cf'))); }
  // bordas brancas da empena
  for (const s2 of [-1, 1]) { const len = Math.hypot(W / 2, H - h0); const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, len, 0.9), M('#f4efe6')); b.position.set(s2 * W / 4, (H + h0) / 2, 0.2); b.rotation.z = s2 * Math.atan2(W / 2, H - h0); G.add(b); }
  // grande vitral em arco ogival
  const glass = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 384; const g = c.getContext('2d'); g.fillStyle = '#efe3cf'; g.fillRect(0, 0, 256, 384);
    g.beginPath(); g.moveTo(16, 384); g.lineTo(16, 150); g.quadraticCurveTo(16, 8, 128, 0); g.quadraticCurveTo(240, 8, 240, 150); g.lineTo(240, 384); g.closePath(); g.fillStyle = '#d9692f'; g.fill(); g.save(); g.clip();
    const cols = ['#c62828', '#f9a825', '#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00', '#00838f', '#fdd835', '#ad1457'];
    for (let y = 8; y < 384; y += 22) for (let x = 24; x < 236; x += 22) { g.fillStyle = cols[(x * 13 + y * 7 + (x ^ y)) % cols.length]; g.fillRect(x, y, 20, 20); }
    g.fillStyle = '#fdd835'; g.beginPath(); g.arc(128, 150, 40, 0, 7); g.fill(); g.fillStyle = '#1d3c8f'; g.beginPath(); g.moveTo(128, 120); g.lineTo(104, 200); g.lineTo(152, 200); g.fill(); g.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const gw = new THREE.Mesh(new THREE.PlaneGeometry(9, 13.5), new THREE.MeshLambertMaterial({ map: glass, emissive: '#2a1a10', side: THREE.DoubleSide })); gw.position.set(0, 4.6 + 6.75, 0.55); gw.rotation.y = Math.PI; G.add(gw);
  // marquise branca com colunas e o nome; parede salmão com portas de vidro
  const slab = new THREE.Mesh(unitBox, M('#f6f3ee')); slab.position.set(0, 4.0, -2.2); slab.scale.set(W + 2, 0.55, 5); slab.castShadow = true; G.add(slab);
  for (const u of [-11, -6.6, -2.2, 2.2, 6.6, 11]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4, 10).translate(0, 2, 0), M('#f6f3ee')); c.position.set(u, 0, -4.2); G.add(c); }
  // parede salmão com o vão da porta aberto e vidraças dos lados
  const gp = 1.7, sw = W / 2 - gp;
  for (const s2 of [-1, 1]) { const w = new THREE.Mesh(unitBox, M('#d98a6a')); w.position.set(s2 * (gp + sw / 2), 0, 0.3); w.scale.set(sw, 4.0, 0.4); G.add(w);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.0), new THREE.MeshLambertMaterial({ color: '#2b3a40', emissive: '#3b2a12', side: THREE.DoubleSide })); gl.position.set(s2 * (gp + 2), 1.6, 0.08); G.add(gl); }
  { const li = new THREE.Mesh(unitBox, M('#d98a6a')); li.position.set(0, 3.2, 0.3); li.scale.set(2 * gp, 0.8, 0.4); G.add(li); }
  const nm = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.5), new THREE.MeshBasicMaterial({ map: textTex('PARÓQUIA NOSSA SENHORA APARECIDA', '#f6f3ee', '#7a4a2a', 1024, 64), side: THREE.DoubleSide })); nm.position.set(0, 4.28, -4.72); nm.rotation.y = Math.PI; G.add(nm);
  // palmeiras
  for (const [u, w2] of [[-14, -6], [14, -7], [-16, 10]]) {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 9, 7).translate(0, 4.5, 0), M('#8a7a62')); tr.position.set(u, 0, w2); G.add(tr);
    for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4.2, 4).rotateZ(Math.PI / 2).translate(2.1, 0, 0), M('#3f7a35')); f.position.set(u, 9, w2); f.rotation.set(0, k * 0.9, -0.35); G.add(f); }
  }
  // colisão e porta
  const toW = (u, w2) => [O[0] + e[0] * u + n[0] * w2, O[1] + e[1] * u + n[1] * w2];
  const wall = (u, w2, w, d) => { const p = toW(u, w2); addObstacle({ x: p[0], z: p[1], w, d, ex: e, nx: n }); };
  wall(-W / 2 + 0.3, L / 2, 0.6, L); wall(W / 2 - 0.3, L / 2, 0.6, L); wall(0, L, W, 0.6);
  wall(-(gp + sw / 2), 0.3, sw, 0.6); wall(gp + sw / 2, 0.3, sw, 0.6);
  for (const u of [-11, -6.6, -2.2, 2.2, 6.6, 11]) wall(u, -4.2, 0.6, 0.6);
  const DI = 33, ic = toW(0, 0.6 + DI / 2), dp = toW(0, -2);
  enterables.push({ x: dp[0], z: dp[1], out: [-n[0], -n[1]], name: s.name, kind: 'paroquia', cat: 'Igreja', color: '#7a4a2a', seed: 7, cx: ic[0], cz: ic[1], th: Math.atan2(-n[0], -n[1]), W: 20, D: DI, y0: 0.19 });
}

// construções especiais
const LCTX = { THREE, scene, addObstacle, unitBox, W, yardTrees, landmarks, nearestRoad, enterables, public: PUBLIC_SITE };
for (const s of specials) {
  const b = s.box; let mesh;
  if (s.kind === 'place_of_worship' && /Aparecida/.test(s.name || '')) { buildParoquia(s); continue; }
  if (/Nacle/.test(s.name || '')) { buildLugares(LCTX, 'nacle'); continue; }
  if (/Lourdes/.test(s.name || '') && s.kind === 'school') { buildLugares(LCTX, 'lourdes'); continue; }
  if (/Garfo/.test(s.name || '')) { buildLugares(LCTX, 'garfo'); continue; }
  if (s.poly && s.kind === 'coelho') { buildLugares(LCTX, 'coelho', { P: clean(s.poly) }); continue; } // fachada real: lugares.js
  if (s.poly) {
    if (s.kind === 'canopy') {
      const g = new THREE.ExtrudeGeometry(shapeOf(s.poly), { depth: 0.6, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, s.h, 0);
      mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
      const pil = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial({ color: '#dcdcdc' }), 4);
      corners({ ...b, w: b.w * 0.7, d: b.d * 0.6 }).forEach((c, i) => setInst(pil, i, c[0], 0, c[1], 0, 0.5, s.h, 0.5)); scene.add(pil);
      for (const c of corners({ ...b, w: b.w * 0.7, d: b.d * 0.6 })) addObstacle({ x: c[0], z: c[1], w: 0.6, d: 0.6, ex: [1, 0], nx: [0, 1] });
    } else {
      const g = new THREE.ExtrudeGeometry(shapeOf(s.poly), { depth: s.h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0.18, 0);
      mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: s.color }));
      addObstacle({ ...b, w: b.w * 0.92, d: b.d * 0.92 });
    }
  } else {
    const tex = facadeTex(s.kind === 'school' ? 'apt' : 'shop', Math.max(1, Math.round(s.h / 3.5)));
    const wm = new THREE.MeshLambertMaterial({ map: tex, color: s.color }), tm = new THREE.MeshLambertMaterial({ color: '#a39e95' });
    mesh = new THREE.Mesh(unitBox, [wm, wm, tm, tm, wm, wm]);
    mesh.position.set(b.x, 0.18, b.z); mesh.scale.set(b.w, s.h, b.d); mesh.rotation.y = yawOf(b.ex);
    addObstacle(b);
    if (s.kind === 'place_of_worship') { // torre da igreja
      const tw = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: '#f8f4ea' }));
      tw.position.set(b.x - b.ex[0] * b.w * 0.42, 0.18, b.z - b.ex[1] * b.w * 0.42); tw.scale.set(4, 22, 4); tw.rotation.y = yawOf(b.ex); tw.castShadow = true; scene.add(tw);
      const cr = new THREE.Mesh(new THREE.ConeGeometry(2.9, 5, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: '#7d4a36' }));
      cr.position.set(tw.position.x, 22.18 + 2.5, tw.position.z); cr.rotation.y = yawOf(b.ex); scene.add(cr);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1, 1, 3, 1).rotateX(Math.PI / 2).rotateY(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#8f4428' }));
    }
  }
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
}
buildLugares(LCTX, 'pracas');
{ // as trilhas do OSM dentro do campo/praça da Maçonaria foram substituídas pelo desenho real
  const grow = (Q, k) => { const c = centroid(Q); return Q.map(([x, z]) => [c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k]); };
  for (const P of [grow([[-160, 209], [-110, 242], [-142, 290], [-191, 258]], 1.15), grow([[-76, 333], [-126, 300], [-95, 252], [-45, 285]], 1.15)])
    for (let i = allRoads.length - 1; i >= 0; i--) { const r = allRoads[i]; if (r.foot && r.p.every(p => inside(p, P))) allRoads.splice(i, 1); }
}

// pisos: praças, matas, quadras, calçadas
for (const [geos, mat] of [[sideGeos, VC], [plazaGeos, VC], [woodGeos, VC], [pitchGeos, VC], [poolGeos, VC], [parkingGeos, VC]]) {
  if (!geos.length) continue; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.receiveShadow = true; scene.add(m);
}

// ---------------------------------------------------------------- ruas
setStatus('Asfaltando as ruas…'); await pause();
{
  const asph = [], foot = [], marks = [], bridgeDeck = [];
  const ribbon = (pts, w, y, out) => {
    const pos = [];
    const P = pts.map(p => new THREE.Vector2(p[0], p[1]));
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], d = b.clone().sub(a); const L = d.length(); if (L < 0.01) continue; d.divideScalar(L);
      const n = new THREE.Vector2(-d.y, d.x).multiplyScalar(w / 2);
      const a1 = a.clone().add(n), a2 = a.clone().sub(n), b1 = b.clone().add(n), b2 = b.clone().sub(n);
      pos.push(a1.x, y, a1.y, b1.x, y, b1.y, a2.x, y, a2.y, a2.x, y, a2.y, b1.x, y, b1.y, b2.x, y, b2.y);
    }
    // discos nas junções
    for (const p of P) { const s = 10; for (let k = 0; k < s; k++) { const t0 = k / s * Math.PI * 2, t1 = (k + 1) / s * Math.PI * 2; pos.push(p.x, y, p.y, p.x + Math.cos(t1) * w / 2, y, p.y + Math.sin(t1) * w / 2, p.x + Math.cos(t0) * w / 2, y, p.y + Math.sin(t0) * w / 2); } }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    // garante normais para cima
    const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    out.push(g);
  };
  const dashes = (pts, y, color, w = 0.18, on = 3, off = 4) => {
    let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.1) continue;
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      for (let s = (on + off) - (acc % (on + off)); s < L; s += on + off) {
        if (s < 5 && i === 0) continue; if (L - s < 5 && i === pts.length - 2) continue;
        const e = Math.min(s + on, L); ribbonSeg([a[0] + d[0] * s, a[1] + d[1] * s], [a[0] + d[0] * e, a[1] + d[1] * e], w, y, color);
      }
      acc += L;
    }
  };
  const markPos = [], markCol = [];
  function ribbonSeg(a, b, w, y, color) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = [-(b[1] - a[1]) / L * w / 2, (b[0] - a[0]) / L * w / 2];
    const c = new THREE.Color(color);
    markPos.push(a[0] + n[0], y, a[1] + n[1], b[0] + n[0], y, b[1] + n[1], a[0] - n[0], y, a[1] - n[1], a[0] - n[0], y, a[1] - n[1], b[0] + n[0], y, b[1] + n[1], b[0] - n[0], y, b[1] - n[1]);
    for (let i = 0; i < 6; i++) markCol.push(c.r, c.g, c.b);
  }
  for (const r of allRoads) {
    if (r.foot) { ribbon(r.p, r.w, 0.2, foot); continue; }
    ribbon(r.p, r.w, r.t.bridge ? 0.6 : 0.05 + (r.w / 1000), asph);
    if (r.t.bridge) { bridgeDeck.push(r); for (let i = 0; i + 1 < r.p.length; i++) fillSeg(r.p[i], r.p[i + 1], r.w, 1); }
    else for (let i = 0; i + 1 < r.p.length; i++) fillSeg(r.p[i], r.p[i + 1], r.w * 0.9, 1);
    if (r.w >= 8) dashes(r.p, (r.t.bridge ? 0.62 : 0.075), r.t.oneway === 'yes' ? '#f2f2f2' : '#f2c230');
  }
  const asphM = new THREE.Mesh(mergeGeometries(asph), new THREE.MeshLambertMaterial({ color: '#4a4c50' })); asphM.receiveShadow = true; scene.add(asphM);
  if (foot.length) { const fm = new THREE.Mesh(mergeGeometries(foot), new THREE.MeshLambertMaterial({ color: '#b8ab92' })); fm.receiveShadow = true; scene.add(fm); }
  if (markPos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(markPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(markCol, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(markPos.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }))); }
  // pontes: laje, guarda-corpo e pilares
  const deckM = new THREE.MeshLambertMaterial({ color: '#9d9a93' }), blueRail = new THREE.MeshLambertMaterial({ color: '#2f5fa8' });
  for (const r of bridgeDeck) for (let i = 0; i + 1 < r.p.length; i++) {
    const a = r.p[i], b = r.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-e[1], e[0]], cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, yaw = yawOf(e);
    const slab = new THREE.Mesh(unitBox, deckM); slab.position.set(cx, -0.4, cz); slab.scale.set(L + 0.5, 1, r.w + 1.2); slab.rotation.y = yaw; scene.add(slab);
    for (const s of [-1, 1]) {
      // mureta de concreto + guarda-corpo de tubo azul (como na ponte real)
      const rail = new THREE.Mesh(unitBox, deckM); rail.position.set(cx + n[0] * s * (r.w / 2 + 0.35), 0.6, cz + n[1] * s * (r.w / 2 + 0.35)); rail.scale.set(L + 0.2, 0.35, 0.3); rail.rotation.y = yaw; scene.add(rail);
      for (const hh of [1.05, 1.55]) { const tube = new THREE.Mesh(unitBox, blueRail); tube.position.set(rail.position.x, 0.6 + hh, rail.position.z); tube.scale.set(L + 0.2, 0.09, 0.09); tube.rotation.y = yaw; scene.add(tube); }
      for (let q = 0; q < L; q += 2.5) { const post = new THREE.Mesh(unitBox, blueRail); post.position.set(a[0] + e[0] * q + n[0] * s * (r.w / 2 + 0.35), 0.95, a[1] + e[1] * q + n[1] * s * (r.w / 2 + 0.35)); post.scale.set(0.09, 0.7, 0.09); scene.add(post); }
      if (gridAt(cx + n[0] * s * (r.w / 2 + 2), cz + n[1] * s * (r.w / 2 + 2)) === 0) addObstacle({ x: cx + n[0] * s * (r.w / 2 + 0.35), z: cz + n[1] * s * (r.w / 2 + 0.35), w: L + 0.2, d: 0.4, ex: e, nx: n });
    }
    for (let s = 0; s < L; s += 25) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 10), deckM); pl.position.set(a[0] + e[0] * s, -3.5, a[1] + e[1] * s); scene.add(pl); }
  }
  // postes de luz
  const lamps = [];
  for (const r of allRoads) {
    if (r.foot || r.t.bridge) continue;
    let acc = 17;
    for (let i = 0; i + 1 < r.p.length; i++) {
      const a = r.p[i], b = r.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.1) continue; const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-e[1], e[0]];
      while (acc < L) { const x = a[0] + e[0] * acc + n[0] * (r.w / 2 + 1.2), z = a[1] + e[1] * acc + n[1] * (r.w / 2 + 1.2); if (isLand(x, z)) lamps.push([x, z, Math.atan2(-n[1], n[0])]); acc += 34; }
      acc -= L;
    }
  }
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 8, 6).translate(0, 4, 0), new THREE.MeshLambertMaterial({ color: '#8a8d90' }), lamps.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.12, 0.12).translate(-1.0, 7.9, 0), new THREE.MeshLambertMaterial({ color: '#8a8d90' }), lamps.length);
  const bulb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.35).translate(-2.0, 7.8, 0), new THREE.MeshLambertMaterial({ color: '#fff7d6', emissive: '#665c33' }), lamps.length);
  lamps.forEach((l, i) => { setInst(pole, i, l[0], 0.18, l[1], 0, 1, 1, 1); setInst(arm, i, l[0], 0.18, l[1], l[2], 1, 1, 1); setInst(bulb, i, l[0], 0.18, l[1], l[2], 1, 1, 1); addObstacle({ x: l[0], z: l[1], w: 0.35, d: 0.35, ex: [1, 0], nx: [0, 1] }); });
  scene.add(pole, arm, bulb);
}

// ---------------------------------------------------------------- árvores e bancos
setStatus('Plantando as árvores…'); await pause();
{
  // sem árvores dentro dos estabelecimentos
  const inRoom = p => enterables.some(en => { const dx = p[0] - en.cx, dz = p[1] - en.cz, c = Math.cos(en.th), s = Math.sin(en.th); return Math.abs(c * dx - s * dz) < en.W / 2 + 1.5 && Math.abs(s * dx + c * dz) < en.D / 2 + 1.5; });
  const all = [...W.trees, ...yardTrees].filter(p => !inRoom(p));
  const r = rng(99);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#6b4f36' }), all.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial(), all.length);
  const greens = ['#3f7a35', '#4c8a3c', '#5a9443', '#356b2f', '#6a9a4a', '#2f5f2b'];
  all.forEach((p, i) => {
    const s = 0.8 + r() * 0.9, th = 2.4 * s + r(); const y = groundY(p[0], p[1]);
    setInst(trunk, i, p[0], y, p[1], 0, s, th, s);
    // ipês floridos (o roxo e o amarelo são comuns em Valadares)
    const c = r() < 0.04 ? pick(r, ['#c45ab3', '#e8c02a', '#e58fb9']) : pick(r, greens);
    setInst(crown, i, p[0], y + th + 1.4 * s, p[1], r() * 6, 2.2 * s, 1.7 * s, 2.2 * s, c);
    addObstacle({ x: p[0], z: p[1], w: 0.5, d: 0.5, ex: [1, 0], nx: [0, 1] });
  });
  trunk.castShadow = crown.castShadow = true; scene.add(trunk, crown);
  // bancos nas praças
  const benches = [];
  for (const bl of W.blocks) if (bl.kind === 'park') { const P = clean(bl.p), I = inset(P, 3); for (let i = 0; i < I.length; i++) { const a = I[i], b = I[(i + 1) % I.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 6; s < L - 4; s += 14) benches.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L, Math.atan2(-(b[1] - a[1]), b[0] - a[0])]); } }
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.5, 0.6).translate(0, 0.25, 0), new THREE.MeshLambertMaterial({ color: '#8a6a4a' }), benches.length);
  benches.forEach((b, i) => setInst(bm, i, b[0], 0.18, b[1], b[2], 1, 1, 1)); scene.add(bm);
}

// rótulos flutuantes dos lugares conhecidos
const labels = [];
for (const l of landmarks) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '700 40px system-ui, sans-serif';
  const w = Math.ceil(g.measureText(l.name).width) + 40; c.width = w; c.height = 64; g.font = '700 40px system-ui, sans-serif';
  g.fillStyle = 'rgba(15,18,24,.78)'; g.beginPath(); g.roundRect(0, 0, w, 64, 16); g.fill(); g.fillStyle = '#ffd34d'; g.textBaseline = 'middle'; g.fillText(l.name, 20, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(w / 64 * 1.6, 1.6, 1); s.position.set(l.x, l.h, l.z); s.renderOrder = 10; scene.add(s); labels.push(s);
}

// ---------------------------------------------------------------- personagens (instanciados)
function makePeople(n) {
  const parts = {
    torso: new THREE.BoxGeometry(0.5, 0.62, 0.28).translate(0, 1.22, 0),
    head: new THREE.BoxGeometry(0.3, 0.32, 0.3).translate(0, 1.72, 0),
    legL: new THREE.BoxGeometry(0.2, 0.86, 0.22).translate(0, -0.43, 0), legR: null,
    armL: new THREE.BoxGeometry(0.15, 0.62, 0.17).translate(0, -0.31, 0), armR: null,
    hair: new THREE.BoxGeometry(0.32, 0.12, 0.32).translate(0, 1.92, 0),
  };
  parts.legR = parts.legL; parts.armR = parts.armL;
  const M = {}; for (const k of Object.keys(parts)) { M[k] = new THREE.InstancedMesh(parts[k], new THREE.MeshLambertMaterial(), n); M[k].castShadow = true; M[k].frustumCulled = false; scene.add(M[k]); }
  return M;
}
const SKIN = ['#f1c9a5', '#d9a47a', '#b97d55', '#8d5a3b', '#6b4029', '#e7b48f'];
const SHIRT = ['#e74c3c', '#2e86de', '#27ae60', '#f1c40f', '#ffffff', '#222222', '#8e44ad', '#e67e22', '#16a085', '#f78fb3', '#34495e', '#c0392b'];
const PANTS = ['#2c3e50', '#1f2a44', '#3d3d3d', '#6b5b4b', '#1a1a1a', '#4a6fa5', '#c9b38f'];
const HAIR = ['#1b1b1b', '#3a2a1c', '#5b3b22', '#2b2b2b', '#c9a35a', '#7a7a7a'];
const pm4 = new THREE.Matrix4(), pq = new THREE.Quaternion(), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), pe = new THREE.Euler();
function poseMan(M, i, x, y, z, yaw, phase, amp, look, lie = 0, pose = null) {
  // corpo base
  const base = new THREE.Matrix4().compose(pv.set(x, y, z), pq.setFromEuler(pe.set(lie, yaw, 0, 'YXZ')), one);
  M.torso.setMatrixAt(i, base); M.head.setMatrixAt(i, base); M.hair.setMatrixAt(i, base);
  const sw = Math.sin(phase) * amp;
  const limb = (mesh, ox, oy, rot, rz = 0) => { pm4.compose(pv.set(ox, oy, 0), pq.setFromEuler(pe.set(rot, 0, rz)), one); mesh.setMatrixAt(i, pm4.premultiply(base)); };
  limb(M.legL, -0.13, 0.9, sw); limb(M.legR, 0.13, 0.9, -sw);
  // braços: mirando (1 = só o direito, 2 = as duas mãos), algemado (mãos para trás) ou balançando
  const up = -Math.PI / 2 - (pose?.pitch || 0);
  if (pose?.up) { limb(M.armL, -0.34, 1.5, Math.PI, 0.15); limb(M.armR, 0.34, 1.5, Math.PI, -0.15); }
  else if (pose?.cuff) { limb(M.armL, -0.3, 1.5, 0.55, -0.25); limb(M.armR, 0.3, 1.5, 0.55, 0.25); }
  else if (pose?.aim === 2) { limb(M.armL, -0.3, 1.5, up, -0.55); limb(M.armR, 0.34, 1.5, up); }
  else if (pose?.aim === 1) { limb(M.armL, -0.34, 1.5, -sw * 0.5); limb(M.armR, 0.34, 1.5, up); }
  else { limb(M.armL, -0.34, 1.5, -sw * 0.8); limb(M.armR, 0.34, 1.5, sw * 0.8); }
  if (look) { const c = look; M.torso.setColorAt(i, tmpC.set(c.shirt)); M.armL.setColorAt(i, tmpC.set(c.skin)); M.armR.setColorAt(i, tmpC.set(c.skin)); M.head.setColorAt(i, tmpC.set(c.skin)); M.legL.setColorAt(i, tmpC.set(c.pants)); M.legR.setColorAt(i, tmpC.set(c.pants)); M.hair.setColorAt(i, tmpC.set(c.hair)); }
}
function flushPeople(M) { for (const k in M) { M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; } }

// pedestres andando nas calçadas
const walkLoops = [];
for (const bl of W.blocks) if (bl.kind === 'res' || bl.kind === 'shop' || bl.kind === 'apt' || bl.kind === 'park') { const p = clean(bl.p); if (p.length > 2 && Math.abs(area(p)) > 400) { const L = inset(p, 1.1); let len = 0; const segs = []; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, s: len }); len += l; } walkLoops.push({ segs, len }); } }
const NPED = 200, peds = [], pr = rng(5);
const PM = makePeople(NPED + 1); // último = jogador
for (let i = 0; i < NPED; i++) {
  const loop = walkLoops[Math.floor(pr() * walkLoops.length)];
  peds.push({ loop, s: pr() * loop.len, dir: pr() < 0.5 ? 1 : -1, v: 1.0 + pr() * 0.7, phase: pr() * 6, off: [0, 0], look: { skin: pick(pr, SKIN), shirt: pick(pr, SHIRT), pants: pick(pr, PANTS), hair: pick(pr, HAIR) }, x: 0, z: 0, yaw: 0, idle: 0 });
}
const PLAYER_LOOK = { skin: '#c68a5e', shirt: '#ffcc33', pants: '#1f2a44', hair: '#1b1b1b' };
function loopPos(loop, s) { s = ((s % loop.len) + loop.len) % loop.len; for (const g of loop.segs) if (s <= g.s + g.l) { const t = (s - g.s) / g.l; return [lerp(g.a[0], g.b[0], t), lerp(g.a[1], g.b[1], t), Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1])]; } const g = loop.segs[0]; return [g.a[0], g.a[1], 0]; }

// ---------------------------------------------------------------- carros
setStatus('Estacionando os carros…'); await pause();
const CAR_COLORS = ['#f4f4f4', '#f4f4f4', '#c0c4c8', '#c0c4c8', '#1d1d1f', '#2a2d33', '#8f1d1d', '#1f3a66', '#6b6f75', '#e3e1d8', '#9a7b4f', '#245c3a'];
const MAXCARS = 140;
const CM = {
  body: new THREE.InstancedMesh(new THREE.BoxGeometry(4.3, 0.85, 1.86).translate(0, 0.72, 0), new THREE.MeshLambertMaterial(), MAXCARS),
  cabin: new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.68, 1.7).translate(-0.25, 1.48, 0), new THREE.MeshLambertMaterial(), MAXCARS),
  glass: new THREE.InstancedMesh(new THREE.BoxGeometry(2.36, 0.48, 1.74).translate(-0.25, 1.46, 0), new THREE.MeshPhongMaterial({ color: '#1e2a33', shininess: 90 }), MAXCARS),
  wheel: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#141414' }), MAXCARS * 4),
  head: new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.16, 0.36), new THREE.MeshBasicMaterial({ color: '#fffbe8' }), MAXCARS * 2),
  tail: new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.16, 0.36), new THREE.MeshBasicMaterial({ color: '#c0101a' }), MAXCARS * 2),
};
for (const k in CM) { CM[k].castShadow = k === 'body' || k === 'cabin'; CM[k].frustumCulled = false; scene.add(CM[k]); }
const WHEELS = [[1.35, 0.36, 0.86], [1.35, 0.36, -0.86], [-1.35, 0.36, 0.86], [-1.35, 0.36, -0.86]];
const cars = [];
const cm4 = new THREE.Matrix4(), cq = new THREE.Quaternion();
function drawCar(c, i) {
  const base = new THREE.Matrix4().compose(pv.set(c.x, c.y, c.z), cq.setFromAxisAngle(UP, -c.h), one);
  CM.body.setMatrixAt(i, base); CM.cabin.setMatrixAt(i, base); CM.glass.setMatrixAt(i, base);
  if (c.dirty) { CM.body.setColorAt(i, tmpC.set(c.color)); CM.cabin.setColorAt(i, tmpC.set(c.color)); c.dirty = false; }
  WHEELS.forEach((w, k) => { cm4.makeTranslation(w[0], w[1], w[2]); if (k < 2) cm4.multiply(new THREE.Matrix4().makeRotationY(c.steer || 0)); CM.wheel.setMatrixAt(i * 4 + k, cm4.premultiply(base)); });
  for (const s of [0, 1]) { cm4.makeTranslation(2.16, 0.82, s ? 0.6 : -0.6); CM.head.setMatrixAt(i * 2 + s, cm4.premultiply(base)); cm4.makeTranslation(-2.16, 0.86, s ? 0.62 : -0.62); CM.tail.setMatrixAt(i * 2 + s, cm4.premultiply(base)); }
}
// grafo viário para o trânsito
const nodes = new Map();
const nkey = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
const CAR_ROAD = r => !r.foot && !['track', 'services'].includes(r.t.highway);
for (const r of allRoads) if (CAR_ROAD(r)) {
  for (let i = 0; i + 1 < r.p.length; i++) {
    const A = nkey(r.p[i]), Bk = nkey(r.p[i + 1]);
    if (!nodes.has(A)) nodes.set(A, { x: r.p[i][0], z: r.p[i][1], adj: [] }); if (!nodes.has(Bk)) nodes.set(Bk, { x: r.p[i + 1][0], z: r.p[i + 1][1], adj: [] });
    const na = nodes.get(A), nb = nodes.get(Bk); if (na === nb) continue;
    const one = r.t.oneway === 'yes';
    na.adj.push({ n: nb, r, one }); if (!one) nb.adj.push({ n: na, r, one });
  }
}
const nodeList = [...nodes.values()].filter(n => n.adj.length);
// carros estacionados
{
  const r = rng(11); let tries = 0;
  const res = allRoads.filter(x => !x.foot && ['residential', 'tertiary', 'living_street', 'unclassified'].includes(x.t.highway) && !x.t.bridge);
  while (cars.length < 80 && tries++ < 3000) {
    const rd = pick(r, res); const i = Math.floor(r() * (rd.p.length - 1)); const a = rd.p[i], b = rd.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 14) continue;
    const t = 5 + r() * (L - 10), e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-e[1], e[0]], s = r() < 0.5 ? 1 : -1;
    const x = a[0] + e[0] * t + n[0] * s * (rd.w / 2 - 1.15), z = a[1] + e[1] * t + n[1] * s * (rd.w / 2 - 1.15);
    if (!isLand(x, z) || cars.some(c => Math.hypot(c.x - x, c.z - z) < 6) || pushOut(x, z, 1.2).hit) continue;
    cars.push({ x, z, y: 0.04, h: Math.atan2(e[1], e[0]) + (s < 0 ? 0 : Math.PI), speed: 0, color: pick(r, CAR_COLORS), mode: 'parked', dirty: true, steer: 0 });
  }
  // trânsito
  const islNodes = nodeList.filter(n => inside([n.x, n.z], island));
  for (let k = 0; k < 45; k++) {
    const a = k < 32 ? pick(r, islNodes) : pick(r, nodeList), ed = pick(r, a.adj);
    cars.push({ x: a.x, z: a.z, y: 0.04, h: 0, speed: 0, color: pick(r, CAR_COLORS), mode: 'npc', dirty: true, a, ed, t: r() * 5, vmax: 8 + r() * 5, steer: 0 });
  }
}

// ---------------------------------------------------------------- mapa (mini e grande)
const MAPS = 0.5, MW = Math.round(2600 * MAPS), MH = Math.round(2600 * MAPS), MOX = -1300, MOZ = -1300; // px por metro
const mapCanvas = document.createElement('canvas'); mapCanvas.width = MW; mapCanvas.height = MH;
{
  const g = mapCanvas.getContext('2d'); const T = p => [(p[0] - MOX) * MAPS, (p[1] - MOZ) * MAPS];
  const poly = (P, fill) => { g.beginPath(); P.forEach((p, i) => { const [x, y] = T(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fillStyle = fill; g.fill(); };
  g.fillStyle = '#4f7486'; g.fillRect(0, 0, MW, MH);
  { const id = g.getImageData(0, 0, MW, MH); for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const wx = MOX + x / MAPS, wz = MOZ + y / MAPS; const c = Math.floor((wx - B.x0) / B.cell), r = Math.floor((wz - B.z0) / B.cell); if (mainMask[r * B.nx + c]) { const o = (y * MW + x) * 4; id.data[o] = 126; id.data[o + 1] = 154; id.data[o + 2] = 94; } } g.putImageData(id, 0, 0); }
  poly(island, '#86a862'); for (const it of W.islets) poly(clean(it.p), '#5f8a45');
  for (const bl of W.blocks) poly(clean(bl.p), bl.kind === 'park' ? '#9cc277' : bl.kind === 'wood' ? '#4d7a3a' : bl.kind === 'shop' ? '#e3c9b8' : '#d9d3c4');
  for (const m of W.mainland) if (m.k === 'block') poly(clean(m.p), '#cfc8b8');
  g.lineCap = g.lineJoin = 'round';
  for (const r of allRoads) { g.beginPath(); r.p.forEach((p, i) => { const [x, y] = T(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = r.foot ? '#b8a989' : '#55585d'; g.lineWidth = Math.max(1.2, r.w * MAPS); g.stroke(); }
}
// ---------------------------------------------------------------- marcador de destino + rota (GPS)
let wp = null, route = null, routeT = 0, wpMsgT = 0;
const NB = new Map();
for (const n of nodeList) { if (!NB.has(n)) NB.set(n, new Set()); for (const e of n.adj) { NB.get(n).add(e.n); if (!NB.has(e.n)) NB.set(e.n, new Set()); NB.get(e.n).add(n); } }
function nearNode(x, z) { let best = null, bd = 1e9; for (const n of NB.keys()) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
function findRoute(x0, z0, x1, z1) { // A* no grafo das ruas (sem considerar mão única)
  const a = nearNode(x0, z0), b = nearNode(x1, z1); if (!a || !b) return null;
  const g = new Map([[a, 0]]), prev = new Map(), H = [[0, a]];
  const push = it => { H.push(it); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  while (H.length) {
    const [, n] = pop(); if (n === b) break; const gn = g.get(n);
    for (const m of NB.get(n)) { const nd = gn + Math.hypot(m.x - n.x, m.z - n.z); if (nd < (g.get(m) ?? 1e12)) { g.set(m, nd); prev.set(m, n); push([nd + Math.hypot(b.x - m.x, b.z - m.z), m]); } }
  }
  if (a !== b && !prev.has(b)) return null;
  const pts = [[x1, z1]]; for (let n = b; n; n = prev.get(n)) pts.push([n.x, n.z]); pts.push([x0, z0]); return pts.reverse();
}
const beacon = new THREE.Group();
{
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xc64bff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  col.position.y = 30; beacon.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 32), new THREE.MeshBasicMaterial({ color: 0xc64bff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; beacon.add(ring);
  beacon.visible = false; scene.add(beacon);
}
function setWaypoint(x, z) {
  if (x == null) { wp = null; route = null; beacon.visible = false; return; }
  const nr = nearestRoad(x, z, 60, r => !r.foot); if (nr) { const s = nr.seg, ax = s.b[0] - s.a[0], az = s.b[1] - s.a[1], L2 = ax * ax + az * az || 1, t = clamp(((x - s.a[0]) * ax + (z - s.a[1]) * az) / L2, 0, 1); if (!isLand(x, z) || Math.hypot(s.a[0] + ax * t - x, s.a[1] + az * t - z) > 30) { x = s.a[0] + ax * t; z = s.a[1] + az * t; } }
  if (!isLand(x, z)) { const n = nearNode(x, z); if (n) { x = n.x; z = n.z; } }
  wp = { x, z }; beacon.position.set(x, groundY(x, z), z); beacon.visible = true; routeT = 0;
}
function updateWaypoint(dt) {
  if (!wp) return;
  const d = Math.hypot(wp.x - player.x, wp.z - player.z);
  if (d < 10) { setWaypoint(null); wpMsgT = 3; return; }
  if ((routeT -= dt) < 0) { routeT = 0.8; route = findRoute(player.x, player.z, wp.x, wp.z); }
  beacon.children[0].material.opacity = 0.22 + 0.12 * Math.sin(performance.now() / 300);
}
function routeLen() { if (!route) return wp ? Math.hypot(wp.x - player.x, wp.z - player.z) : 0; let L = 0; for (let i = 1; i < route.length; i++) L += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); return L; }
function teleport(x, z) {
  let nr = nearestRoad(x, z, 120, r => !r.foot);
  if (!nr) { const n = nearNode(x, z); if (n) { x = n.x; z = n.z; nr = nearestRoad(x, z, 120, r => !r.foot); } } if (nr) { const s = nr.seg; x = (s.a[0] + s.b[0]) / 2; z = (s.a[1] + s.b[1]) / 2; const ax = s.b[0] - s.a[0], az = s.b[1] - s.a[1], L = Math.hypot(ax, az) || 1; // ponto da rua mais perto do destino
    const t = clamp(((wp ? wp.x : x) - s.a[0]) * ax / L / L + ((wp ? wp.z : z) - s.a[1]) * az / L / L, 0, 1); x = s.a[0] + ax * t; z = s.a[1] + az * t;
    if (player.inCar) { player.inCar.h = Math.atan2(az, ax); player.inCar.speed = 0; } else { x -= az / L * (s.r.w / 2 + 1.2); z += ax / L * (s.r.w / 2 + 1.2); } }
  if (player.inCar) { player.inCar.x = x; player.inCar.z = z; }
  player.x = x; player.z = z; player.vx = player.vz = player.vy = 0; player.y = groundY(x, z) + 0.2;
  camTarget.set(x, 1.6, z); routeT = 0;
}

let miniZ = 1.1;
const mini = $('mini'), mg = mini.getContext('2d');
function drawMini(px, pz, heading) {
  const S = mini.width, R = miniZ, k = MAPS * R; // zoom
  mg.save(); mg.clearRect(0, 0, S, S); mg.beginPath(); mg.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); mg.clip();
  mg.fillStyle = '#4f7486'; mg.fillRect(0, 0, S, S);
  const sx = (px - MOX) * MAPS - S / 2 / R, sy = (pz - MOZ) * MAPS - S / 2 / R;
  mg.imageSmoothingEnabled = R < 2;
  mg.drawImage(mapCanvas, sx, sy, S / R, S / R, 0, 0, S, S);
  const M = (x, z) => [(x - px) * k + S / 2, (z - pz) * k + S / 2];
  if (wp) {
    if (route) { mg.beginPath(); route.forEach((p, i) => { const [x, y] = M(p[0], p[1]); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.strokeStyle = '#c64bff'; mg.lineWidth = 4; mg.lineCap = mg.lineJoin = 'round'; mg.stroke(); }
    let [x, y] = M(wp.x, wp.z); const dx = x - S / 2, dy = y - S / 2, dd = Math.hypot(dx, dy), lim = S / 2 - 9; if (dd > lim) { x = S / 2 + dx / dd * lim; y = S / 2 + dy / dd * lim; }
    mg.fillStyle = '#c64bff'; mg.strokeStyle = '#fff'; mg.lineWidth = 2; mg.beginPath(); mg.arc(x, y, 6, 0, 7); mg.fill(); mg.stroke();
  }
  mg.translate(S / 2, S / 2); mg.rotate(heading + Math.PI / 2);
  mg.fillStyle = '#ffcc33'; mg.strokeStyle = '#111'; mg.lineWidth = 2; mg.beginPath(); mg.moveTo(0, -9); mg.lineTo(6, 7); mg.lineTo(0, 3); mg.lineTo(-6, 7); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
  mg.fillStyle = '#fff'; mg.font = '700 13px system-ui'; mg.textAlign = 'center'; mg.fillText('N', S / 2, 15);
  if (wp) { const L = routeLen(); mg.font = '700 12px system-ui'; mg.fillText(L > 950 ? (L / 1000).toFixed(1) + ' km' : Math.round(L / 10) * 10 + ' m', S / 2, S - 10); }
  else if (wpMsgT > 0) { mg.font = '700 12px system-ui'; mg.fillText('Você chegou!', S / 2, S - 10); }
}
const bigmap = $('bigmap'), bigc = $('bigcanvas');
const mv = { x: 50, z: 50, s: 0 };
function bigSize() { const w = Math.round(innerWidth * 0.94), h = Math.round(innerHeight * 0.94); if (bigc.width !== w || bigc.height !== h) { bigc.width = w; bigc.height = h; } return [w, h]; }
function fitBig() { const [w, h] = bigSize(); mv.x = 50; mv.z = 50; mv.s = Math.min(w / 1900, h / 2900); }
const s2w = (sx, sy) => [(sx - bigc.width / 2) / mv.s + mv.x, (sy - bigc.height / 2) / mv.s + mv.z];
const w2s = (x, z) => [(x - mv.x) * mv.s + bigc.width / 2, (z - mv.z) * mv.s + bigc.height / 2];
function drawBig(px, pz) {
  const [Wd, Hd] = bigSize(); if (!mv.s) fitBig(); const g = bigc.getContext('2d');
  g.fillStyle = '#4f7486'; g.fillRect(0, 0, Wd, Hd);
  g.imageSmoothingEnabled = mv.s < MAPS * 3;
  const [ax, az] = s2w(0, 0); g.drawImage(mapCanvas, (ax - MOX) * MAPS, (az - MOZ) * MAPS, Wd / mv.s * MAPS, Hd / mv.s * MAPS, 0, 0, Wd, Hd);
  if (wp && route) { g.beginPath(); route.forEach((p, i) => { const [x, y] = w2s(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = '#c64bff'; g.lineWidth = Math.max(3, 5 * mv.s); g.lineCap = g.lineJoin = 'round'; g.stroke(); }
  // nomes das ruas (zoom grande)
  if (mv.s > 1.2) { g.font = '600 11px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; const seenR = new Set();
    for (const r of allRoads) { const n = r.t.name; if (!n || r.foot || seenR.has(n)) continue; const p = r.p[Math.floor(r.p.length / 2)], q = r.p[Math.max(0, Math.floor(r.p.length / 2) - 1)]; const [x, y] = w2s((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); if (x < 0 || y < 0 || x > Wd || y > Hd) continue; seenR.add(n); g.save(); g.translate(x, y); let a = Math.atan2(p[1] - q[1], p[0] - q[0]); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; g.rotate(a); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(n, 0, 4); g.fillText(n, 0, 4); g.restore(); } }
  g.font = `600 ${mv.s > 1.2 ? 12 : 10}px system-ui`; g.textAlign = 'center';
  const seen = new Set();
  for (const l of landmarks) { if (seen.has(l.name)) continue; seen.add(l.name); const [x, y] = w2s(l.x, l.z); if (x < -50 || y < -20 || x > Wd + 50 || y > Hd + 20) continue; g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); if (mv.s > 0.45) { g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.75)'; g.strokeText(l.name, x, y - 6); g.fillStyle = '#111'; g.fillText(l.name, x, y - 6); } }
  if (wp) { const [x, y] = w2s(wp.x, wp.z); g.fillStyle = '#c64bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.arc(x, y - 16, 8, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - 16, 3, 0, 7); g.fill(); }
  const [x, y] = w2s(px, pz); g.fillStyle = '#ffcc33'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke();
  g.fillStyle = 'rgba(12,15,20,.78)'; g.fillRect(0, Hd - 30, Wd, 30); g.fillStyle = '#f3f3f3'; g.font = '600 13px system-ui'; g.textAlign = 'center';
  g.fillText((wp ? `Destino: ${Math.round(routeLen())} m · T ir direto pro marcador · ` : '') + 'Clique: marcar destino · Botão direito: tirar marcador · Roda: zoom · Arrastar: mover · Espaço: centralizar · M/Esc: fechar', Wd / 2, Hd - 10);
}
function openBig(show) {
  bigmap.style.display = show ? 'flex' : 'none';
  if (show) { if (!mv.s) fitBig(); document.exitPointerLock?.(); drawBig(player.x, player.z); }
}
{ // interação no mapa grande
  let down = null, moved = false;
  bigc.addEventListener('mousedown', e => { if (e.button === 0) { down = [e.clientX, e.clientY]; moved = false; } });
  addEventListener('mousemove', e => { if (!down || bigmap.style.display !== 'flex') return; const dx = e.clientX - down[0], dy = e.clientY - down[1]; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) { const k = bigc.width / bigc.getBoundingClientRect().width; mv.x -= dx * k / mv.s; mv.z -= dy * k / mv.s; down = [e.clientX, e.clientY]; drawBig(player.x, player.z); } });
  addEventListener('mouseup', e => {
    if (down && !moved && e.target === bigc) { const r = bigc.getBoundingClientRect(), k = bigc.width / r.width; const [x, z] = s2w((e.clientX - r.left) * k, (e.clientY - r.top) * k); setWaypoint(x, z); route = findRoute(player.x, player.z, wp.x, wp.z); drawBig(player.x, player.z); }
    down = null;
  });
  bigc.addEventListener('contextmenu', e => { e.preventDefault(); setWaypoint(null); drawBig(player.x, player.z); });
  bigmap.addEventListener('click', e => { if (e.target === bigmap) openBig(false); });
  bigc.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); const r = bigc.getBoundingClientRect(), k = bigc.width / r.width; const sx = (e.clientX - r.left) * k, sy = (e.clientY - r.top) * k; const [wx, wz] = s2w(sx, sy); mv.s = clamp(mv.s * (e.deltaY > 0 ? 0.85 : 1 / 0.85), 0.15, 8); mv.x = wx - (sx - bigc.width / 2) / mv.s; mv.z = wz - (sy - bigc.height / 2) / mv.s; drawBig(player.x, player.z); }, { passive: false });
}

// ---------------------------------------------------------------- jogador
const spawnPoi = W.pois.find(p => /Padaria/.test(p.t.name || '')) || { p: [0, 0] };
let sp = nearestRoad(spawnPoi.p[0], spawnPoi.p[1], 80, r => !r.foot);
const player = { x: spawnPoi.p[0], z: spawnPoi.p[1], y: 0.2, vy: 0, yaw: 0, phase: 0, inCar: null };
if (sp) { const s = sp.seg; player.x = (s.a[0] + s.b[0]) / 2; player.z = (s.a[1] + s.b[1]) / 2; }
{ // carro ao lado do jogador
  const s = sp && sp.seg; if (s) { const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), e = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]; cars.push({ x: player.x + e[0] * 6 - e[1] * 2, z: player.z + e[1] * 6 + e[0] * 2, y: 0.04, h: Math.atan2(e[1], e[0]), speed: 0, color: '#ffcc33', mode: 'parked', dirty: true, steer: 0 }); player.x -= e[1] * (s.r.w / 2 + 1.5); player.z += e[0] * (s.r.w / 2 + 1.5); }
}
const SPAWN = { x: player.x, z: player.z }; // onde o jogador volta depois de ser derrubado
let camYaw = 0, camPitch = 0.32, camDist = 9, lastMouse = 0, aimPitch = 0;
const keys = {};
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return; // digitando o nome ou no chat
  if (e.code === 'Enter' && $('intro').style.display === 'none') { e.preventDefault(); openChat(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyE') handleE();
  const bigOpen = bigmap.style.display === 'flex';
  if (e.code === 'KeyM') openBig(!bigOpen);
  if (e.code === 'Escape' && bigOpen) openBig(false);
  if (e.code === 'KeyT' && wp && !INT) { teleport(wp.x, wp.z); if (bigOpen) drawBig(player.x, player.z); }
  if (bigOpen && e.code === 'Space') { mv.x = player.x; mv.z = player.z; drawBig(player.x, player.z); }
  if (bigOpen && ['Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract'].includes(e.code)) { mv.s = clamp(mv.s * (/Equal|Add/.test(e.code) ? 1.25 : 0.8), 0.15, 8); drawBig(player.x, player.z); }
  else if (['Equal', 'NumpadAdd'].includes(e.code)) miniZ = clamp(miniZ * 1.3, 0.35, 5);
  else if (['Minus', 'NumpadSubtract'].includes(e.code)) miniZ = clamp(miniZ / 1.3, 0.35, 5);
  if (e.code === 'KeyG') { // gráficos leves: liga/desliga as sombras
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled; sun.castShadow = renderer.shadowMap.enabled;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
    try { localStorage.setItem('ilha_sombras', renderer.shadowMap.enabled ? '1' : '0'); } catch {}
  }
  if (e.code === 'KeyH') $('help').style.display = $('help').style.display === 'none' ? '' : 'none';
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) Promise.resolve(canvas.requestPointerLock?.()).catch(() => {}); });
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('mousedown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
  let dx = 0, dy = 0;
  if (combat && combat.busy()) return; // roda de armas / inventário / console abertos
  const aiming = combat && combat.st.aiming, scope = aiming && combat.cameraMode() === 'scope';
  if (document.pointerLockElement === canvas || aiming) { dx = e.movementX; dy = e.movementY; } else if (dragging) { dx = e.clientX - lx; dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; } else return;
  const k = scope ? 0.25 : 1; // luneta: mira mais fina
  camYaw += dx * 0.0026 * k; camPitch = clamp(camPitch + dy * 0.0022 * k, aiming ? -0.9 : -0.15, aiming ? 0.9 : 1.35); lastMouse = performance.now();
});
addEventListener('wheel', e => { if (bigmap.style.display === 'flex') return; camDist = clamp(camDist * (e.deltaY > 0 ? 1.1 : 0.9), 3.5, 60); }, { passive: true });

// ---------------------------------------------------------------- entrar / sair dos estabelecimentos
let INT = null;
function nearestEnterable(maxd) { let best = null, bd = maxd; for (const en of enterables) { const d = Math.hypot(en.x - player.x, en.z - player.z); if (d < bd) { bd = d; best = en; } } return best; }
function pushOutList(x, z, rad, list) {
  for (const b of list) {
    const hw = b.w / 2 + rad, hd = b.d / 2 + rad, dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) { const px = hw - Math.abs(dx), pz = hd - Math.abs(dz); if (px < pz) x += Math.sign(dx || 1) * px; else z += Math.sign(dz || 1) * pz; }
  }
  return { x, z };
}
// boneco do jogador para os interiores
const rig = new THREE.Group(); const rigParts = {};
{
  const m = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (k, geo, mat, x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); const me = new THREE.Mesh(geo, mat); g.add(me); rig.add(g); rigParts[k] = g; };
  add('torso', new THREE.BoxGeometry(0.5, 0.62, 0.28).translate(0, 1.22, 0), m(PLAYER_LOOK.shirt), 0, 0);
  add('head', new THREE.BoxGeometry(0.3, 0.32, 0.3).translate(0, 1.72, 0), m(PLAYER_LOOK.skin), 0, 0);
  add('hair', new THREE.BoxGeometry(0.32, 0.12, 0.32).translate(0, 1.92, 0), m(PLAYER_LOOK.hair), 0, 0);
  add('legL', new THREE.BoxGeometry(0.2, 0.86, 0.22).translate(0, -0.43, 0), m(PLAYER_LOOK.pants), -0.13, 0.9);
  add('legR', new THREE.BoxGeometry(0.2, 0.86, 0.22).translate(0, -0.43, 0), m(PLAYER_LOOK.pants), 0.13, 0.9);
  add('armL', new THREE.BoxGeometry(0.15, 0.62, 0.17).translate(0, -0.31, 0), m(PLAYER_LOOK.skin), -0.34, 1.5);
  add('armR', new THREE.BoxGeometry(0.15, 0.62, 0.17).translate(0, -0.31, 0), m(PLAYER_LOOK.skin), 0.34, 1.5);
}
function poseRig(x, y, z, yaw, phase, amp) {
  rig.position.set(x, y, z); rig.rotation.y = yaw; const s = Math.sin(phase) * amp;
  rigParts.legL.rotation.x = s; rigParts.legR.rotation.x = -s; rigParts.armL.rotation.x = -s * 0.8; rigParts.armR.rotation.x = s * 0.8;
}
const inLight = new THREE.PointLight('#ffffff', 6, 8); rig.add(inLight); inLight.position.set(0, 2.6, 0);
function enterPlace(en) {
  const R = buildInterior(en); R.scene.add(rig);
  INT = { R, en }; player.x = R.spawn.x; player.z = R.spawn.z; player.y = 0; player.vy = 0; player.yaw = R.spawn.yaw;
  camYaw = -Math.PI / 2; camPitch = 0.25; camTarget.set(player.x, 1.6, player.z);
  $('rua').textContent = en.name;
}
function leavePlace() {
  const { R, en } = INT; R.scene.remove(rig);
  R.scene.traverse(o => { if (o.geometry && o.geometry !== unitBox) o.geometry.dispose?.(); if (o.material) [].concat(o.material).forEach(mm => { mm.map?.dispose?.(); mm.dispose?.(); }); });
  INT = null; player.x = en.x + en.out[0] * 1.2; player.z = en.z + en.out[1] * 1.2; player.y = groundY(player.x, player.z);
  camYaw = Math.atan2(en.out[1], en.out[0]); camTarget.set(player.x, 1.6, player.z);
}
function handleE() { toggleCar(); } // os lugares agora são abertos: é só entrar pela porta

// interiores montados dentro dos prédios quando o jogador chega perto (e desmontados ao se afastar)
function mountInterior(en) {
  if (en.cache) { en.R = en.cache.R; en.dyn = en.cache.dyn; en.R.scene.visible = true; scene.add(en.R.scene); return; } // já montado antes: só põe de volta
  const R = buildInterior({ ...en, world: true });
  const G = R.scene; G.position.set(en.cx, en.y0, en.cz); G.rotation.y = en.th; scene.add(G); en.R = R;
  // luz interna: os materiais ganham um brilho próprio (sem luzes extras, que pesariam no mundo todo)
  G.traverse(o => { if (!o.material) return; for (const mm of [].concat(o.material)) if (mm.emissive && mm.emissive.getHex() === 0) { if (o.isInstancedMesh) { mm.emissive.set('#262626'); continue; } mm.emissive.copy(mm.color).multiplyScalar(0.38); if (mm.map && !mm.emissiveMap) mm.emissiveMap = mm.map; } });
  const ex = [Math.cos(en.th), -Math.sin(en.th)], nx = [Math.sin(en.th), Math.cos(en.th)];
  en.dyn = R.colliders.map(c => { const p = rotXZ(en.th, c.x, c.z); return { x: en.cx + p[0], z: en.cz + p[1], w: c.w, d: c.d, ex, nx }; });
  en.cache = { R, dyn: en.dyn };
}
function unmountInterior(en) { // não destrói: só esconde (remontar depois não trava)
  scene.remove(en.R.scene); en.R = null; en.dyn = null; // fora da cena: não custa nada por quadro
}
let streamT = 0, curRoom = null;
function streamInteriors(dt) {
  if ((streamT -= dt) > 0) return; streamT = 0.25;
  let changed = false, near = null, nd = 1e9;
  for (const en of enterables) {
    const d = Math.hypot(en.cx - player.x, en.cz - player.z) - Math.max(en.W, en.D) / 2;
    if (d < 22 && !en.R && d < nd) { nd = d; near = en; } else if (d > 45 && en.R) { unmountInterior(en); changed = true; }
  }
  if (near) { mountInterior(near); changed = true; } // no máximo um por vez
  if (changed) dynObs = enterables.filter(e => e.dyn).flatMap(e => e.dyn);
}
function roomOf(x, z) { // em qual interior o ponto está (coordenadas locais)
  for (const en of enterables) { if (!en.R) continue; const dx = x - en.cx, dz = z - en.cz, c = Math.cos(en.th), s = Math.sin(en.th); const lx = c * dx - s * dz, lz = s * dx + c * dz; if (Math.abs(lx) < en.W / 2 && Math.abs(lz) < en.D / 2) return { en, lx, lz }; }
  return null;
}

function toggleCar() {
  if (combat && (combat.st.dead > 0 || combat.st.cuffedBy)) return; // algemado ou derrubado não dirige
  if (player.inCar) {
    const c = player.inCar; c.mode = 'parked'; c.speed = 0;
    let px = c.x - Math.sin(c.h) * 2.2 * -1, pz = c.z - Math.cos(c.h) * 2.2; // lado esquerdo
    px = c.x + Math.sin(c.h) * 2.3; pz = c.z - Math.cos(c.h) * 2.3;
    if (!isLand(px, pz)) { px = c.x - Math.sin(c.h) * 2.3; pz = c.z + Math.cos(c.h) * 2.3; }
    player.x = px; player.z = pz; player.inCar = null; return;
  }
  let best = null, bd = 4.5; for (const c of cars) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  if (best) { if (best.mode === 'npc') { // o motorista desce
      const p = peds[Math.floor(Math.random() * peds.length)]; p.x = best.x + 2; p.z = best.z; p.free = 6; }
    best.mode = 'player'; player.inCar = best; camYaw = best.h; }
}

// ---------------------------------------------------------------- simulação
const hint = $('hint'), speedEl = $('speed'), ruaEl = $('rua');
let hud = 0, lastRoad = '—';
function updatePlayer(dt) {
  const fw = [Math.cos(camYaw), Math.sin(camYaw)], rt = [-fw[1], fw[0]];
  const cst = combat ? combat.st : null;
  if (!player.inCar && cst && cst.dead > 0) { // derrubado: deitado no chão até levantar
    player.vx = player.vz = 0; poseMan(PM, NPED, player.x, groundY(player.x, player.z) + 0.15, player.z, player.yaw, 0, 0, PLAYER_LOOK, -Math.PI / 2);
    hint.style.display = 'none'; speedEl.innerHTML = ''; return;
  }
  if (!player.inCar) {
    let mx = 0, mz = 0;
    const cuffed = cst && cst.cuffedBy, aiming = cst && cst.aiming;
    if (keys.KeyW || keys.ArrowUp) { mx += fw[0]; mz += fw[1]; } if (keys.KeyS || keys.ArrowDown) { mx -= fw[0]; mz -= fw[1]; }
    if (keys.KeyD || keys.ArrowRight) { mx += rt[0]; mz += rt[1]; } if (keys.KeyA || keys.ArrowLeft) { mx -= rt[0]; mz -= rt[1]; }
    if (cuffed && net) { const o = net.others.get(cuffed); if (o) { const dx = (o.car ? o.cx : o.x) - player.x, dz = (o.car ? o.cz : o.z) - player.z, d = Math.hypot(dx, dz); if (d > 2.2) { mx = dx; mz = dz; } else { mx = 0; mz = 0; } } } // algemado: segue quem algemou
    // movimento com aceleração, curva suave do corpo e animação proporcional à velocidade
    const l = Math.hypot(mx, mz); const run = (keys.ShiftLeft || keys.ShiftRight) && !cuffed && !aiming, sp = cuffed ? 3.0 : aiming ? 2.4 : run ? 7.2 : 3.2;
    const gy0 = groundY(player.x, player.z), air = player.y > gy0 + 0.05;
    player.vx ??= 0; player.vz ??= 0;
    const tvx = l > 0 ? mx / l * sp : 0, tvz = l > 0 ? mz / l * sp : 0, acc = air ? 3 : (l > 0 ? 12 : 16);
    player.vx += (tvx - player.vx) * Math.min(1, acc * dt); player.vz += (tvz - player.vz) * Math.min(1, acc * dt);
    const ox = player.x, oz = player.z;
    let nx = player.x + player.vx * dt, nz = player.z + player.vz * dt;
    if (!isLand(nx, nz)) { if (isLand(nx, player.z)) nz = player.z; else if (isLand(player.x, nz)) nx = player.x; else { nx = player.x; nz = player.z; } }
    const o = pushOut(nx, nz, 0.38); player.x = o.x; player.z = o.z;
    for (const c of cars) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < 2.2) { const k = (2.2 - d) / (d || 1); player.x += (player.x - c.x) * k; player.z += (player.z - c.z) * k; } }
    if (dt > 0) { player.vx = lerp(player.vx, (player.x - ox) / dt, 0.5); player.vz = lerp(player.vz, (player.z - oz) / dt, 0.5); } // perde velocidade ao bater
    const speed = Math.hypot(player.vx, player.vz);
    if (aiming) player.yaw = Math.atan2(fw[0], fw[1]); // mirando: o corpo vira para onde a câmera olha
    else if (speed > 0.3) player.yaw += angDiff(player.yaw, Math.atan2(player.vx, player.vz)) * Math.min(1, dt * (run ? 9 : 12));
    player.phase += dt * speed * 2.5;
    const gy = groundY(player.x, player.z);
    if (keys.Space && !air && player.vy <= 0) player.vy = 5.4;
    player.vy -= 15 * dt; player.y = Math.max(gy, player.y + player.vy * dt); if (player.y === gy && player.vy < 0) player.vy = 0;
    const amp = air ? 0.35 : clamp(speed / 7, 0, 1) * 0.95, bob = air ? 0 : Math.abs(Math.sin(player.phase)) * 0.05 * clamp(speed / 3, 0, 1);
    const pz = combat ? { ...combat.pose(), pitch: aimPitch } : null;
    poseMan(PM, NPED, player.x, player.y + bob, player.z, player.yaw, player.phase, amp, PLAYER_LOOK, 0, pz);
    let msg = '';
    if (cuffed) msg = 'Você está algemado';
    else if (cars.some(c => Math.hypot(c.x - player.x, c.z - player.z) < 4.5)) msg = 'Aperte E para entrar no carro';
    hint.style.display = msg ? 'block' : 'none'; hint.textContent = msg;
    speedEl.innerHTML = '';
  } else {
    const c = player.inCar;
    const thr = (keys.KeyW || keys.ArrowUp) ? 1 : 0, brk = (keys.KeyS || keys.ArrowDown) ? 1 : 0, st = ((keys.KeyA || keys.ArrowLeft) ? -1 : 0) + ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
    const hand = keys.Space;
    if (thr) c.speed += (c.speed < 0 ? 18 : 11 * (1 - c.speed / 42)) * dt;
    if (brk) c.speed -= (c.speed > 0.5 ? 20 : 7 * (1 + c.speed / 10)) * dt;
    if (!thr && !brk) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 3.5 * dt);
    if (hand) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 16 * dt);
    c.speed = clamp(c.speed, -9, 42);
    const maxSteer = 0.55 / (1 + Math.abs(c.speed) / 14);
    c.steer = lerp(c.steer, st * maxSteer, Math.min(1, dt * 6));
    c.h += c.speed / 2.7 * Math.tan(c.steer) * dt * (hand ? 1.5 : 1);
    let nx = c.x + Math.cos(c.h) * c.speed * dt, nz = c.z + Math.sin(c.h) * c.speed * dt;
    const fx = nx + Math.cos(c.h) * 2 * Math.sign(c.speed || 1), fz = nz + Math.sin(c.h) * 2 * Math.sign(c.speed || 1);
    if (!isLand(fx, fz)) { nx = c.x; nz = c.z; c.speed *= -0.25; }
    let hit = false;
    for (const off of [1.3, -1.3]) { const ox = nx + Math.cos(c.h) * off, oz = nz + Math.sin(c.h) * off; const o = pushOut(ox, oz, 1.0); if (o.hit) { hit = true; nx += o.x - ox; nz += o.z - oz; } }
    for (const o of cars) if (o !== c) { const d = Math.hypot(o.x - nx, o.z - nz); if (d < 3.4) { hit = true; const k = (3.4 - d) / (d || 1) * 0.5; nx += (nx - o.x) * k; nz += (nz - o.z) * k; if (o.mode === 'parked') { o.x -= (nx - o.x) * k * 0.6; o.z -= (nz - o.z) * k * 0.6; } } }
    if (hit) c.speed *= 0.6;
    c.x = nx; c.z = nz; c.y = groundY(c.x, c.z) > 0.1 ? 0.18 : 0.04;
    if (performance.now() - lastMouse > 1200) camYaw += angDiff(camYaw, c.speed < -1 ? c.h + Math.PI : c.h) * Math.min(1, dt * 2.5);
    player.x = c.x; player.z = c.z;
    poseMan(PM, NPED, 0, -50, 0, 0, 0, 0);
    hint.style.display = 'none';
    speedEl.innerHTML = Math.round(Math.abs(c.speed) * 3.6) + '<small>km/h · E para sair</small>';
  }
}
function updateTraffic(dt) {
  const pc = player.inCar;
  for (const c of cars) {
    if (c.mode !== 'npc') continue;
    let a = c.a, ed = c.ed, b = ed.n; let L = Math.hypot(b.x - a.x, b.z - a.z) || 0.01;
    // obstáculo à frente?
    const fx = Math.cos(c.h), fz = Math.sin(c.h); let target = c.vmax;
    const check = (ox, oz, dist) => { const dx = ox - c.x, dz = oz - c.z, f = dx * fx + dz * fz, s = Math.abs(-dx * fz + dz * fx); if (f > 0 && f < dist && s < 2.4) target = Math.min(target, Math.max(0, (f - 5.5) * 1.2)); };
    for (const o of cars) if (o !== c && Math.abs(o.x - c.x) < 14 && Math.abs(o.z - c.z) < 14) check(o.x, o.z, 13);
    if (!pc && !INT) check(player.x, player.z, 10);
    // reduz nas curvas
    if (L - c.t < 10 && ed.r.w <= 10) target = Math.min(target, 6);
    c.speed += clamp(target - c.speed, -12 * dt, 4 * dt);
    c.t += c.speed * dt;
    while (c.t >= L) {
      c.t -= L; const prev = a; a = b;
      let opts = a.adj.filter(x => x.n !== prev); if (!opts.length) opts = a.adj.length ? a.adj : [{ n: prev, r: ed.r, one: false }];
      ed = opts[Math.floor(Math.random() * opts.length)]; b = ed.n; L = Math.hypot(b.x - a.x, b.z - a.z) || 0.01; c.a = a; c.ed = ed;
    }
    const t = c.t / L, dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const off = ed.one ? 0 : Math.min(ed.r.w / 4, 2.2);
    const tx = lerp(a.x, b.x, t) - dz * off, tz = lerp(a.z, b.z, t) + dx * off;
    const desired = Math.atan2(dz, dx);
    c.h += angDiff(c.h, desired) * Math.min(1, dt * 6);
    c.x = lerp(c.x, tx, Math.min(1, dt * 8)); c.z = lerp(c.z, tz, Math.min(1, dt * 8));
    c.y = c.ed.r.t.bridge ? 0.6 : 0.04;
  }
}
// pedestres longe de tudo (que ninguém vê) vão sendo trazidos para as calçadas em volta do jogador:
// a rua fica sempre movimentada e ninguém some de perto de você
for (const L of walkLoops) { let x = 0, z = 0; for (const g of L.segs) { x += g.a[0]; z += g.a[1]; } L.c = [x / L.segs.length, z / L.segs.length]; }
let recicla = 0;
function reciclarPeds() {
  for (let k = 0; k < 4; k++) {
    const p = peds[recicla = (recicla + 1) % NPED];
    if (p.dead > 0 || p.cuffed || p.act || p.conversa || p.riding || p.panic > 0) continue;
    if (Math.hypot(p.x - player.x, p.z - player.z) < 170) continue;
    const perto = walkLoops.filter(L => { const d = Math.hypot(L.c[0] - player.x, L.c[1] - player.z); return d > 35 && d < 120; });
    if (!perto.length) continue;
    p.loop = perto[Math.floor(Math.random() * perto.length)]; p.s = Math.random() * p.loop.len; p.off = [0, 0];
    const q = loopPos(p.loop, p.s); p.x = q[0]; p.z = q[1];
  }
}
function updatePeds(dt) {
  const pc = player.inCar;
  reciclarPeds();
  for (let i = 0; i < NPED; i++) {
    const p = peds[i];
    // baleado: fica caído e depois volta a andar
    if (p.dead > 0) { p.dead -= dt; p.y = groundY(p.x, p.z); poseMan(PM, i, p.x, p.y + 0.15, p.z, p.yaw, 0, 0, p.look, -Math.PI / 2); if (p.dead <= 0) { const q = loopPos(p.loop, p.s); p.off = [p.x - q[0], p.z - q[1]]; } continue; }
    // algemado: para com as mãos para trás e segue o jogador quando ele se afasta
    if (p.cuffed) {
      const dx = player.x - p.x, dz = player.z - p.z, d = Math.hypot(dx, dz), mv = d > 2 && d < 40 && !player.inCar;
      if (mv) { const s = Math.min(d - 2, 3.4 * dt); p.x += dx / d * s; p.z += dz / d * s; p.yaw = Math.atan2(dx, dz); p.phase += dt * 9; }
      const o = pushOut(p.x, p.z, 0.3); p.x = o.x; p.z = o.z; p.y = groundY(p.x, p.z);
      poseMan(PM, i, p.x, p.y, p.z, p.yaw, p.phase, mv ? 0.6 : 0, p.look, 0, { cuff: true });
      const q = loopPos(p.loop, p.s); p.off = [p.x - q[0], p.z - q[1]]; continue;
    }
    // conversa / ordem do jogador (npc.js): mãos pra cima, deitar, seguir, parado, ouvindo
    if (p.act && !(p.panic > 0)) {
      p.act.time -= dt; const a = p.act.t;
      // refém dentro do carro: some junto com o carro e desce quando o jogador desce
      if (a === 'seguir') {
        if (player.inCar && (p.riding || Math.hypot(player.x - p.x, player.z - p.z) < 9)) { p.riding = true; p.x = player.x; p.z = player.z; poseMan(PM, i, 0, -60, 0, 0, 0, 0); continue; }
        if (p.riding && !player.inCar) { p.riding = false; p.x = player.x + 1.4; p.z = player.z + 1.0; }
      }
      const dx = player.x - p.x, dz = player.z - p.z, d = Math.hypot(dx, dz);
      if (a === 'ouvir' && d > 9) { p.act = null; continue; } // só volta a andar quando você se afasta
      if (a === 'papo' && p.act.face) { // conversando com outro pedestre: chega perto e fica virado para ele
        const f = p.act.face, fx = f.x - p.x, fz = f.z - p.z, fd = Math.hypot(fx, fz);
        if (p.act.goto && fd > 1.4) { const s = Math.min(fd - 1.4, 1.6 * dt); p.x += fx / fd * s; p.z += fz / fd * s; p.phase += dt * 5; }
        p.yaw = Math.atan2(fx, fz); const o2 = pushOut(p.x, p.z, 0.3); p.x = o2.x; p.z = o2.z; p.y = groundY(p.x, p.z);
        poseMan(PM, i, p.x, p.y, p.z, p.yaw, p.phase + Math.sin(performance.now() / 300 + i) * 0.4, p.act.goto && fd > 1.4 ? 0.5 : 0.12, p.look);
        const q = loopPos(p.loop, p.s); p.off = [p.x - q[0], p.z - q[1]]; if (p.act.time <= 0) p.act = null; continue;
      }
      if (a === 'seguir' && d > 2 && d < 40 && !player.inCar) { const s = Math.min(d - 2, (d > 5 ? 6.8 : 3.4) * dt); p.x += dx / d * s; p.z += dz / d * s; p.phase += dt * 9; }
      if (a !== 'deitar') p.yaw = Math.atan2(dx, dz);
      const o = pushOut(p.x, p.z, 0.3); p.x = o.x; p.z = o.z; p.y = groundY(p.x, p.z);
      if (a === 'deitar') poseMan(PM, i, p.x, p.y + 0.15, p.z, p.yaw, 0, 0, p.look, Math.PI / 2);
      else poseMan(PM, i, p.x, p.y, p.z, p.yaw, p.phase, a === 'seguir' && d > 2 ? 0.6 : 0, p.look, 0, a === 'maos' || (a === 'seguir' && p.act.up) ? { up: true } : null);
      const q = loopPos(p.loop, p.s); p.off = [p.x - q[0], p.z - q[1]];
      if (p.act.time <= 0) p.act = null; continue;
    }
    // em pânico (tiros por perto): corre
    if (p.panic > 0) p.panic -= dt;
    if (p.free > 0) { p.free -= dt; p.x += 3 * dt; poseMan(PM, i, p.x, groundY(p.x, p.z), p.z, Math.PI / 2, p.phase += dt * 9, 0.8, p.look); continue; }
    const run = p.panic > 0 ? 3.6 : 1; p.s += p.dir * p.v * run * dt; p.phase += dt * p.v * run * 3.2;
    const q = loopPos(p.loop, p.s);
    // desvia de carros em movimento
    for (const c of cars) { if (Math.abs(c.speed) < 1.5) continue; const dx = q[0] + p.off[0] - c.x, dz = q[1] + p.off[1] - c.z, d = Math.hypot(dx, dz); if (d < 5) { p.off[0] += dx / d * (5 - d) * dt * 4; p.off[1] += dz / d * (5 - d) * dt * 4; } }
    if (!pc && !INT) { const dx = q[0] + p.off[0] - player.x, dz = q[1] + p.off[1] - player.z, d = Math.hypot(dx, dz); if (d < 0.9) { p.off[0] += dx / (d || 1) * (0.9 - d); p.off[1] += dz / (d || 1) * (0.9 - d); } }
    p.off[0] *= 1 - Math.min(1, dt * 0.8); p.off[1] *= 1 - Math.min(1, dt * 0.8);
    p.x = q[0] + p.off[0]; p.z = q[1] + p.off[1]; p.yaw = q[2] + (p.dir < 0 ? Math.PI : 0);
    p.y = groundY(p.x, p.z); poseMan(PM, i, p.x, p.y, p.z, p.yaw, p.phase, run > 1 ? 0.95 : 0.55, p.look);
  }
  flushPeople(PM);
}

// ---------------------------------------------------------------- laço principal
const camTarget = new THREE.Vector3();
let last = performance.now();
// qualidade automática: mede o FPS de verdade e baixa/sobe a resolução para o jogo não travar
const Q = { scale: 1, acc: 0, n: 0, worst: 0, fps: 60, show: false, el: null };
function autoQuality(rawMs) {
  Q.acc += rawMs; Q.n++; Q.worst = Math.max(Q.worst, rawMs);
  if (Q.acc < 2000) return;
  Q.fps = Math.round(1000 * Q.n / Q.acc);
  // só baixa a resolução se ficar ruim por 2 medições seguidas, e nunca volta a subir sozinha
  // (subir e descer toda hora dava um tranco a cada troca)
  Q.bad = Q.fps < 35 ? (Q.bad || 0) + 1 : 0;
  if (Q.bad >= 2 && Q.scale > 0.6) { Q.scale = Math.max(0.6, Q.scale - 0.2); Q.bad = 0; renderer.setPixelRatio(Q.scale); renderer.setSize(innerWidth, innerHeight); }
  if (Q.show) Q.el.textContent = `${Q.fps} FPS · pior quadro ${Math.round(Q.worst)} ms · resolução ${Math.round(Q.scale * 100)}%`;
  Q.acc = 0; Q.n = 0; Q.worst = 0;
}
addEventListener('keydown', e => { if (e.code === 'KeyF' && e.target.tagName !== 'INPUT') { Q.show = !Q.show; if (!Q.el) { Q.el = document.createElement('div'); Q.el.className = 'hud'; Q.el.style.cssText = 'left:50%;top:12px;transform:translateX(-50%);background:rgba(12,15,20,.72);padding:4px 10px;border-radius:6px;font-size:13px'; document.body.appendChild(Q.el); } Q.el.style.display = Q.show ? '' : 'none'; Q.el.textContent = 'medindo…'; } });
const PROF = { last: null };
function frame(now) {
  const rawMs = now - last;
  const dt = Math.min(0.05, rawMs / 1000); last = now;
  if (document.visibilityState === 'visible' && rawMs > 0 && rawMs < 1000) autoQuality(rawMs);
  const T0 = performance.now(); updatePlayer(dt); const T1 = performance.now(); updateTraffic(dt); const T2 = performance.now(); updatePeds(dt); const T3 = performance.now();
  cars.forEach((c, i) => drawCar(c, i));
  for (const k in CM) { CM[k].count = k === 'wheel' ? cars.length * 4 : (k === 'head' || k === 'tail') ? cars.length * 2 : cars.length; CM[k].instanceMatrix.needsUpdate = true; if (CM[k].instanceColor) CM[k].instanceColor.needsUpdate = true; }
  // câmera
  const inCar = !!player.inCar; const ty = (inCar ? player.inCar.y + 1.6 : player.y + 1.6);
  camTarget.lerp(new THREE.Vector3(player.x, ty, player.z), inCar ? 0.35 : 0.5);
  const T4 = performance.now(); streamInteriors(dt); const T5 = performance.now();
  const room = inCar ? null : roomOf(player.x, player.z);
  const dist = inCar ? Math.max(camDist, 8) : (INT || room) ? Math.min(camDist, 4.2) : camDist;
  camera.position.set(camTarget.x - Math.cos(camYaw) * Math.cos(camPitch) * dist, camTarget.y + Math.sin(camPitch) * dist, camTarget.z - Math.sin(camYaw) * Math.cos(camPitch) * dist);
  if (camera.position.y < 0.6) camera.position.y = 0.6;
  if (INT) { const R = INT.R; camera.position.x = clamp(camera.position.x, -R.W / 2 + 0.3, R.W / 2 - 0.3); camera.position.z = clamp(camera.position.z, -R.D / 2 + 0.3, R.D / 2 - 0.3); camera.position.y = Math.min(camera.position.y, R.H - 0.3); }
  if (room) { // dentro de um estabelecimento: a câmera não atravessa as paredes nem o teto
    const en = room.en, c = Math.cos(en.th), s = Math.sin(en.th), dx = camera.position.x - en.cx, dz = camera.position.z - en.cz;
    let lx = c * dx - s * dz, lz = s * dx + c * dz; lx = clamp(lx, -en.W / 2 + 0.3, en.W / 2 - 0.3); lz = clamp(lz, -en.D / 2 + 0.3, en.D / 2 - 0.3);
    const p = rotXZ(en.th, lx, lz); camera.position.x = en.cx + p[0]; camera.position.z = en.cz + p[1];
    camera.position.y = Math.min(camera.position.y, camTarget.y + 0.9, en.y0 + en.R.H - 0.3);
  }
  const hd = Math.hypot(camera.position.x - camTarget.x, camera.position.z - camTarget.z);
  if (room && hd < 2.2) { // sala pequena: câmera vira "por cima do ombro"
    const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
    camera.position.set(camTarget.x - fx * 0.35 + fz * 0.35, camTarget.y + 0.25, camTarget.z - fz * 0.35 - fx * 0.35);
    camera.lookAt(camTarget.x + fx * 6, camTarget.y - Math.sin(camPitch) * 3, camTarget.z + fz * 6);
  } else camera.lookAt(camTarget);
  // mira: câmera por cima do ombro direito, ou luneta da AWM (primeira pessoa com zoom)
  const cmode = combat && !inCar ? combat.cameraMode() : 'normal';
  aimPitch = cmode === 'normal' ? 0 : -camPitch;
  if (cmode !== 'normal') {
    const fx = Math.cos(camYaw), fz = Math.sin(camYaw), el = -camPitch, ce = Math.cos(el), dir = new THREE.Vector3(fx * ce, Math.sin(el), fz * ce);
    if (cmode === 'scope') camera.position.set(player.x + fx * 0.45, player.y + 1.66, player.z + fz * 0.45);
    else camera.position.set(player.x - dir.x * 2.1 - fz * 1.05, player.y + 1.78 - dir.y * 2.1, player.z - dir.z * 2.1 + fx * 1.05); // boneco fica à esquerda, mira livre no centro
    camera.lookAt(camera.position.clone().add(dir));
  }
  { const fov = cmode === 'scope' ? 14 : cmode === 'aim' ? 50 : 62; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14 + (cmode === 'scope' ? 1 : 0)); camera.updateProjectionMatrix(); } }
  if (combat) combat.update(dt);
  if (npcTalk) npcTalk.update(dt);
  sun.position.set(player.x + SUN_DIR.x * 200, SUN_DIR.y * 200, player.z + SUN_DIR.z * 200); sun.target.position.set(player.x, 0, player.z);
  for (const l of labels) { const d = Math.hypot(l.position.x - player.x, l.position.z - player.z); l.visible = !room && d < 170; }
  if (INT) { drawMini(INT.en.x, INT.en.z, camYaw); renderer.render(INT.R.scene, camera); requestAnimationFrame(frame); return; }
  if ((hud -= dt) < 0) {
    hud = 0.25;
    const nr = nearestRoad(player.x, player.z, 25, r => !!r.t.name); if (nr) lastRoad = nr.seg.r.t.name;
    ruaEl.textContent = nr ? lastRoad : (inside([player.x, player.z], island) ? 'Ilha dos Araújos' : lastRoad);
    if (!inCar) { let hb = null, hd = 9; for (const b of buildings) { const d = Math.hypot(b.x - player.x, b.z - player.z) - Math.max(b.w, b.d) / 2; if (d < hd) { hd = d; hb = b; } } if (hb && hb.num) ruaEl.textContent += ', ' + hb.num; }
  }
  updateWaypoint(dt); if (wpMsgT > 0) wpMsgT -= dt;
  const T6 = performance.now(); drawMini(player.x, player.z, inCar ? player.inCar.h : camYaw); const T7 = performance.now();
  if (bigmap.style.display === 'flex' && Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) drawBig(player.x, player.z);
  if (net) net.update(dt);
  renderer.render(scene, camera); const T8 = performance.now();
  PROF.last = { player: T1 - T0, traffic: T2 - T1, peds: T3 - T2, stream: T5 - T4, misc: T6 - T5, mini: T7 - T6, render: T8 - T7 };
  requestAnimationFrame(frame);
}

setStatus(`${buildings.length} construções · ${cars.length} carros · ${NPED} pedestres` + (applied.length ? ` · ${applied.length} ajustes reais` : ''));
camYaw = 0; camTarget.set(player.x, 1.6, player.z);
// prepara todos os shaders agora (senão o jogo engasga a primeira vez que cada coisa aparece na tela)
setStatus('Preparando os gráficos…'); await pause();
{ // os interiores mais pesados já ficam prontos (escondidos) desde o início
  const pre = enterables.slice(); // todos os interiores ficam prontos já no carregamento
  for (let i = 0; i < pre.length; i++) { mountInterior(pre[i]); if (i % 8 === 7) { setStatus(`Montando os interiores… ${i + 1}/${pre.length}`); await pause(); } }
  const vis = []; scene.traverse(o => { if ((o.isMesh || o.isGroup) && !o.visible) { vis.push(o); o.visible = true; } });
  try { renderer.compile(scene, camera); } catch {}
  const texs = new Set(); scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k]); });
  for (const t of texs) try { renderer.initTexture(t); } catch {}
  // desenha tudo uma vez (sem descartar nada fora da tela) para mandar todas as formas para a placa de vídeo agora
  const culled = []; scene.traverse(o => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
  const rt = new THREE.WebGLRenderTarget(64, 64); renderer.setRenderTarget(rt); try { renderer.render(scene, camera); } catch {} renderer.setRenderTarget(null); rt.dispose();
  culled.forEach(o => o.frustumCulled = true);
  vis.forEach(o => o.visible = false); pre.forEach(unmountInterior); }
setStatus(`${buildings.length} construções · ${cars.length} carros · ${NPED} pedestres` + (applied.length ? ` · ${applied.length} ajustes reais` : ''));
const btn = $('play'); btn.disabled = false; btn.textContent = 'Jogar';
// ---------------------------------------------------------------- multiplayer e chat
const chatLog = $('chatlog'), chatIn = $('chatin');
function addChat(n, m) {
  const d = document.createElement('div');
  if (n) { const b = document.createElement('b'); b.textContent = n + ': '; d.append(b, document.createTextNode(m)); } else { const i = document.createElement('i'); i.textContent = m; d.append(i); }
  chatLog.append(d); while (chatLog.children.length > 7) chatLog.firstChild.remove();
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 12000);
}
function openChat() { if (!net) return; for (const k in keys) keys[k] = false; chatIn.style.display = 'block'; chatIn.value = ''; document.exitPointerLock?.(); chatIn.focus(); }
chatIn.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) net.chat(t); chatIn.blur(); chatIn.style.display = 'none'; }
  if (e.key === 'Escape') { chatIn.blur(); chatIn.style.display = 'none'; }
});
const nickIn = $('nick'); try { nickIn.value = localStorage.getItem('ilha_nome') || ''; } catch {}
nickIn.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
function netState() {
  const c = player.inCar, sp = Math.hypot(player.vx || 0, player.vz || 0);
  return { x: player.x, y: player.y, z: player.z, yaw: player.yaw, ph: player.phase % 6283, amp: Math.min(1, sp / 7) * 0.95, car: c ? 1 : 0, cx: c ? c.x : 0, cz: c ? c.z : 0, ch: c ? c.h : 0, cc: c ? new THREE.Color(c.color).getHexString().replace(/^/, '#') : '#888888', ...(combat ? combat.netState() : {}) };
}
combat = createCombat({ THREE, scene, camera, canvas, player, peds, pushOut, groundY, addChat, $,
  remotes: () => net ? net.others : null, send: o => net && net.send(o), pitch: () => aimPitch,
  recoil: a => { camPitch = clamp(camPitch - a, -0.9, 1.35); },
  respawn: () => { if (player.inCar) toggleCar(); player.x = SPAWN.x; player.z = SPAWN.z; player.y = groundY(SPAWN.x, SPAWN.z) + 0.2; player.vx = player.vz = player.vy = 0; camTarget.set(player.x, 1.6, player.z); },
  _x: 0, leaveCar: () => { if (player.inCar) { const c = player.inCar; c.mode = 'parked'; c.speed = 0; player.x = c.x + Math.sin(c.h) * 2.3; player.z = c.z - Math.cos(c.h) * 2.3; player.inCar = null; } } });
npcTalk = createNPC({ THREE, camera, player, peds, combat, addChat, $, landmarks, remotes: () => net ? net.others : null, rua: () => lastRoad });
btn.onclick = () => {
  $('intro').style.display = 'none'; Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
  const name = nickIn.value.trim().slice(0, 16) || 'Jogador'; try { localStorage.setItem('ilha_nome', name); } catch {}
  if (!net) net = startNet({ THREE, scene, makePeople, poseMan, flushPeople, palettes: { SKIN, SHIRT, PANTS, HAIR }, makeWeaponMesh, placeHeld, WEAPONS, WIDS, onEvent: m => combat && combat.onNet(m) }, name, netState, addChat, s => { $('online').textContent = '● ' + s; });
};
window.__game = { frame: (t) => frame(t), player, cars, buildings, W, scene, camera, toLocal, landmarks, renderer, enterables, enterPlace, leavePlace, getInt: () => INT, setWaypoint, teleport, openBig, mv, getRoute: () => route, getWp: () => wp, PROF, getCombat: () => combat, getNpc: () => npcTalk, toggleCar: () => toggleCar(), getNet: () => net, peds, setPitch: p => { camPitch = p; },
  setCam: (yaw, pitch, dist) => { camYaw = yaw; camPitch = pitch; camDist = dist; },
  snap: async (name, w = 1280, h = 720) => { // foto do jogo (para revisão)
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.render(INT ? INT.R.scene : scene, camera);
    const b = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85)); await fetch('/save?f=' + name, { method: 'POST', body: b });
    renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  } };
requestAnimationFrame(frame);
