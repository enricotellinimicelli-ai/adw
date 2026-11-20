// Interiores dos estabelecimentos.
// Sala centrada na origem; a entrada fica na parede da frente (z = +D/2) e o fundo em z = -D/2.
// Coelho Diniz e Paróquia N. S. Aparecida seguem fotos reais (Street View interno e fotos do Google Maps);
// os demais seguem o tipo de comércio.
import * as THREE from 'three';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
let WORLD = false; // true = interior montado dentro do prédio, no mundo aberto

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function signTex(text, bg, fg, w = 512, h = 128) {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); let fs = h * 0.55; g.font = `800 ${fs}px system-ui, sans-serif`; while (g.measureText(text).width > w - 24 && fs > 12) { fs -= 2; g.font = `800 ${fs}px system-ui, sans-serif`; } g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
}
const tileTex = (a, b, n) => canvasTex(128, 128, (g) => { g.fillStyle = a; g.fillRect(0, 0, 128, 128); g.strokeStyle = b; g.lineWidth = 3; for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } }, [n, n]);

class Room {
  constructor(W, D, H, o = {}) {
    this.W = W; this.D = D; this.H = H; this.colliders = [];
    if (WORLD) this.scene = new THREE.Group();
    else { this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(o.bg || '#111'); this.scene.add(new THREE.HemisphereLight(o.sky || '#ffffff', o.ground || '#55504a', o.amb ?? 1.1)); }
    const floorMat = o.floorTex ? new THREE.MeshLambertMaterial({ map: o.floorTex }) : new THREE.MeshLambertMaterial({ color: o.floor || '#888' });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat); this.scene.add(f);
    if (!o.noCeiling) { const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: o.ceiling || '#eee' })); c.position.y = H; this.scene.add(c); }
    const wm = new THREE.MeshLambertMaterial({ color: o.wall || '#ddd', side: THREE.DoubleSide });
    const wall = (x, z, w, d, h = H, mat = wm) => { const m = new THREE.Mesh(box, mat); m.position.set(x, 0, z); m.scale.set(w, h, d); this.scene.add(m); return m; };
    if (!o.noWalls) {
      wall(0, -D / 2, W, 0.2); wall(-W / 2, 0, 0.2, D); wall(W / 2, 0, 0.2, D);
      const dw = o.doorW || 2.4; // parede da frente com a porta
      wall(-(W / 2 + dw / 2) / 2, D / 2, W / 2 - dw / 2, 0.2); wall((W / 2 + dw / 2) / 2, D / 2, W / 2 - dw / 2, 0.2);
      wall(0, D / 2, dw, 0.2, H, wm).position.y = 2.6; this.scene.children[this.scene.children.length - 1].scale.y = H - 2.6;
    }
    // porta de saída (luz de fora)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(o.doorW || 2.4, 2.6).translate(0, 1.3, 0), new THREE.MeshBasicMaterial({ color: '#dff0ff' }));
    door.position.set(0, 0, D / 2 - 0.12); door.rotation.y = Math.PI; if (!WORLD) this.scene.add(door);
    const mat = new THREE.MeshBasicMaterial({ map: signTex('SAÍDA', '#1b8a3a', '#fff', 256, 96) });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), mat); s.position.set(0, 2.95, D / 2 - 0.14); s.rotation.y = Math.PI; this.scene.add(s);
    this.exit = { x: 0, z: D / 2 - 1.2 }; this.spawn = { x: 0, z: D / 2 - 2.2, yaw: Math.PI };
  }
  add(m) { this.scene.add(m); return m; }
  solid(x, z, w, d) { this.colliders.push({ x, z, w, d, ex: [1, 0], nx: [0, 1] }); }
  block(x, z, w, d, h, color, y = 0, solid = true, mat) { const m = new THREE.Mesh(box, mat || new THREE.MeshLambertMaterial({ color })); m.position.set(x, y, z); m.scale.set(w, h, d); this.scene.add(m); if (solid) this.solid(x, z, w, d); return m; }
  sign(text, x, y, z, w, bg, fg, rotY = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: signTex(text, bg, fg), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = rotY; this.scene.add(m); return m; }
  light(x, y, z, color = '#fff2dc', i = 30, dist = 30) { if (WORLD) return null; const l = new THREE.PointLight(color, i, dist, 1.6); l.position.set(x, y, z); this.scene.add(l); return l; }
  inst(geo, mat, list) { // list: [x,y,z,sx,sy,sz,color?,rotY?]
    const m = new THREE.InstancedMesh(geo, mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((v, i) => { q.setFromAxisAngle(up, v[7] || 0); M.compose(new THREE.Vector3(v[0], v[1], v[2]), q, new THREE.Vector3(v[3], v[4], v[5])); m.setMatrixAt(i, M); if (v[6]) m.setColorAt(i, c.set(v[6])); });
    this.scene.add(m); return m;
  }
  // gôndola / estante com produtos coloridos
  shelf(x, z, len, h, dep, frame, prodColors, r, rot = false, levels = 4) {
    const [w, d] = rot ? [dep, len] : [len, dep];
    this.block(x, z, w, d, h, frame);
    const items = [];
    for (let lv = 0; lv < levels; lv++) {
      const y = 0.25 + lv * (h - 0.3) / levels;
      for (const side of [-1, 1]) for (let s = -len / 2 + 0.2; s < len / 2 - 0.15; s += 0.22 + r() * 0.12) {
        const ih = 0.18 + r() * 0.22, iw = 0.16 + r() * 0.08;
        const px = rot ? x + side * (dep / 2 + 0.05) : x + s, pz = rot ? z + s : z + side * (dep / 2 + 0.05);
        items.push([px, y, pz, rot ? 0.14 : iw, ih, rot ? iw : 0.14, pick(r, prodColors)]);
      }
    }
    return items;
  }
}
const PROD = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fb8c00', '#ffffff', '#8e24aa', '#6d4c41', '#00acc1', '#f06292', '#c0ca33', '#212121'];

// ---------------------------------------------------------------- Coelho Diniz (supermercado)
function supermarket(name, r, info) {
  const W = WORLD ? info.W : 44, D = WORLD ? info.D : 34, H = 7;
  const R = new Room(W, D, H, { floor: '#b9bcbd', ceiling: '#141618', wall: '#e9e9e6', bg: '#0c0d0e', amb: 1.25, doorW: 5 });
  // teto preto com calhas de lâmpadas tubulares (foto interna)
  const strips = []; for (let x = -W / 2 + 3; x < W / 2; x += 4) for (let z = -D / 2 + 3; z < D / 2 - 1; z += 6) strips.push([x, H - 0.25, z, 0.25, 0.08, 4.5]);
  R.inst(box, new THREE.MeshBasicMaterial({ color: '#f4fbff' }), strips);
  for (let x = -W / 2 + 8; x < W / 2; x += 14) for (let z = -D / 2 + 8; z < D / 2; z += 12) R.light(x, H - 1, z, '#ffffff', 60, 26);
  // marca na entrada
  R.sign(name, 0, 4.4, D / 2 - 0.3, 9, '#f2c618', '#1f3c8c', Math.PI);
  // caixas
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 5 + i * 4.2;
    R.block(x, D / 2 - 7, 0.9, 3.2, 0.9, '#2b2f33');
    R.block(x - 0.2, D / 2 - 7.8, 0.6, 0.6, 0.06, '#111', 0.9, false); // esteira
    const n = R.sign(String(i + 1), x, 2.3, D / 2 - 7, 0.6, '#1f3c8c', '#fff'); n.scale.set(1, 2, 1);
    R.block(x, D / 2 - 7, 0.08, 0.08, 2.1, '#888', 0, false);
  }
  // gôndolas da mercearia
  let items = [];
  for (let i = 0; i < 8; i++) items = items.concat(R.shelf(-W / 2 + 7 + i * 3.6, -4.5, 12, 2.0, 1.1, '#c9c9c6', PROD, r, true));
  // adega de madeira (foto: estantes de madeira com vinhos)
  for (let i = 0; i < 3; i++) items = items.concat(R.shelf(W / 2 - 9 + i * 2.6, -3, 10, 2.1, 1.0, '#7a5532', ['#5b0f1a', '#2d4a1e', '#e9e1c8', '#3a1010'], r, true, 5));
  // câmaras frias no fundo
  R.block(-6, -D / 2 + 1, 26, 1.6, 2.4, '#f4f6f7');
  R.add(new THREE.Mesh(new THREE.PlaneGeometry(26, 1.9), new THREE.MeshLambertMaterial({ color: '#bfe3f2', emissive: '#3a5a66' }))).position.set(-6, 1.25, -D / 2 + 1.82);
  for (let i = 0; i < 70; i++) items.push([-18.5 + i * 0.36, 0.5 + (i % 3) * 0.6, -D / 2 + 1.75, 0.25, 0.3, 0.1, pick(r, PROD)]);
  // padaria e açougue nos cantos do fundo
  R.block(W / 2 - 6, -D / 2 + 2.5, 9, 1.2, 1.1, '#d9c6a5'); R.sign('PADARIA', W / 2 - 6, 4.5, -D / 2 + 1, 5, '#c0392b', '#fff');
  R.block(-W / 2 + 5, -D / 2 + 6, 1.2, 8, 1.1, '#f1f1f1'); R.sign('AÇOUGUE', -W / 2 + 0.3, 4.5, -D / 2 + 6, 5, '#8e1b1b', '#fff', Math.PI / 2);
  // hortifruti: bancas com frutas
  const fruit = [];
  for (let i = 0; i < 4; i++) { const x = -W / 2 + 6 + i * 4, z = D / 2 - 13; R.block(x, z, 3, 1.6, 0.8, '#6b4a2f'); for (let k = 0; k < 40; k++) fruit.push([x - 1.3 + r() * 2.6, 0.9, z - 0.7 + r() * 1.4, 0.22, 0.22, 0.22, pick(r, ['#e53935', '#fb8c00', '#fdd835', '#7cb342', '#8e24aa'])]); }
  R.inst(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial(), fruit);
  R.sign('HORTIFRUTI', -W / 2 + 12, 4.5, D / 2 - 13, 5, '#2e7d32', '#fff');
  R.sign('MERCEARIA', -4, 4.8, -2, 5, '#1f3c8c', '#fff'); R.sign('BEBIDAS', W / 2 - 6.5, 4.8, -3, 5, '#1f3c8c', '#fff');
  R.inst(box, new THREE.MeshLambertMaterial(), items);
  // carrinhos
  for (let i = 0; i < 6; i++) { R.block(W / 2 - 3, D / 2 - 3 - i * 0.6, 1.0, 0.55, 0.9, '#b0b4b8', 0.2, false); }
  return R;
}

// ---------------------------------------------------------------- Paróquia N. S. Aparecida (nave em "A")
function church(name, r) {
  const W = 20, D = WORLD ? 33 : 38, H = 18;
  const R = new Room(W, D, H, { floorTex: tileTex('#c9875c', '#a86a45', 14), noCeiling: true, noWalls: true, bg: '#20160f', amb: 1.2, sky: '#fff1dc', doorW: 3.2 });
  const roofM = new THREE.MeshLambertMaterial({ color: '#f1e8d8', side: THREE.DoubleSide });
  // paredes baixas laterais; o telhado inclinado vai delas até a cumeeira
  for (const s of [-1, 1]) R.block(s * W / 2, 0, 0.3, D, 2.6, '#efe6d6');
  {
    const g = new THREE.BufferGeometry(), z0 = -D / 2, z1 = D / 2, h0 = 2.6;
    const v = [-W / 2, h0, z0, 0, H, z0, 0, H, z1, -W / 2, h0, z0, 0, H, z1, -W / 2, h0, z1, W / 2, h0, z0, W / 2, h0, z1, 0, H, z1, W / 2, h0, z0, 0, H, z1, 0, H, z0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); R.add(new THREE.Mesh(g, roofM));
    // vigas de madeira clara seguindo o "A"
    const beams = [];
    for (let z = z0 + 2; z < z1; z += 3.2) for (const s of [-1, 1]) { const len = Math.hypot(W / 2, H - h0); beams.push({ z, s, len }); }
    const bm = new THREE.MeshLambertMaterial({ color: '#c99a62' });
    for (const b of beams) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, b.len, 0.3), bm); m.position.set(b.s * W / 4, (H + h0) / 2, b.z); m.rotation.z = b.s * Math.atan2(W / 2, H - h0); R.add(m); }
    // empena do fundo (atrás do altar) e da frente com o vitral
    const tri = (z, mat, flip) => { const t = new THREE.BufferGeometry(); t.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, z, W / 2, 0, z, W / 2, h0, z, -W / 2, 0, z, W / 2, h0, z, -W / 2, h0, z, -W / 2, h0, z, W / 2, h0, z, 0, H, z], 3)); t.computeVertexNormals(); const m = new THREE.Mesh(t, mat); m.material.side = THREE.DoubleSide; R.add(m); return m; };
    tri(z0, new THREE.MeshLambertMaterial({ color: '#f3ead9' }));
    { // fachada interna com o vão da porta
      const t = new THREE.BufferGeometry(), z = z1 - 0.05, g2 = 1.7;
      t.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, z, -g2, 0, z, -g2, h0, z, -W / 2, 0, z, -g2, h0, z, -W / 2, h0, z, g2, 0, z, W / 2, 0, z, W / 2, h0, z, g2, 0, z, W / 2, h0, z, g2, h0, z, -W / 2, h0, z, W / 2, h0, z, 0, H, z], 3)); t.computeVertexNormals();
      R.add(new THREE.Mesh(t, new THREE.MeshLambertMaterial({ color: '#efe4d0', side: THREE.DoubleSide })));
    }
  }
  // vitral da entrada (arco ogival colorido) — visto de dentro, brilha com a luz de fora
  const glass = canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = '#efe4d0'; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.moveTo(20, h); g.lineTo(20, 150); g.quadraticCurveTo(20, 10, w / 2, 0); g.quadraticCurveTo(w - 20, 10, w - 20, 150); g.lineTo(w - 20, h); g.closePath(); g.clip();
    const cols = ['#c62828', '#f9a825', '#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00', '#00838f', '#fdd835'];
    for (let y = 0; y < h; y += 24) for (let x = 0; x < w; x += 24) { g.fillStyle = cols[(x * 7 + y * 3 + ((x * y) % 5)) % cols.length]; g.fillRect(x + 1, y + 1, 22, 22); }
    g.strokeStyle = '#222'; g.lineWidth = 3; for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.restore();
  });
  const v = new THREE.Mesh(new THREE.PlaneGeometry(9, 13.5), new THREE.MeshBasicMaterial({ map: glass, side: THREE.DoubleSide })); v.position.set(0, 3.6 + 6.75, D / 2 - 0.15); R.add(v);
  // piso: corredor central e bancos de madeira escura dos dois lados
  const pews = [], backs = [];
  for (let z = D / 2 - 6; z > -D / 2 + 9; z -= 1.15) for (const s of [-1, 1]) { const x = s * (1.6 + 3.3); pews.push([x, 0.42, z, 6.4, 0.08, 0.45, '#4a2c1a']); backs.push([x, 0, z - 0.25, 6.4, 0.95, 0.07, '#3d2414']); R.solid(x, z, 6.4, 0.6); }
  R.inst(box, new THREE.MeshLambertMaterial(), pews.concat(backs));
  // presbitério: degraus com tapete vermelho, altar, ambão
  R.block(0, -D / 2 + 4.5, W - 1, 6, 0.35, '#d8c9b2', 0, false); R.block(0, -D / 2 + 4, W - 2, 5, 0.6, '#d8c9b2', 0, false);
  R.block(0, -D / 2 + 7.2, 3.2, 1.6, 0.62, '#b71c1c', 0, false);
  R.block(0, -D / 2 + 3.8, 2.6, 1.1, 1.05, '#f3efe6', 0.6); R.block(-4, -D / 2 + 5.5, 0.8, 0.8, 1.2, '#7a4a2a', 0.6);
  R.solid(0, -D / 2 + 3, W, 5);
  // retábulo: arco ogival creme com friso alaranjado e a imagem de Nossa Senhora Aparecida no centro
  const arch = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#f2e7d2'; g.fillRect(0, 0, w, h);
    const archPath = (m) => { g.beginPath(); g.moveTo(m, h); g.lineTo(m, 200); g.quadraticCurveTo(m, 30 + m, w / 2, m); g.quadraticCurveTo(w - m, 30 + m, w - m, 200); g.lineTo(w - m, h); g.closePath(); };
    archPath(10); g.fillStyle = '#d9692f'; g.fill(); archPath(28); g.fillStyle = '#f6eedd'; g.fill(); archPath(46); g.fillStyle = '#a3262a'; g.fill();
    // imagem: manto azul em forma de triângulo, coroa dourada
    g.fillStyle = '#1d3c8f'; g.beginPath(); g.moveTo(w / 2, 170); g.lineTo(w / 2 - 50, 380); g.lineTo(w / 2 + 50, 380); g.closePath(); g.fill();
    g.fillStyle = '#e8c04a'; g.fillRect(w / 2 - 14, 150, 28, 22); g.fillStyle = '#5a3a22'; g.beginPath(); g.arc(w / 2, 188, 11, 0, 7); g.fill();
    g.strokeStyle = '#e8c04a'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2 - 50, 380); g.lineTo(w / 2, 170); g.lineTo(w / 2 + 50, 380); g.stroke();
    g.fillStyle = '#e8c04a'; g.fillRect(w / 2 - 60, 380, 120, 16);
  });
  R.add(new THREE.Mesh(new THREE.PlaneGeometry(7, 14), new THREE.MeshLambertMaterial({ map: arch, emissive: '#3a2a1a' }))).position.set(0, 7.6, -D / 2 + 0.12);
  // nichos laterais com portas verdes
  for (const s of [-1, 1]) R.block(s * 6.5, -D / 2 + 0.3, 1.8, 0.3, 3.2, '#2f6b4a', 0.6, false);
  // lustres de cobre em anel, pendurados por correntes (duas fileiras)
  const ring = new THREE.TorusGeometry(0.9, 0.12, 6, 18).rotateX(Math.PI / 2), copper = new THREE.MeshLambertMaterial({ color: '#b8743a', emissive: '#5a2e10' });
  for (let z = D / 2 - 7; z > -D / 2 + 8; z -= 6) for (const s of [-1, 1]) {
    const x = s * 4.5, y = 5.2; const m = new THREE.Mesh(ring, copper); m.position.set(x, y, z); R.add(m);
    const yTop = 2.6 + (H - 2.6) * (1 - Math.abs(x) / (W / 2));
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, yTop - y, 4).translate(0, (yTop - y) / 2, 0), new THREE.MeshLambertMaterial({ color: '#333' })); ch.position.set(x, y, z); R.add(ch);
    R.light(x, y - 0.3, z, '#ffd9a0', 14, 14);
  }
  R.light(0, 10, -D / 2 + 6, '#fff0d0', 50, 30);
  return R;
}

// ---------------------------------------------------------------- demais tipos
function shopRoom(kind, name, w, d, r, color) {
  const W = WORLD ? w : Math.max(8, Math.min(w, 16)), D = WORLD ? d : Math.max(9, Math.min(d, 18)), H = 3.4;
  const pal = {
    Padaria: { floor: '#d8cfc2', wall: '#f6efe3' }, Confeitaria: { floor: '#efe3e6', wall: '#fff6f8' }, Farmácia: { floor: '#eef2f3', wall: '#ffffff' },
    Academia: { floor: '#222', wall: '#3a3d42' }, Bar: { floor: '#9a8a77', wall: '#e6d7bd' }, Igreja: { floor: '#cfc6b8', wall: '#f5f2ea' },
  }[kind] || { floor: '#cfcac0', wall: '#f2efe8' };
  const R = new Room(W, D, H, { ...pal, ceiling: '#f4f4f2', bg: '#151515', amb: 1.15, floorTex: tileTex(pal.floor, '#00000022', Math.round(W / 1.2)) });
  for (let x = -W / 2 + 2; x < W / 2; x += 4) for (let z = -D / 2 + 2; z < D / 2; z += 4) { R.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.3), new THREE.MeshBasicMaterial({ color: '#ffffff' }))).position.set(x, H - 0.05, z); }
  R.light(0, H - 0.4, 0, '#fff', 25, 20); R.light(0, H - 0.4, -D / 3, '#fff', 15, 14);
  R.sign(name, 0, H - 0.6, -D / 2 + 0.13, Math.min(W - 1, 6), color || '#34495e', '#fff');
  let items = [];
  const counter = (x, z, len, c = '#d9d2c4', glassTop = false) => { R.block(x, z, len, 0.7, 1.0, c); if (glassTop) R.add(new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: '#cfe8f0', transparent: true, opacity: 0.45 }))).position.set(x, 1.0, z) || 0; };
  // mesa com tampo e pés + cadeiras com assento e encosto (mesa de bar de plástico ou de madeira)
  const table = (x, z, top = '#e8e3da', chair = '#c0392b') => {
    R.block(x, z, 0.85, 0.85, 0.05, top, 0.72); R.solid(x, z, 0.8, 0.8);
    for (const [dx, dz] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) R.block(x + dx, z + dz, 0.05, 0.05, 0.72, top, 0, false);
    for (const [dx, dz, bx, bz] of [[0.75, 0, 0.21, 0], [-0.75, 0, -0.21, 0], [0, 0.75, 0, 0.21], [0, -0.75, 0, -0.21]]) {
      R.block(x + dx, z + dz, 0.42, 0.42, 0.05, chair, 0.44, false);
      for (const [lx, lz] of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]]) R.block(x + dx + lx, z + dz + lz, 0.04, 0.04, 0.44, chair, 0, false);
      R.block(x + dx + bx, z + dz + bz, bx ? 0.04 : 0.42, 0.42, bz ? 0.04 : 0.42, chair, 0.49, false).scale.set(bx ? 0.04 : 0.42, 0.45, bz ? 0.04 : 0.42);
    }
  };
  if (/Padaria|Confeitaria/.test(kind)) {
    counter(0, -D / 2 + 3, W - 3, '#e2d6c2');
    R.block(0, -D / 2 + 3, W - 3, 0.6, 0.45, '#f6ecd8', 1.0, false); // vitrine
    const breads = []; for (let i = 0; i < 60; i++) breads.push([-W / 2 + 2 + r() * (W - 4), 1.05, -D / 2 + 2.8 + r() * 0.4, 0.25, 0.12, 0.15, pick(r, ['#c98a3c', '#a8662a', '#e0b06a', '#7b4a20', '#f3d9a4'])]);
    items = items.concat(R.shelf(0, -D / 2 + 0.6, W - 2, 2.2, 0.5, '#8a6a4a', ['#c98a3c', '#e0b06a', '#a8662a'], r, false, 4));
    R.inst(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial(), breads);
    for (let i = 0; i < 2; i++) table(-W / 4 + i * W / 2, D / 2 - 3, '#f1ebe0', '#5d4037');
  } else if (/Farmácia/.test(kind)) {
    counter(0, -D / 2 + 3, W - 4, '#ffffff');
    for (const s of [-1, 1]) items = items.concat(R.shelf(s * (W / 2 - 0.5), 0, D - 4, 2.1, 0.5, '#f5f5f5', ['#e53935', '#1e88e5', '#ffffff', '#43a047', '#fdd835', '#00acc1'], r, true, 6));
    items = items.concat(R.shelf(0, 1, D / 2, 1.6, 0.8, '#f5f5f5', PROD, r, true, 4));
  } else if (/Academia|artes/i.test(kind)) {
    const eq = [];
    for (let i = 0; i < 4; i++) { R.block(-W / 2 + 2 + i * 1.6, -D / 2 + 2, 0.8, 1.8, 1.1, '#2b2b2b'); }
    for (let i = 0; i < 3; i++) { R.block(W / 2 - 2, -D / 2 + 3 + i * 2.5, 1.4, 0.6, 0.5, '#111'); R.block(W / 2 - 2, -D / 2 + 3 + i * 2.5, 0.08, 0.08, 1.9, '#9e9e9e', 0.5, false); }
    for (let i = 0; i < 12; i++) eq.push([-1 + (i % 6) * 0.5, 0.15 + Math.floor(i / 6) * 0.4, 1, 0.3, 0.3, 0.3, '#424242']);
    R.inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial(), eq);
    R.add(new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 2.2), new THREE.MeshPhongMaterial({ color: '#b8c6cc', shininess: 120 }))).position.set(0, 1.4, -D / 2 + 0.12); // espelho
  } else if (/Bar|Restaurante|Churrascaria|Pizzaria|Hamburgueria|Lanchonete|Sorveteria|Açaí/.test(kind)) {
    const plastic = /Bar/.test(kind);
    counter(-W / 2 + 2.2, -D / 4, 1.0, '#6d4c41'); R.block(-W / 2 + 2.2, -D / 4, 1.0, D / 2, 1.1, '#6d4c41');
    const bottles = []; for (let i = 0; i < 40; i++) bottles.push([-W / 2 + 0.3, 1.3 + (i % 3) * 0.45, -D / 2 + 1 + (i / 3) * 0.4, 0.09, 0.32, 0.09, pick(r, ['#2e7d32', '#6d4c41', '#f9a825', '#c62828', '#eceff1'])]);
    R.inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), bottles);
    R.block(-W / 2 + 0.6, 0, 1.0, 2, 2.0, '#e9eef0'); // freezer de bebidas
    const tc = plastic ? pick(r, ['#c62828', '#f9a825', '#1565c0']) : '#5d4037';
    for (let x = -W / 2 + 4.5; x < W / 2 - 1; x += 2.4) for (let z = -D / 2 + 2.5; z < D / 2 - 2.5; z += 2.4) table(x, z, plastic ? tc : '#d7ccc8', tc);
    R.add(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05), new THREE.MeshBasicMaterial({ color: '#1b2a3a' }))).position.set(W / 2 - 0.12, 2.2, 0); R.scene.children[R.scene.children.length - 1].rotation.y = -Math.PI / 2; // TV
  } else if (/Igreja/.test(kind)) {
    R.block(0, -D / 2 + 1.5, W - 2, 3, 0.5, '#7b5a3c', 0, false); R.block(0, -D / 2 + 2.2, 0.8, 0.6, 1.2, '#e0e0e0', 0.5);
    const ch = []; for (let z = D / 2 - 3; z > -D / 2 + 4; z -= 1.0) for (let x = -W / 2 + 1.5; x < W / 2 - 1; x += 0.65) if (Math.abs(x) > 0.8) ch.push([x, 0, z, 0.5, 0.85, 0.5, '#37474f']);
    R.inst(box, new THREE.MeshLambertMaterial(), ch);
  } else if (/Pet|Veterin/.test(kind)) {
    counter(0, -D / 2 + 3, W / 2);
    for (const s of [-1, 1]) items = items.concat(R.shelf(s * (W / 2 - 0.5), 0, D - 4, 2, 0.5, '#e0e0e0', ['#e65100', '#2e7d32', '#1565c0', '#fdd835', '#8d6e63'], r, true, 4));
    R.block(W / 4, -D / 2 + 1, 2, 1, 0.9, '#b0bec5'); // banho e tosa
  } else if (/Salão/.test(kind)) {
    for (let i = 0; i < 4; i++) { const x = -W / 2 + 2 + i * 2.2; R.block(x, -D / 2 + 1.4, 0.7, 0.7, 0.9, '#212121'); R.add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshPhongMaterial({ color: '#cfd8dc', shininess: 120 }))).position.set(x, 1.7, -D / 2 + 0.12); }
    counter(W / 4, D / 2 - 3, 2);
  } else if (/Escola/.test(kind)) {
    for (let x = -W / 2 + 2; x < W / 2 - 1; x += 1.6) for (let z = -D / 2 + 4; z < D / 2 - 2; z += 1.6) R.block(x, z, 0.6, 0.5, 0.7, '#ffb74d');
    R.add(new THREE.Mesh(new THREE.PlaneGeometry(4, 1.4), new THREE.MeshLambertMaterial({ color: '#1b5e20' }))).position.set(0, 1.7, -D / 2 + 0.12);
  } else { // lojas em geral
    counter(W / 2 - 2.5, -D / 2 + 3, 2.5);
    for (const s of [-1, 1]) items = items.concat(R.shelf(s * (W / 2 - 0.5), 0, D - 4, 2.2, 0.5, '#d7ccc8', PROD, r, true, 5));
    if (W > 9) items = items.concat(R.shelf(0, 0, D / 2, 1.4, 1.0, '#d7ccc8', PROD, r, true, 3));
  }
  if (items.length) R.inst(box, new THREE.MeshLambertMaterial(), items);
  return R;
}

export function buildInterior(info) {
  const r = rng(info.seed || 1);
  WORLD = !!info.world;
  if (info.kind === 'coelho') return supermarket('Coelho Diniz', r, info);
  if (info.kind === 'paroquia') return church(info.name, r);
  return shopRoom(info.cat || 'Loja', info.name, WORLD ? info.W : info.w, WORLD ? info.D : info.d, r, info.color);
}
