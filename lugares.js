// Lugares recriados a partir das fotos do Street View enviadas pelo jogador (jan/2025):
// Escola Estadual Nacle Miguel Habib, Colégio Nossa Senhora de Lourdes (+ Praça Caparaó, a "praça do Lourdinas"),
// Garfo Clube e Praça da Maçonaria (Praça Itatiaia) com o campo de muro azul.
let T, S, OB, UB;

const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
const M = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
const TM = (tex, o = {}) => new T.MeshLambertMaterial({ map: tex, ...o });

// sistema local: u ao longo da rua (e), w para dentro do lote (n = esquerda de e)
function site(O, e) {
  const n = [-e[1], e[0]];
  const G = new T.Group(); G.position.set(O[0], 0, O[1]); G.rotation.y = Math.atan2(-e[1], e[0]); S.add(G);
  const W2 = (u, w) => [O[0] + e[0] * u + n[0] * w, O[1] + e[1] * u + n[1] * w];
  const solid = (u, w, su, sw) => { const p = W2(u, w); OB({ x: p[0], z: p[1], w: su, d: sw, ex: e, nx: n }); };
  const box = (u, w, y, su, sh, sw, m, isSolid) => { const me = new T.Mesh(UB, m); me.position.set(u, y, w); me.scale.set(su, sh, sw); me.castShadow = me.receiveShadow = true; G.add(me); if (isSolid) solid(u, w, su, sw); return me; };
  // plano vertical virado para a rua (−w) quando face < 0, para dentro (+w) quando face > 0
  const plane = (u, w, y, pw, ph, m, face = -1) => { const me = new T.Mesh(new T.PlaneGeometry(pw, ph), m); me.position.set(u, y, w); if (face < 0) me.rotation.y = Math.PI; G.add(me); return me; };
  const flat = (u, w, y, pw, pd, m) => { const me = new T.Mesh(new T.PlaneGeometry(pw, pd), m); me.rotation.x = -Math.PI / 2; me.position.set(u, y, w); me.receiveShadow = true; G.add(me); return me; };
  // telhado de duas águas com a cumeeira ao longo de u
  const gable = (u, w, y, len, dep, rise, c) => {
    const a = -len / 2, b = len / 2, d = dep / 2;
    const v = [a, 0, -d, b, 0, -d, b, rise, 0, a, 0, -d, b, rise, 0, a, rise, 0, a, 0, d, a, rise, 0, b, rise, 0, a, 0, d, b, rise, 0, b, 0, d, a, 0, -d, a, rise, 0, a, 0, d, b, 0, -d, b, 0, d, b, rise, 0];
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
    const me = new T.Mesh(g, M(c, { side: T.DoubleSide })); me.position.set(u, y, w); me.castShadow = true; G.add(me); return me;
  };
  return { G, W2, box, plane, flat, gable, solid, e, n };
}
const unit = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };

// ---------- texturas
const waveWall = (text, w = 1024) => cv(w, 128, (g, W, H) => {
  g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, W, H); g.fillStyle = '#1d4fb8'; g.fillRect(0, H * 0.66, W, H * 0.34);
  for (const [c, ph, amp] of [['#2457c5', 0, 13], ['#e8b923', 1.7, 11], ['#2457c5', 3.1, 9]]) { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= W; x += 4) { const y = H * 0.42 + Math.sin(x / 38 + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  if (text) { g.font = '800 34px Arial Narrow, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#f4f5f2'; g.strokeText(text, W / 2, H * 0.4); g.fillStyle = '#1b2a5c'; g.fillText(text, W / 2, H * 0.4); }
});
const blueBaseWall = (text, color = '#1f5fbf', font = 'italic 600 40px Arial, sans-serif') => cv(1024, 128, (g, W, H) => {
  g.fillStyle = '#f3f4f2'; g.fillRect(0, 0, W, H); g.fillStyle = '#1d55c0'; g.fillRect(0, H * 0.68, W, H * 0.32);
  if (text) { g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H * 0.42); }
});
const cobogo = () => cv(128, 128, (g, W, H) => { g.fillStyle = '#7a2a22'; g.fillRect(0, 0, W, H); g.fillStyle = '#a8443a'; for (let y = 2; y < H; y += 11) for (let x = 2; x < W; x += 11) g.fillRect(x, y, 8, 8); g.fillStyle = '#4a1a14'; for (let y = 5; y < H; y += 11) for (let x = 5; x < W; x += 11) g.fillRect(x, y, 3, 3); });
// fachada de escola: andares com faixa azul, janelas e guarda-corpo de grade
const schoolFacade = (floors, opt = {}) => cv(1024, 128 * floors, (g, W, H) => {
  const fh = H / floors; g.fillStyle = opt.wall || '#f2f3f1'; g.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    g.fillStyle = opt.band || '#1d55c0'; g.fillRect(0, y0 + fh - 12, W, 12);
    if (opt.glass) { g.fillStyle = '#5d7a8c'; g.fillRect(8, y0 + 22, W - 16, fh * 0.5); g.strokeStyle = '#f2f3f1'; g.lineWidth = 4; for (let x = 8; x < W; x += 52) { g.beginPath(); g.moveTo(x, y0 + 22); g.lineTo(x, y0 + 22 + fh * 0.5); g.stroke(); } g.fillStyle = '#e8ebee'; g.fillRect(8, y0 + 22 + fh * 0.5, W - 16, 6); }
    else for (let x = 18; x < W - 40; x += 92) { g.fillStyle = '#3f5563'; g.fillRect(x, y0 + 26, 54, fh * 0.42); g.strokeStyle = '#e9edf0'; g.lineWidth = 2; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 13.5, y0 + 26); g.lineTo(x + k * 13.5, y0 + 26 + fh * 0.42); g.stroke(); } }
    if (opt.rail && f > 0) { g.strokeStyle = '#d7dde3'; g.lineWidth = 2; for (let x = 0; x < W; x += 7) { g.beginPath(); g.moveTo(x, y0 + fh * 0.62); g.lineTo(x, y0 + fh - 12); g.stroke(); } g.fillStyle = '#d7dde3'; g.fillRect(0, y0 + fh * 0.62, W, 3); }
  }
});
const fenceTex = () => { const t = cv(64, 64, (g, W, H) => { g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(70,78,84,0.9)'; g.lineWidth = 2; for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); } }); t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
const paverTex = (c1 = '#8f8f8b', c2 = '#7b7b77', hex = false) => { const t = cv(128, 128, (g, W, H) => { g.fillStyle = c1; g.fillRect(0, 0, W, H); g.strokeStyle = c2; g.lineWidth = 3;
  if (hex) { const r = 16; for (let y = 0, row = 0; y < H + r; y += r * 1.5, row++) for (let x = (row % 2) * r * 0.866; x < W + r; x += r * 1.732) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.stroke(); } }
  else for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / 16 % 2) * 16; x < W; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } } }); t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
const rep = (tex, rx, ry) => { const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; };
const signTex = (lines, bg, w = 1024, h = 128) => cv(w, h, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); for (const L of lines) { g.font = L.font; g.fillStyle = L.color; g.textAlign = L.align || 'left'; g.textBaseline = 'middle'; g.fillText(L.text, L.x * W, L.y * H); } });

// árvores próprias dos lugares (somadas às árvores do jogo)
function treesIn(ctx, list) { for (const p of list) ctx.yardTrees.push(p); }
function clearTrees(ctx, test) { ctx.W.trees = ctx.W.trees.filter(p => !test(p)); for (let i = ctx.yardTrees.length - 1; i >= 0; i--) if (test(ctx.yardTrees[i])) ctx.yardTrees.splice(i, 1); }
const inRect = (st, u0, u1, w0, w1) => p => { const dx = p[0] - st.W2(0, 0)[0], dz = p[1] - st.W2(0, 0)[1]; const u = dx * st.e[0] + dz * st.e[1], w = dx * st.n[0] + dz * st.n[1]; return u > u0 && u < u1 && w > w0 && w < w1; };

// ---------------------------------------------------------------- Nacle
// R. Trinta e Seis, 404: muro branco com base azul e ondas azul/amarelo e o nome; portões de chapa cinza;
// prédio comprido de 2 andares, branco com faixas azuis, painéis de cobogó vermelho, telhado cerâmico;
// torre branca com topo azul e o brasão redondo da escola.
function nacle(ctx) {
  const st = site([56, 158], unit([56, 158], [104, 189])); const { box, plane, gable, flat } = st; const L = 57;
  clearTrees(ctx, inRect(st, 1, L - 1, 1, 23));
  const wallM = TM(waveWall(null)), nameM = TM(waveWall('ESCOLA ESTADUAL NACLE MIGUEL HABIB')), gateM = M('#a9adb0'), whiteM = M('#f3f4f2'), blueM = M('#1d55c0');
  const wallH = 2.6, gates = [[17, 4.2], [34, 3.2]]; // [centro, largura] — o portão menor fica aberto para entrar
  let u0 = 0;
  for (const [gc, gw] of [...gates, [L + 1, 0]]) {
    const a = u0, b = Math.min(L, gc - gw / 2); if (b - a > 0.3) { const seg = box((a + b) / 2, 0.3, 0.18, b - a, wallH, 0.25, whiteM, true); const p = plane((a + b) / 2, 0.16, 0.18 + wallH / 2, b - a, wallH, (b - a) > 18 ? nameM : wallM); }
    u0 = gc + gw / 2;
  }
  box(17, 0.3, 0.18, 4.2, 2.9, 0.12, gateM, true); // portão grande fechado
  box(34 - 1.6 - 0.1, 0.3, 2.3, 0.2, 0.6, 0.3, gateM); box(34 + 1.6 + 0.1, 0.3, 2.3, 0.2, 0.6, 0.3, gateM);
  flat(L / 2, 6, 0.2, L - 2, 11, M('#9a9a96'));
  // prédio
  const fac = schoolFacade(2, { rail: true }), side = M('#f2f3f1');
  const bw = 46, bd = 11, bh = 7.6, bu = 4 + bw / 2, bwc = 9 + bd / 2;
  box(bu, bwc, 0.18, bw, bh, bd, [side, side, M('#cfcac0'), M('#cfcac0'), TM(fac), TM(fac)], true);
  // corredores externos dos dois andares (as salas abrem para eles): laje com borda azul, mureta branca,
  // tela de alambrado até o beiral, pilares brancos e os painéis de cobogó vermelho na frente do corredor
  const cw = 7.0, sY = 0.18 + 3.75, b0u = bu - bw / 2, b1u = bu + bw / 2, cobU = [10, 30, 43];
  box(bu, cw + 1, sY, bw, 0.25, 2, whiteM); box(bu, cw - 0.02, sY - 0.05, bw, 0.35, 0.14, blueM);
  box(bu, cw + 1, 0.18 + bh - 0.32, bw, 0.3, 2.2, whiteM); box(bu, cw - 0.12, 0.18 + bh - 0.4, bw, 0.4, 0.14, blueM);
  for (let u = b0u + 0.2; u <= b1u; u += 4.6) box(u, cw + 0.1, 0.18, 0.3, bh - 0.3, 0.3, whiteM, true);
  const fence = fenceTex(), cob = TM(cobogo());
  const skip = u => (u > 19 && u < 25) || cobU.some(c => Math.abs(u - c) < 1.9);
  const runs = []; { let a = null; for (let u = b0u; u <= b1u + 0.01; u += 0.25) { const s = u > b1u - 0.01 || skip(u); if (!s && a === null) a = u; if (s && a !== null) { runs.push([a, u]); a = null; } } }
  for (const [y0, y1, mur] of [[0.18, sY, 0.9], [sY + 0.25, 0.18 + bh - 0.4, 1.0]]) {
    box(bu, cw - 0.08, y0 + mur - 0.12, bw, 0.12, 0.04, blueM); // faixa azul
    for (const [a, b] of runs) { const len = b - a, h = y1 - (y0 + mur);
      box((a + b) / 2, cw, y0, len, mur, 0.14, whiteM, y0 < 1); // mureta branca
      const f = new T.Mesh(new T.PlaneGeometry(len, h), new T.MeshLambertMaterial({ map: rep(fence, len / 1.0, h / 1.0), transparent: true, alphaTest: 0.3, side: T.DoubleSide })); f.position.set((a + b) / 2, y0 + mur + h / 2, cw); st.G.add(f); }
  }
  for (const cu of cobU) box(cu, cw, 0.18, 3.6, bh - 0.4, 0.2, cob, true); // painéis de cobogó
  gable(bu, bwc, 0.18 + bh, bw + 1.4, bd + 1.6, 2.6, '#b0603c');
  // vista de cima (satélite, enviada pelo jogador): entre o muro e o prédio, da R. Dez para a R. Oito:
  // quadra pequena coberta com telhado translúcido esverdeado, a torre da escada que sobe para as salas
  // do segundo andar, e um pátio aberto; atrás do prédio, outro pátio.
  // ---- quadra coberta (u 4.5 → 19)
  const q0 = 4.5, q1 = 19, qw0 = 1.0, qw1 = 6.6;
  { const lines = cv(256, 128, (g, W, H) => { g.fillStyle = '#7f8f99'; g.fillRect(0, 0, W, H); g.strokeStyle = '#f4f4f4'; g.lineWidth = 3; g.strokeRect(8, 8, W - 16, H - 16); g.beginPath(); g.moveTo(W / 2, 8); g.lineTo(W / 2, H - 8); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, 18, 0, 7); g.stroke(); g.strokeStyle = '#e8b923'; g.beginPath(); g.arc(8, H / 2, 30, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(W - 8, H / 2, 30, Math.PI / 2, Math.PI * 1.5); g.stroke(); });
    flat((q0 + q1) / 2, (qw0 + qw1) / 2, 0.215, q1 - q0, qw1 - qw0, TM(lines));
    for (const gu of [q0 + 0.4, q1 - 0.4]) { for (const s of [-1, 1]) box(gu, (qw0 + qw1) / 2 + s * 1.4, 0.2, 0.08, 1.8, 0.08, M('#f4f4f4')); box(gu, (qw0 + qw1) / 2, 1.95, 0.08, 0.08, 2.9, M('#f4f4f4')); }
    const roofM = new T.MeshLambertMaterial({ color: '#a9d6b4', transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
    const rf = new T.Mesh(new T.PlaneGeometry(q1 - q0 + 0.8, qw1 - qw0 + 1.2), roofM); rf.rotation.x = -Math.PI / 2; rf.position.set((q0 + q1) / 2, 6.3, (qw0 + qw1) / 2); st.G.add(rf);
    const steel = M('#8d9397');
    for (const pu of [q0, (q0 + q1) / 2, q1]) for (const pw of [qw0, qw1]) box(pu, pw, 0.18, 0.18, 6.1, 0.18, steel, true);
    for (const pw of [qw0, qw1]) box((q0 + q1) / 2, pw, 6.15, q1 - q0, 0.18, 0.18, steel);
    for (let u = q0; u <= q1 + 0.01; u += (q1 - q0) / 6) box(u, (qw0 + qw1) / 2, 6.18, 0.1, 0.1, qw1 - qw0, steel); }
  // ---- torre da escada (com o brasão na frente) — aberta atrás, com a escada subindo para o 2º andar
  const tu = 22, tw = 5.5, t0 = tu - tw / 2, t1 = tu + tw / 2;
  box(tu, 4.75, 0.18, tw, 10.4, 0.3, whiteM, true);                 // frente (com o brasão)
  for (const su of [t0 + 0.15, t1 - 0.15]) box(su, 6.6, 0.18, 0.3, 10.4, 3.9, whiteM, true); // laterais
  box(tu, 6.6, 10.58, tw + 0.5, 1.1, 4.3, blueM);
  { const stepM = M('#c9c4ba'), railM = M('#1d55c0'); const n = 13;
    for (let k = 0; k < n; k++) { const u = t0 + 0.6 + k * ((tw - 1.4) / n), y = 0.18 + k * (3.8 / n); box(u, 7.3, y, (tw - 1.4) / n + 0.02, 3.8 / n, 1.3, stepM); }
    box(tu, 7.3, 3.95, tw - 0.6, 0.15, 1.6, stepM); // patamar no nível do corredor de cima
    const rail = box(tu - 0.2, 6.62, 2.3, tw - 1.4, 0.06, 0.06, railM); rail.rotation.z = Math.atan2(3.8, tw - 1.4); }
  // ---- pátio aberto (u 25 → 54) e pátio dos fundos
  flat(39.5, 4.7, 0.212, 29, 7.6, M('#a9a59c'));
  for (const [bu2, bw2] of [[31, 6.8], [40, 6.8], [49, 6.8]]) box(bu2, bw2, 0.2, 2.2, 0.45, 0.6, M('#bdbab2'), true);
  flat(L / 2, 22, 0.212, L - 4, 3.6, M('#a9a59c'));
  const crest = TM(cv(256, 256, (g) => { g.fillStyle = '#f3f4f2'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#1d55c0'; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.fill(); g.fillStyle = '#f3f4f2'; g.beginPath(); g.arc(128, 128, 84, 0, 7); g.fill(); g.strokeStyle = '#1d55c0'; g.lineWidth = 8; g.beginPath(); g.moveTo(70, 160); g.lineTo(128, 70); g.lineTo(186, 160); g.stroke(); g.beginPath(); g.moveTo(84, 140); g.lineTo(172, 140); g.stroke(); g.font = '700 22px Arial'; g.fillStyle = '#1d55c0'; g.textAlign = 'center'; g.fillText('NACLE', 128, 196); }));
  plane(tu, 6.4 - 1.81, 7.6, 3.6, 3.6, crest);
  // faixa azul sob o beiral e calçada
  box(bu, 9 - 0.1, 0.18 + bh - 0.5, bw, 0.5, 0.25, blueM);
}

// ---------------------------------------------------------------- Lourdinas
// Av. Rio Doce, 2813: prédio de 4 andares branco com marquises azuis e janelas em faixa; térreo azul com
// a faixa azul-marinho "NS COLÉGIO NOSSA SENHORA DE LOURDES", banners; bloco lateral de 3 andares;
// muro da R. Trinta e Seis branco com base azul, "Acolhimento e cordialidade", "#princípioscristãos" e portão azul.
function lourdes(ctx) {
  // fachada da Av. Rio Doce
  const A = site([271, 298], unit([271, 298], [268, 335])); const LA = 37;
  clearTrees(ctx, inRect(A, -2, LA + 2, 0.5, 18));
  const white = M('#f3f4f2'), navy = M('#16316f'), blue = M('#1d55c0');
  const fac4 = schoolFacade(3, { glass: true, band: '#1d55c0' });
  const bu0 = 9, bw = LA - bu0, bd = 15, gh = 4.2, uh = 3.4 * 3;
  // térreo azul
  const groundT = cv(1024, 128, (g, W, H) => { g.fillStyle = '#3d74d6'; g.fillRect(0, 0, W, H); for (let x = 20; x < W - 60; x += 120) { if (x > 560 && x < 700) { g.fillStyle = '#2a3a8a'; g.fillRect(x, 26, 90, 100); continue; } g.fillStyle = '#eef2f5'; g.fillRect(x, 34, 90, 58); g.strokeStyle = '#3d74d6'; g.lineWidth = 3; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x + k * 15, 34); g.lineTo(x + k * 15, 92); g.stroke(); } } g.fillStyle = '#27407f'; g.fillRect(470, 30, 70, 90); g.fillStyle = '#e94b8a'; g.fillRect(476, 40, 58, 30); g.fillStyle = '#f2c618'; g.fillRect(476, 74, 58, 18); });
  A.box(bu0 + bw / 2, bd / 2 + 0.6, 0.18, bw, gh, bd, [blue, blue, white, white, TM(groundT), TM(groundT)], true);
  A.box(bu0 + bw / 2, bd / 2 + 0.6, 0.18 + gh, bw, uh, bd, [white, white, M('#cfcac0'), M('#cfcac0'), TM(fac4), TM(fac4)], true);
  for (let f = 0; f <= 3; f++) A.box(bu0 + bw / 2, 0.6 - 0.5, 0.18 + gh + f * 3.4 - 0.25, bw + 0.6, 0.28, 1.4, blue); // marquises
  const sign = signTex([{ text: 'NS', font: '900 86px Arial', color: '#f3f4f2', x: 0.03, y: 0.52 }, { text: 'COLÉGIO NOSSA SENHORA DE LOURDES', font: '800 62px Georgia, serif', color: '#f3f4f2', x: 0.17, y: 0.55 }], '#16316f', 2048, 128);
  A.box(bu0 + bw / 2, 0.45, 0.18 + gh - 1.25, bw, 1.25, 0.3, navy); A.plane(bu0 + bw / 2, 0.29, 0.18 + gh - 0.62, bw - 0.4, 1.15, TM(sign));
  // muro com base azul (lado sul da fachada)
  A.box(bu0 / 2, 0.3, 0.18, bu0, 2.6, 0.25, white, true); A.plane(bu0 / 2, 0.16, 1.48, bu0, 2.6, TM(blueBaseWall('Lourdinas', '#1d55c0', 'italic 700 60px Georgia, serif')));
  // muro da R. Trinta e Seis
  const B = site([174, 235], unit([174, 235], [271, 298])); const LB = 116;
  clearTrees(ctx, inRect(B, 0.5, LB, 0.5, 20));
  const phrases = ['Acolhimento e cordialidade', '#princípioscristãos', 'Excelência acadêmica', 'Rede Lourdinas de Educação'];
  const gate = [100, 4.6]; let k = 0;
  for (let a = 0; a < LB - 2; a += 14) {
    const b = Math.min(a + 14, LB - 2); const s0 = Math.max(a, gate[0] + gate[1] / 2 > a && gate[0] - gate[1] / 2 < b ? a : a);
    const segs = (gate[0] - gate[1] / 2 < b && gate[0] + gate[1] / 2 > a) ? [[a, gate[0] - gate[1] / 2], [gate[0] + gate[1] / 2, b]] : [[a, b]];
    for (const [x0, x1] of segs) if (x1 - x0 > 0.3) { B.box((x0 + x1) / 2, 0.3, 0.18, x1 - x0, 2.8, 0.25, white, true); B.plane((x0 + x1) / 2, 0.16, 1.58, x1 - x0, 2.8, TM(blueBaseWall(x1 - x0 > 8 ? phrases[k++ % phrases.length] : null))); }
  }
  // portão azul aberto (dá para entrar) e placa
  B.box(gate[0] - gate[1] / 2 - 0.3, 0.3, 0.18, 0.6, 3.2, 0.6, white, true); B.box(gate[0] + gate[1] / 2 + 0.3, 0.3, 0.18, 0.6, 3.2, 0.6, white, true);
  const gp = B.box(gate[0] - gate[1] / 2 + 1.1, 1.3, 0.18, 0.12, 2.6, 2.2, blue); gp.rotation.y = 0.2;
  B.box(gate[0], 0.3, 3.0, gate[1] + 1.2, 0.9, 0.3, blue); B.plane(gate[0], 0.13, 3.45, gate[1], 0.8, TM(signTex([{ text: 'REDE LOURDINAS DE EDUCAÇÃO', font: '800 64px Arial', color: '#fff', x: 0.5, y: 0.55, align: 'center' }], '#1d55c0')));
  // bloco lateral de 3 andares atrás do muro
  const fac3 = schoolFacade(3, { glass: true });
  B.box(72, 13, 0.18, 46, 10.4, 11, [white, white, M('#cfcac0'), M('#cfcac0'), TM(fac3), TM(fac3)], true);
  B.plane(72, 13 - 5.52, 9.4, 18, 1.0, TM(signTex([{ text: 'COLÉGIO NS DE LOURDES', font: '800 70px Arial', color: '#1d55c0', x: 0.5, y: 0.55, align: 'center' }], '#f3f4f2')));
  // pátio
  B.flat(60, 9, 0.2, 110, 16, M('#a9a7a0'));
}

// ---------------------------------------------------------------- praças
function pracaCaparao(ctx) {
  // triângulo em frente ao Lourdinas: bloquete, canteiros com meio-fio vermelho e amarelo, árvores, bancos azuis
  const P = [[274, 285], [243, 264], [295, 184]];
  const blk = ctx.W.blocks.find(b => b.t.name === 'Praça Caparaó'); if (blk) blk.kind = 'custom';
  const g = new T.Shape(); P.forEach(([x, z], i) => i ? g.lineTo(x, -z) : g.moveTo(x, -z));
  const pav = new T.Mesh(new T.ShapeGeometry(g), TM(rep(paverTex(), 0.2, 0.2))); pav.rotation.x = -Math.PI / 2; pav.position.y = 0.205; pav.receiveShadow = true;
  // UV no plano (repete o bloquete)
  { const pos = pav.geometry.attributes.position, uv = pav.geometry.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getY(i) / 3); }
  pav.material.map.repeat.set(1, 1); S.add(pav);
  const st = site([243, 264], unit([243, 264], [295, 184]));
  const red = M('#c0392b'), yel = M('#e8b923'), grass = M('#6fa04a'), blueB = M('#2a62c9');
  const beds = [[12, 6, 9, 5], [30, 10, 10, 6], [50, 8, 9, 5], [70, 6, 8, 4], [22, 18, 8, 5]];
  const trees = [];
  for (const [u, w, a, b] of beds) {
    const p0 = st.W2(u, w); if (!inTri(p0, P)) continue;
    st.box(u, w, 0.18, a, 0.3, b, grass); st.box(u, w - b / 2, 0.18, a + 0.3, 0.38, 0.25, red); st.box(u, w + b / 2, 0.18, a + 0.3, 0.38, 0.25, yel); st.box(u - a / 2, w, 0.18, 0.25, 0.38, b, red); st.box(u + a / 2, w, 0.18, 0.25, 0.38, b, yel);
    trees.push(st.W2(u, w));
    st.box(u, w - b / 2 - 1.2, 0.18, 2.2, 0.45, 0.6, blueB, true);
  }
  treesIn(ctx, trees);
  ctx.landmarks.push({ x: 271, z: 254, name: 'Praça do Lourdinas', h: 4 });
}
function inTri(p, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [a, b] = P[i], [e, f] = P[j]; if ((b > p[1]) != (f > p[1]) && p[0] < (e - a) * (p[1] - b) / (f - b) + a) c = !c; } return c; }

// Praça da Maçonaria (nome oficial da Praça Itatiaia): do lado da Rua Doze fica o campo de futebol cercado por
// muro baixo azul com alambrado e refletores; do outro lado a praça de bloquete com árvores, bancos e o monumento maçônico.
function pracaMaconaria(ctx) {
  const blk = ctx.W.blocks.find(b => b.t.official_name === 'Praça da Maçonaria'); if (blk) blk.kind = 'custom';
  const st = site([-160, 209], unit([-160, 209], [-110, 242])); const { box, plane, flat } = st;
  clearTrees(ctx, inRect(st, 1, 59, 1, 38));
  // campo
  const u0 = 4, u1 = 56, w0 = 3, w1 = 36, fu = (u0 + u1) / 2, fw = (w0 + w1) / 2;
  const pitch = cv(512, 256, (g, W, H) => { g.fillStyle = '#5f9a3e'; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 64) { g.fillStyle = '#69a646'; g.fillRect(x, 0, 32, H); } g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 4; g.strokeRect(14, 14, W - 28, H - 28); g.beginPath(); g.moveTo(W / 2, 14); g.lineTo(W / 2, H - 14); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, 34, 0, 7); g.stroke(); g.strokeRect(14, H / 2 - 50, 50, 100); g.strokeRect(W - 64, H / 2 - 50, 50, 100); });
  flat(fu, fw, 0.21, u1 - u0 - 1, w1 - w0 - 1, TM(pitch));
  const blueWall = cv(512, 64, (g, W, H) => { g.fillStyle = '#3f74c4'; g.fillRect(0, 0, W, H); g.fillStyle = '#5b8bd1'; g.fillRect(0, 0, W, 6); g.font = 'italic 700 30px Arial'; g.fillStyle = 'rgba(30,30,40,.55)'; g.fillText('C.D.M', 60, 44); g.fillText('SOS', 330, 42); });
  const bwM = TM(blueWall), fence = fenceTex(), wallH = 1.3, fenceH = 3.2;
  const fenceM = new T.MeshLambertMaterial({ map: fence, transparent: true, alphaTest: 0.3, side: T.DoubleSide });
  const side = (a, b, w, alongU, gap) => { // um lado do campo; gap = [centro, largura] para a entrada
    const segs = gap ? [[a, gap[0] - gap[1] / 2], [gap[0] + gap[1] / 2, b]] : [[a, b]];
    for (const [x0, x1] of segs) { const len = x1 - x0, c = (x0 + x1) / 2; if (len < 0.3) continue;
      const m = alongU ? box(c, w, 0.18, len, wallH, 0.3, bwM, true) : box(w, c, 0.18, 0.3, wallH, len, bwM, true);
      const f = new T.Mesh(new T.PlaneGeometry(len, fenceH), fenceM.clone()); f.material.map = rep(fence, len / 1.2, fenceH / 1.2); f.position.set(alongU ? c : w, 0.18 + wallH + fenceH / 2, alongU ? w : c); if (!alongU) f.rotation.y = Math.PI / 2; st.G.add(f); }
  };
  side(u0, u1, w0, true); side(u0, u1, w1, true, [30, 2.4]); side(w0, w1, u0, false); side(w0, w1, u1, false);
  // traves e refletores
  for (const gu of [u0 + 1.2, u1 - 1.2]) { for (const s of [-1, 1]) box(gu, fw + s * 2.5, 0.2, 0.12, 2.2, 0.12, M('#f4f4f4')); box(gu, fw, 2.3, 0.12, 0.12, 5.1, M('#f4f4f4')); }
  for (const [pu, pw] of [[u0, w0], [u1, w0], [u0, w1], [u1, w1]]) { box(pu, pw, 0.18, 0.3, 11, 0.3, M('#9aa0a4'), true); box(pu, pw, 11, 1.6, 0.7, 0.5, M('#d6d9db')); }
  // praça
  flat(30, 48, 0.205, 58, 19, TM(rep(paverTex(), 58 / 3, 19 / 3)));
  const grass = M('#6fa04a'), curb = M('#f1f1ec'), trees = [];
  for (const [u, w, a, b] of [[8, 46, 9, 5], [22, 52, 9, 5], [40, 46, 8, 5], [52, 52, 8, 5], [14, 55, 6, 3]]) { box(u, w, 0.18, a, 0.25, b, grass); box(u, w, 0.18, a + 0.3, 0.32, b + 0.3, curb).scale.y = 0.3; trees.push(st.W2(u, w)); }
  treesIn(ctx, trees);
  for (const [u, w] of [[14, 42], [28, 44], [46, 41], [34, 55]]) box(u, w, 0.18, 2.2, 0.45, 0.6, M('#bdbab2'), true); // bancos de concreto
  // monumento maçônico
  const mon = cv(256, 256, (g) => { g.fillStyle = '#efeee9'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#2a2a2a'; g.fillRect(48, 40, 160, 150); g.strokeStyle = '#d4af37'; g.lineWidth = 9; g.beginPath(); g.moveTo(78, 160); g.lineTo(128, 60); g.lineTo(178, 160); g.stroke(); g.beginPath(); g.moveTo(80, 90); g.lineTo(128, 170); g.lineTo(176, 90); g.stroke(); g.font = '700 34px Georgia'; g.fillStyle = '#d4af37'; g.textAlign = 'center'; g.fillText('G', 128, 130); g.font = '600 16px Arial'; g.fillStyle = '#555'; g.fillText('LOJA 13 DE MAIO Nº 57', 128, 222); });
  box(30, 44, 0.18, 3.2, 0.4, 2.2, M('#cfccc4'), true); box(30, 44, 0.58, 2.2, 2.6, 0.9, M('#efeee9'), true); box(30, 44, 3.18, 2.5, 0.3, 1.1, M('#e2e0d8'));
  plane(30, 44 + 0.46, 1.9, 1.9, 1.9, TM(mon), 1); plane(30, 44 - 0.46, 1.9, 1.9, 1.9, TM(mon), -1);
  ctx.landmarks.push({ x: st.W2(30, 48)[0], z: st.W2(30, 48)[1], name: 'Praça da Maçonaria', h: 5 });
  ctx.landmarks.push({ x: st.W2(fu, fw)[0], z: st.W2(fu, fw)[1], name: 'Campo da Praça da Maçonaria', h: 4 });
}

// ---------------------------------------------------------------- Garfo Clube
// Av. Rio Doce, 1688: portaria de tijolinho marrom com porta de vidro e faixa preta com borda verde "Saúde Plena";
// galpão de telhado curvo cinza-escuro; muro branco comprido com o logo "GC" em verde; calçada de piso sextavado.
function garfo(ctx) {
  const st = site([615, -770], unit([615, -770], [584, -818])); const { box, plane, flat, G } = st; const L = 57;
  const white = M('#f3f4f2'), green = M('#3aa63a'), brick = M('#7a5444'), black = M('#1d1f1e');
  flat(L / 2, -5, 0.2, L + 6, 10, TM(rep(paverTex('#9a948a', '#7e786e', true), (L + 6) / 2.5, 4)));
  // muro com o logo
  const gc = cv(1024, 128, (g, W, H) => { g.fillStyle = '#f3f4f2'; g.fillRect(0, 0, W, H); g.fillStyle = '#2f9a3a'; g.font = '900 104px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GC', W * 0.5, H * 0.55); g.fillStyle = '#2b5fae'; g.fillRect(W * 0.08, 30, 120, 70); g.fillStyle = '#c0392b'; g.fillRect(W * 0.8, 30, 110, 70); });
  const ent0 = 32, ent1 = 44;
  for (const [a, b] of [[0, ent0], [ent1, L]]) { box((a + b) / 2, 0.3, 0.18, b - a, 3.0, 0.3, white, true); plane((a + b) / 2, 0.14, 1.68, b - a, 3.0, TM(gc)); }
  // portaria com passagem no meio
  const bm = new T.MeshLambertMaterial({ map: cv(256, 128, (g, W, H) => { g.fillStyle = '#7a5444'; g.fillRect(0, 0, W, H); g.strokeStyle = '#5e4034'; g.lineWidth = 2; for (let y = 0; y < H; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / 8 % 2) * 12; x < W; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } } }) });
  const pw = 2.6, bw = ent1 - ent0, half = (bw - pw) / 2;
  box(ent0 + half / 2, 2.5, 0.18, half, 3.4, 5, bm, true); box(ent1 - half / 2, 2.5, 0.18, half, 3.4, 5, bm, true); box((ent0 + ent1) / 2, 2.5, 2.9, pw, 0.7, 5, bm);
  const glassM = M('#2e3d44', { emissive: '#1a2428' }); plane(ent0 + half / 2, -0.02, 1.4, half - 1.2, 2.3, glassM);
  const band = signTex([{ text: 'Saúde Plena', font: 'italic 900 54px Arial', color: '#ffffff', x: 0.04, y: 0.5 }, { text: 'SUA SAÚDE EM PRIMEIRO LUGAR!', font: '800 34px Arial', color: '#ffffff', x: 0.4, y: 0.5 }, { text: 'GARFO CLUBE', font: '800 30px Arial', color: '#9adf3c', x: 0.86, y: 0.5 }], '#1d1f1e', 1024, 96);
  box((ent0 + ent1) / 2, -0.15, 3.4, bw + 0.6, 1.1, 0.4, black); box((ent0 + ent1) / 2, -0.38, 3.35, bw + 0.6, 0.12, 0.08, green); plane((ent0 + ent1) / 2, -0.36, 3.95, bw + 0.4, 1.0, TM(band));
  // galpão de telhado curvo
  const R = 9, gu = 53, gw2 = 14, len = 18;
  const arc = new T.Mesh(new T.CylinderGeometry(R, R, len, 24, 1, true, Math.PI / 2 - Math.PI * 0.31, Math.PI * 0.62), M('#3a3d40', { side: T.DoubleSide })); arc.rotation.z = Math.PI / 2; arc.position.set(gu, 6.6 - R, gw2); arc.castShadow = true; G.add(arc);
  for (const du of [-len / 2 + 0.5, 0, len / 2 - 0.5]) for (const s of [-1, 1]) box(gu + du, gw2 + s * R * Math.sin(Math.PI * 0.31) * 0.98, 0.18, 0.3, 6.6 - R * (1 - Math.cos(Math.PI * 0.31)) - 0.1, 0.3, M('#7d8286'), true);
  // dentro: piscina, quiosques e guarda-sóis
  const pool = new T.Mesh(new T.PlaneGeometry(22, 10), M('#3fb6d6', { emissive: '#0d3f4a' })); pool.rotation.x = -Math.PI / 2; pool.position.set(26, 0.26, 32); G.add(pool);
  box(26, 32, 0.18, 23, 0.12, 11, M('#e9e4d8'));
  for (const [u, w, c] of [[12, 22, '#e8b923'], [40, 24, '#c0392b'], [18, 44, '#2a62c9'], [36, 44, '#e8b923']]) { box(u, w, 0.18, 0.12, 2.6, 0.12, M('#ddd')); const um = new T.Mesh(new T.ConeGeometry(1.9, 0.8, 8), M(c)); um.position.set(u, 3.0, w); G.add(um); }
}

// ---------------------------------------------------------------- Praça Itatiaia (a da quadra, ao lado da Maçonaria)
// Street View: piso de bloquete com caminhos curvos, canteiros redondos de grama com árvores, postes altos,
// quadra poliesportiva de cimento cercada por alambrado (basquete/futsal), pista de skate e academia ao ar livre.
const inPoly = (p, P) => inTri(p, P);
function worldShape(P, y, mat, uvScale = 3) {
  const s = new T.Shape(); P.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z));
  const g = new T.ShapeGeometry(s); const pos = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getY(i) / uvScale);
  const m = new T.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; S.add(m); return m;
}
function wbox(x, z, y, sx, sy, sz, yaw, mat, solid) { const m = new T.Mesh(UB, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = yaw; m.castShadow = true; S.add(m); if (solid) OB({ x, z, w: sx, d: sz, ex: [Math.cos(yaw), -Math.sin(yaw)], nx: [Math.sin(yaw), Math.cos(yaw)] }); return m; }
function fencePoly(P, h, gapEdge = -1, gapW = 2.4) {
  const fence = fenceTex(), postM = M('#8d9397');
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], yaw = Math.atan2(-e[1], e[0]);
    const segs = i === gapEdge ? [[0, L / 2 - gapW / 2], [L / 2 + gapW / 2, L]] : [[0, L]];
    for (const [t0, t1] of segs) { const len = t1 - t0, c = (t0 + t1) / 2, x = a[0] + e[0] * c, z = a[1] + e[1] * c;
      const f = new T.Mesh(new T.PlaneGeometry(len, h), new T.MeshLambertMaterial({ map: rep(fence, len / 1.2, h / 1.2), transparent: true, alphaTest: 0.3, side: T.DoubleSide }));
      f.position.set(x, 0.2 + h / 2, z); f.rotation.y = yaw; S.add(f);
      OB({ x, z, w: len, d: 0.3, ex: e, nx: [-e[1], e[0]] });
      for (let t = t0; t <= t1 + 0.01; t += Math.max(2.5, len / Math.ceil(len / 3))) wbox(a[0] + e[0] * t, a[1] + e[1] * t, 0.2, 0.1, h, 0.1, yaw, postM);
      wbox(x, z, 0.2 + h - 0.05, len, 0.08, 0.08, yaw, postM); }
  }
}
function pracaItatiaia(ctx) {
  const B = [[-76, 333], [-126, 300], [-95, 252], [-45, 285]];
  const blk = ctx.W.blocks.find(b => b.t.name === 'Praça Itatiaia' && !b.t.official_name); if (blk) blk.kind = 'custom';
  const court = [[-117, 283], [-101, 279], [-95, 305], [-112, 309]], skate = [[-80, 328], [-74, 326], [-77, 305], [-77, 295], [-76, 289], [-77, 285], [-79, 282], [-82, 281], [-88, 282], [-92, 286], [-89, 299], [-88, 306], [-85, 307], [-83, 315]];
  const fit = [-64, 298], garden = [-62, 286];
  clearTrees(ctx, p => inPoly(p, court) || inPoly(p, skate) || Math.hypot(p[0] - fit[0], p[1] - fit[1]) < 7);
  worldShape(B, 0.205, TM(paverTex()));
  // quadra poliesportiva
  const cc = centroid4(court), ce = unit(court[0], court[1]), cyaw = Math.atan2(-ce[1], ce[0]);
  const cl = Math.hypot(court[1][0] - court[0][0], court[1][1] - court[0][1]), cw = Math.hypot(court[3][0] - court[0][0], court[3][1] - court[0][1]);
  const lines = cv(512, 256, (g, W, H) => { g.fillStyle = '#7f8d96'; g.fillRect(0, 0, W, H); g.strokeStyle = '#f2f2f2'; g.lineWidth = 4; g.strokeRect(16, 16, W - 32, H - 32); g.beginPath(); g.moveTo(W / 2, 16); g.lineTo(W / 2, H - 16); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, 36, 0, 7); g.stroke(); g.strokeStyle = '#e8b923'; g.beginPath(); g.arc(16, H / 2, 70, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(W - 16, H / 2, 70, Math.PI / 2, Math.PI * 1.5); g.stroke(); });
  { const f = new T.Mesh(new T.PlaneGeometry(cw - 1, cl - 1), TM(lines)); f.rotation.x = -Math.PI / 2; f.rotation.z = cyaw - Math.PI / 2; f.position.set(cc[0], 0.24, cc[1]); S.add(f); }
  fencePoly(court, 4, 1);
  // tabelas de basquete e traves de futsal nas pontas (lados curtos: arestas 0 e 2)
  for (const [i, j] of [[0, 1], [2, 3]]) {
    const m = [(court[i][0] + court[j][0]) / 2, (court[i][1] + court[j][1]) / 2], inward = [cc[0] - m[0], cc[1] - m[1]], L = Math.hypot(...inward), n = [inward[0] / L, inward[1] / L];
    const yaw = Math.atan2(-ce[1], ce[0]), p = [m[0] + n[0] * 0.8, m[1] + n[1] * 0.8];
    wbox(p[0], p[1], 0.2, 0.15, 3.0, 0.15, yaw, M('#6d7377'), true); wbox(p[0] + n[0] * 0.4, p[1] + n[1] * 0.4, 2.9, 1.8, 1.05, 0.08, yaw, M('#f4f4f4'));
    const ring = new T.Mesh(new T.TorusGeometry(0.23, 0.025, 6, 16), M('#e0662a')); ring.rotation.x = Math.PI / 2; ring.position.set(p[0] + n[0] * 0.75, 3.05, p[1] + n[1] * 0.75); S.add(ring);
    for (const s of [-1, 1]) wbox(m[0] + n[0] * 0.3 + ce[0] * s * 1.5, m[1] + n[1] * 0.3 + ce[1] * s * 1.5, 0.2, 0.08, 2, 0.08, yaw, M('#f4f4f4'));
    wbox(m[0] + n[0] * 0.3, m[1] + n[1] * 0.3, 2.15, 3.0, 0.08, 0.08, yaw, M('#f4f4f4'));
  }
  // pista de skate: piso de concreto, caixote, corrimão e rampas
  worldShape(skate, 0.23, M('#b5b2aa'));
  const sc = centroid4(skate);
  wbox(sc[0], sc[1] - 6, 0.23, 3, 0.5, 1.2, 0.3, M('#9d9a92'), true);
  wbox(sc[0] + 1, sc[1] + 4, 0.75, 4, 0.06, 0.06, 1.4, M('#c9c9c9')); for (const s of [-1, 1]) wbox(sc[0] + 1 + s * 0.3, sc[1] + 4 + s * 1.9, 0.23, 0.06, 0.55, 0.06, 1.4, M('#c9c9c9'));
  for (const [x, z, yaw] of [[-80, 324, 1.35], [-86, 287, -0.2]]) { const r = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 4, 12, 1, false, 0, Math.PI / 2), M('#a8a59d')); r.rotation.set(0, yaw, Math.PI / 2); r.position.set(x, 0.23, z); S.add(r); }
  // academia ao ar livre (aparelhos verdes e amarelos)
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = fit[0] + Math.cos(a) * 3.6, z = fit[1] + Math.sin(a) * 3.6;
    wbox(x, z, 0.2, 0.14, 1.6, 0.14, a, M('#2f8a3a'), true); wbox(x, z, 1.55, 1.2, 0.1, 0.1, a, M('#e8b923')); wbox(x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5, 0.5, 0.5, 0.08, 0.35, a, M('#e8b923')); }
  // canteiros redondos de grama com árvores, postes altos e bancos
  const grass = M('#6fa04a'), curb = M('#ecebe6'), trees = [];
  for (const p of [garden, [-100, 263], [-86, 262], [-70, 320], [-110, 318]]) {
    if (!inPoly(p, B)) continue;
    const g = new T.Mesh(new T.CylinderGeometry(3.4, 3.4, 0.3, 20), grass); g.position.set(p[0], 0.33, p[1]); S.add(g);
    const c = new T.Mesh(new T.TorusGeometry(3.45, 0.14, 4, 24), curb); c.rotation.x = Math.PI / 2; c.position.set(p[0], 0.45, p[1]); S.add(c);
    trees.push(p);
  }
  treesIn(ctx, trees);
  for (const [x, z] of [[-90, 272], [-66, 310], [-104, 292]]) { wbox(x, z, 0.2, 0.25, 12, 0.25, 0, M('#a0a5a8'), true); wbox(x, z, 12, 1.4, 0.6, 0.45, 0.5, M('#dfe2e4')); }
  for (const [x, z, yaw] of [[-94, 266, 0.6], [-72, 290, 2.1], [-60, 312, 0.6]]) wbox(x, z, 0.2, 2.2, 0.45, 0.6, yaw, M('#bdbab2'), true);
  ctx.landmarks.push({ x: -85, z: 292, name: 'Praça Itatiaia (quadra)', h: 5 });
}
function centroid4(P) { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; }

// ---------------------------------------------------------------- Rua Doze 592 e 592A
// Foto do Street View (jan/2025), da esquerda para a direita (= sentido sudoeste → nordeste da rua):
// 592A: muro branco com portão de correr grande roxo-escuro de lâminas verticais e grade em losango em cima, "592A" em metal;
// 592: frente revestida de porcelanato bege marmorizado, "592" em metal, porta estreita de alumínio preto com vidro,
// porta de enrolar preta larga, piso de cerâmica bege na calçada; em cima um sobrado branco com varanda de grade preta,
// janelas pretas com grade e antena parabólica; concertina (arame farpado) em cima dos dois muros; lixeira suspensa preta.
function minhaCasa(ctx) {
  const st = site([-131.62, 135.84], [-0.541, 0.841]); const { box, plane, flat, G } = st;
  clearTrees(ctx, inRect(st, 0, 16, -2.5, 14));
  const marble = cv(256, 256, (g, W, H) => {
    g.fillStyle = '#dccab6'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${200 + Math.random() * 30 | 0},${180 + Math.random() * 30 | 0},${160 + Math.random() * 30 | 0},0.25)`; g.fillRect(Math.random() * W, Math.random() * H, 6 + Math.random() * 18, 2 + Math.random() * 6); }
    g.strokeStyle = 'rgba(150,120,100,0.35)'; g.lineWidth = 1.5; for (let k = 0; k < 7; k++) { g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (Math.random() - 0.3) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = '#c9b6a2'; g.lineWidth = 2; for (let x = 0; x <= W; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y <= H; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  });
  marble.wrapS = marble.wrapT = T.RepeatWrapping;
  const mar = (w, h) => TM(rep(marble, w / 1.2, h / 1.2));
  const rollDoor = cv(128, 128, (g, W, H) => { g.fillStyle = '#2b2d30'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 5) { g.fillStyle = '#3b3e42'; g.fillRect(0, y, W, 1); g.fillStyle = '#1e2022'; g.fillRect(0, y + 3, W, 1); } g.fillStyle = '#454a4f'; g.fillRect(W / 2 - 10, H - 18, 20, 5); });
  const gateTex = cv(256, 128, (g, W, H) => { g.fillStyle = '#2d2733'; g.fillRect(0, 0, W, H); g.fillStyle = '#3c3444'; for (let x = 0; x < W; x += 9) g.fillRect(x, H * 0.16, 3, H); g.fillStyle = '#231e29'; g.fillRect(0, H * 0.14, W, 4); g.strokeStyle = '#3f3747'; g.lineWidth = 3; for (let x = -40; x < W + 40; x += 18) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, H * 0.14); g.stroke(); g.beginPath(); g.moveTo(x + 18, 0); g.lineTo(x, H * 0.14); g.stroke(); } g.fillStyle = '#5a5a5a'; g.fillRect(W * 0.8, H * 0.45, 22, 5); });
  const digits = (txt) => { const t = cv(256, 96, (g, W, H) => { g.clearRect(0, 0, W, H); g.font = 'italic 600 68px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(txt, W / 2 + 3, H / 2 + 4); g.fillStyle = '#c8ccd1'; g.fillText(txt, W / 2, H / 2); }); return new T.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.2 }); };
  const winTex = cv(128, 128, (g, W, H) => { g.fillStyle = '#16181a'; g.fillRect(0, 0, W, H); g.fillStyle = '#2f3a40'; g.fillRect(8, 8, W - 16, H - 16); g.fillStyle = '#16181a'; for (let x = 8; x < W; x += 16) g.fillRect(x, 8, 4, H - 16); g.fillRect(8, H / 2 - 2, W - 16, 4); });
  const white = M('#f1f0ec'), whiteDirty = M('#e7e4dd'), black = M('#18191b'), alu = M('#1f2124'), glass = M('#2f3d44', { emissive: '#0f1416' }), grayCap = M('#cfc9c0');

  // ---------- 592 (u 1.2 → 9.6)
  const a0 = 1.2, a1 = 9.6, H0 = 3.0;
  // piso de cerâmica bege da calçada/rampa
  flat((a0 + a1) / 2, -1.25, 0.215, a1 - a0, 2.5, TM(rep(cv(64, 64, (g) => { g.fillStyle = '#e6dccd'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#cfc3b2'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); }), (a1 - a0) / 0.45, 2.5 / 0.45)));
  // frente: pilar direito, porta de enrolar, pilar, porta de pedestre, pilar com o número
  const seg = (u0, u1, y0, y1) => { box((u0 + u1) / 2, 0.15, y0, u1 - u0, y1 - y0, 0.3, mar(u1 - u0, y1 - y0), true); };
  seg(a0, 2.0, 0.18, 4.0);            // pilar da direita (sobe até a mureta)
  seg(2.0, 6.6, 2.75, 4.0);           // em cima da porta de enrolar
  seg(6.6, 7.0, 0.18, H0);            // pilar entre as portas
  seg(7.0, 8.0, 2.45, H0);            // em cima da porta de pedestre
  seg(8.0, a1, 0.18, H0);             // pilar com o número
  // porta de enrolar preta (com o tambor em cima)
  box(4.3, 0.22, 0.18, 4.6, 2.57, 0.08, TM(rollDoor), true);
  // porta estreita de alumínio preto com vidro, um pouco recuada
  box(7.5, 0.55, 0.18, 1.0, 2.27, 0.06, glass, true); for (const du of [-0.47, 0.47]) box(7.5 + du, 0.52, 0.18, 0.07, 2.27, 0.1, alu); box(7.5, 0.52, 2.38, 1.0, 0.07, 0.1, alu); box(7.5, 0.52, 1.2, 1.0, 0.05, 0.1, alu);
  for (const du of [-0.5, 0.5]) box(7.5 + du, 0.3, 0.18, 0.05, 2.3, 0.5, mar(0.5, 2.3)); // laterais do recuo
  // "592", interfone e luminária
  if (!ctx.public) plane(8.75, -0.02, 1.95, 0.9, 0.34, digits('592'));
  box(9.2, -0.04, 1.35, 0.16, 0.24, 0.06, black); box(8.3, -0.05, 2.65, 0.22, 0.12, 0.1, M('#e8e8e8'));
  // corpo do térreo (atrás do muro)
  box((a0 + a1) / 2, 7.6, 0.18, a1 - a0, H0, 12.6, white, true); // começa atrás do recuo da porta
  box(7.5, 1.15, 0.18, 1.0, 2.3, 0.02, M('#3a3530')); // fundo escuro do hall de entrada
  // sobrado branco recuado: varanda com grade preta à esquerda, mureta revestida à direita
  const up0 = 1.1, upY = 0.18 + H0;
  box((a0 + a1) / 2, up0 + 5.5, upY, a1 - a0, 2.9, 11, white, true);
  const win = TM(winTex); for (const wu of [3.4, 5.7, 7.8]) plane(wu, up0 - 0.02, upY + 1.6, wu === 3.4 ? 1.4 : 1.2, 1.15, win);
  box((a0 + a1) / 2, (up0 + 0.3) / 2 + 0.15, upY - 0.05, a1 - a0, 0.12, up0, M('#d8d4cc')); // laje da varanda
  for (let u = 6.7; u <= a1 - 0.1; u += 0.13) box(u, 0.35, upY + 0.02, 0.035, 0.95, 0.035, black); // grade vertical
  box((6.7 + a1) / 2, 0.35, upY + 0.95, a1 - 6.7, 0.05, 0.05, black); box((6.7 + a1) / 2, 0.35, upY + 0.55, a1 - 6.7, 0.04, 0.04, black);
  box((6.7 + a1) / 2, 0.3, upY + 1.12, a1 - 6.7, 0.06, 0.06, M('#5b5e62')); // cano horizontal
  // laje/telhado com beiral e antena parabólica
  box((a0 + a1) / 2 + 0.2, up0 + 5.4, upY + 2.9, a1 - a0 + 0.6, 0.22, 11.6, M('#e9e7e2'));
  { const dish = new T.Mesh(new T.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), M('#9a9da0', { side: T.DoubleSide })); dish.rotation.x = -Math.PI / 2.6; dish.position.set(8.9, upY + 3.4, up0 + 0.6); G.add(dish); box(8.9, up0 + 0.9, upY + 3.1, 0.05, 0.4, 0.05, M('#777')); }

  // ---------- 592A (u 9.6 → 15.0)
  const b0 = a1, b1 = 15.0, HA = 2.85;
  box(b0 + 0.35, 0.15, 0.18, 0.7, HA, 0.3, whiteDirty, true);        // pilar com "592A"
  box(b1 - 0.25, 0.15, 0.18, 0.5, HA, 0.3, whiteDirty, true);
  box((b0 + 0.7 + b1 - 0.5) / 2, 0.15, 2.6, b1 - 0.5 - b0 - 0.7, HA - 2.42, 0.3, whiteDirty); // verga em cima do portão
  box((b0 + 0.7 + b1 - 0.5) / 2, 0.24, 0.2, b1 - 0.5 - b0 - 0.7, 2.4, 0.07, TM(gateTex), true); // portão de correr
  box(b0 + 1.6, 0.19, 1.25, 0.32, 0.07, 0.03, M('#4a4a4a')); // fenda de correio
  if (!ctx.public) plane(b0 + 0.35, -0.02, 2.05, 0.66, 0.28, digits('592A'));
  box(b0 + 0.35, -0.04, 1.5, 0.12, 0.18, 0.06, black);
  box((b0 + b1) / 2, 7, 0.18, b1 - b0, 3.1, 12, white, true); // casa atrás do muro
  box((b0 + b1) / 2, 7, 3.28, b1 - b0 + 0.3, 0.18, 12.3, M('#e9e7e2'));
  // ---------- concertina em cima dos dois muros
  const rings = []; for (let u = a0 + 0.15; u < b1; u += 0.3) rings.push([u, u < a1 ? (u < 2.0 ? 4.0 : u < 6.6 ? 4.0 : H0) : HA]);
  const rm = new T.InstancedMesh(new T.TorusGeometry(0.22, 0.012, 3, 14), M('#9ea3a8'), rings.length); const q = new T.Object3D();
  rings.forEach(([u, top], i) => { q.position.set(u, 0.18 + top + 0.24, 0.15); q.rotation.set(0, Math.PI / 2 + (i % 2 ? 0.25 : -0.25), 0); q.updateMatrix(); rm.setMatrixAt(i, q.matrix); }); G.add(rm);
  for (let u = a0 + 0.2; u < b1; u += 1.6) box(u, 0.15, 0.18 + (u < a1 ? (u < 6.6 ? 4.0 : H0) : HA), 0.03, 0.5, 0.03, M('#7d8186'));
  // ---------- lixeira suspensa preta na calçada
  box(10.9, -1.7, 0.2, 0.06, 1.0, 0.06, black); box(10.9, -1.7, 1.15, 0.7, 0.38, 0.45, M('#1c1d1f'));
  // calçada da 592A (cimento)
  flat((b0 + b1) / 2, -1.25, 0.212, b1 - b0, 2.5, M('#b7b1a6'));
  // na versão da internet a placa com o endereço não aparece (privacidade)
  if (!ctx.public) ctx.landmarks.push({ x: st.W2(9.6, 3)[0], z: st.W2(9.6, 3)[1], name: 'Rua Doze 592 / 592A', h: 7.5 });
}

// ---------------------------------------------------------------- Coelho Diniz (Av. Piracicaba, 14)
// Fotos do jogador (Street View, jan/2025), andando pela Av. Piracicaba do norte para o sul:
// esquina com bloco azul-marinho e o emblema "CD"; loja com fachada de vidro espelhado (grade azulada) de dois andares,
// térreo de vitrine com caixilho preto, faixa amarela e marquise preta; depois um paredão comprido de placas de
// concreto cinza com pilares, faixa escura com aberturas (estacionamento de cima) e faixa amarela no alto com
// "Coelho Diniz" e "CD" grandes em azul-marinho, refletores em braços no topo; no fim, a entrada amarela do
// estacionamento ("ESTACIONAMENTO PARA CLIENTES", SAÍDA / ENTRADA); painel de ofertas num poste perto da loja.
function coelho(ctx, s) {
  const P = s.P;
  // fachada = lado comprido mais perto da Av. Piracicaba; u começa na ponta norte
  let fi = 0, fd = 1e9;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 60) continue; const nr = ctx.nearestRoad((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 80, r => /Piracicaba/.test(r.t.name || '')); const d = nr ? nr.d : 1e8; if (d < fd) { fd = d; fi = i; } }
  let A = P[fi], Bp = P[(fi + 1) % P.length]; if (Bp[1] < A[1]) [A, Bp] = [Bp, A];
  const L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]); let e = [(Bp[0] - A[0]) / L, (Bp[1] - A[1]) / L];
  const C = centroid4(P); let flip = false; if ((C[0] - A[0]) * -e[1] + (C[1] - A[1]) * e[0] < 0) flip = true; // n tem de apontar para dentro
  // com flip, o sistema local é espelhado: usamos a outra ponta e invertemos u
  const O = flip ? Bp : A, E = flip ? [-e[0], -e[1]] : e; const st = site(O, E); const U = u => flip ? L - u : u;
  const { box, plane, G } = st; const H = 14;
  const navy = M('#1c2c5c'), yellow = M('#f0c419', { emissive: '#6b5508' }), black = M('#121314'), dark = M('#2a2d31');
  const panel = cv(256, 128, (g, W, Hh) => { g.fillStyle = '#c9c8c2'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#b6b5af'; for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 2, Hh); for (let y = 0; y < Hh; y += 42) g.fillRect(0, y, W, 2); for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(120,120,115,0.12)'; g.fillRect(Math.random() * W, Math.random() * Hh, 3, 10 + Math.random() * 20); } });
  panel.wrapS = panel.wrapT = T.RepeatWrapping;
  const glassCW = cv(256, 256, (g, W, Hh) => { const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#b9d4ee'); gr.addColorStop(0.55, '#7ea6cf'); gr.addColorStop(1, '#4f6f8f'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh); for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(Math.random() * W, Math.random() * Hh * 0.6, 30 + Math.random() * 40, 10 + Math.random() * 14, 0, 0, 7); g.fill(); } g.fillStyle = 'rgba(70,110,60,0.35)'; g.fillRect(0, Hh * 0.62, W, Hh * 0.2); g.strokeStyle = '#2e3f52'; g.lineWidth = 3; for (let x = 0; x <= W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); } for (let y = 0; y <= Hh; y += 43) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } });
  glassCW.wrapS = T.RepeatWrapping;
  const brand = (w, withLogo = true) => cv(2048, 256, (g, W, Hh) => { g.fillStyle = '#f0c419'; g.fillRect(0, 0, W, Hh); let x = W * 0.06;
    if (withLogo) { g.fillStyle = '#e9e4d2'; g.beginPath(); g.roundRect(x, 40, 170, 170, 34); g.fill(); g.fillStyle = '#1c2c5c'; g.beginPath(); g.roundRect(x + 12, 52, 146, 146, 26); g.fill(); g.font = 'italic 900 104px Arial Black, Arial'; g.fillStyle = '#e9e4d2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CD', x + 85, 128); x += 230; }
    g.font = 'italic 900 170px Arial Black, Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#8fa8d8'; g.strokeText('Coelho Diniz', x, 136); g.fillStyle = '#1c2c5c'; g.fillText('Coelho Diniz', x, 136); });
  const front = (u0, u1, y0, y1, w, mat, solid) => { const c = U((u0 + u1) / 2); return box(c, w, y0, u1 - u0, y1 - y0, 0.5, mat, solid); };
  const fplane = (u0, u1, y, h, mat, w = -0.02) => plane(U((u0 + u1) / 2), w, y, u1 - u0, h, mat);
  // ---- calçada de cimento em toda a frente (com meio-fio)
  { const cal = cv(128, 128, (g, W, Hh) => { g.fillStyle = '#c3beb3'; g.fillRect(0, 0, W, Hh); for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${85 + Math.random() * 60 | 0},0.15)`; g.fillRect(Math.random() * W, Math.random() * Hh, 2, 2); } g.fillStyle = '#a9a499'; g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, Hh); });
    cal.wrapS = cal.wrapT = T.RepeatWrapping;
    box(U(L / 2), -1.35, 0.0, L + 2, 0.15, 2.7, new T.MeshLambertMaterial({ map: rep(cal, (L + 2) / 1.5, 2.7 / 1.5) }));
    box(U(L / 2), -2.65, 0.0, L + 2, 0.16, 0.18, M('#d9d6cf')); } // meio-fio
  // ---- esquina azul-marinho com o emblema
  front(0, 6, 0.18, H + 0.6, 0.25, navy, true); box(U(3), 6, 0.18, 6, H + 0.6, 11.5, navy, true);
  front(0, 6, 0.18, 3.4, -0.05, yellow);
  const emb = cv(256, 256, (g) => { g.fillStyle = '#1c2c5c'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e9e4d2'; g.beginPath(); g.roundRect(38, 38, 180, 180, 40); g.fill(); g.fillStyle = '#1c2c5c'; g.beginPath(); g.roundRect(52, 52, 152, 152, 30); g.fill(); g.font = 'italic 900 110px Arial Black, Arial'; g.fillStyle = '#e9e4d2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CD', 128, 132); });
  fplane(0.6, 5.4, 11.2, 4.8, TM(emb), -0.06);
  // ---- loja com fachada de vidro
  const g0 = 6, g1 = 42, door0 = 22, door1 = 26;
  const vit = cv(512, 128, (g, W, Hh) => { g.fillStyle = '#20262b'; g.fillRect(0, 0, W, Hh); for (let k = 0; k < 40; k++) { g.fillStyle = ['#c0392b', '#f2c618', '#3f8f4a', '#e7e1d0', '#2b5fae'][k % 5]; g.fillRect(Math.random() * W, 50 + Math.random() * 60, 6 + Math.random() * 14, 8 + Math.random() * 20); } g.fillStyle = 'rgba(255,255,240,0.25)'; g.fillRect(0, 10, W, 12); g.fillStyle = '#111'; for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 6, Hh); });
  const vm = new T.MeshLambertMaterial({ map: vit, emissive: '#2a2a22', emissiveMap: vit });
  for (const [a, b] of [[g0, door0], [door1, g1]]) { fplane(a, b, 1.8, 3.2, vm, 0.05); front(a, b, 0.18, 0.4, 0.12, black, true); }
  for (let u = g0; u <= g1 + 0.01; u += 3) front(u - 0.1, u + 0.1, 0.18, 3.6, 0.1, black);
  front(g0, g1, 3.05, 3.2, -0.02, M('#c6d62a')); // fita amarelo-limão
  front(g0, g1, 3.6, 4.2, -1.2, black).scale.z = 2.6; // marquise preta
  { const cw = new T.MeshLambertMaterial({ map: rep(glassCW, (g1 - g0) / 8, 1), emissive: '#1d2a38' }); fplane(g0, g1, 4.2 + (H - 4.2) / 2, H - 4.2, cw, -0.05); front(g0, g1, 4.2, H, 0.25, dark, false); }
  front(g0, g1, H, H + 0.6, 0.1, M('#d9dcdf'));
  // corpo da loja atrás do vidro (paredes laterais e topo) + colisão do vidro
  box(U((g0 + g1) / 2), 0.25, 0.18, 0.1, 0.1, 0.1, black); // marcador
  for (const [a, b] of [[g0, door0], [door1, g1]]) { const p = st.W2(U((a + b) / 2), 0.3); ctx.addObstacle({ x: p[0], z: p[1], w: b - a, d: 0.6, ex: E, nx: st.n }); }
  // ---- paredão: placas de concreto, faixa escura com aberturas, faixa amarela com o nome e refletores
  const w0 = g1, pk0 = 118, pk1 = 126, hGray = 8, hDark = 9.6;
  const grayM = (len) => new T.MeshLambertMaterial({ map: rep(panel, len / 6, hGray / 4), emissive: '#3a3a36' });
  for (const [a, b] of [[w0, pk0], [pk1, L]]) { if (b - a < 0.5) continue; front(a, b, 0.18, hGray, 0.25, grayM(b - a), true); }
  front(pk0, pk1, 4.6, hGray, 0.25, grayM(pk1 - pk0));
  for (let u = w0 + 6; u < L - 1; u += 6) front(u - 0.35, u + 0.35, 0.18, hGray, -0.15, M('#bdbcb6'));
  front(w0, L, hGray, hDark, 0.25, dark);
  for (let u = w0 + 3; u < L - 3; u += 6) fplane(u - 1.6, u + 1.6, (hGray + hDark) / 2, 1.1, M('#0d0e10'), -0.04);
  front(w0, L, hDark, H, 0.25, yellow, true);
  for (const [a, b] of [[w0 + 16, w0 + 76], [L - 64, L - 8]]) if (b - a > 20) fplane(a, b, (hDark + H) / 2, (H - hDark) * 0.86, new T.MeshBasicMaterial({ map: brand(), transparent: false }), -0.08);
  for (let u = w0 + 4; u < L; u += 7) { const arm = front(u - 0.05, u + 0.05, H + 0.1, H + 1.3, -0.8, M('#d2d4d6')); arm.rotation.x = 0.6; front(u - 0.3, u + 0.3, H + 1.0, H + 1.25, -1.5, M('#f4f4f2')); }
  // entrada do estacionamento
  box(U((pk0 + pk1) / 2), 3, 0.18, pk1 - pk0, 4.4, 0.2, M('#24272b')); for (const s2 of [-1, 1]) box(U((pk0 + pk1) / 2 + s2 * (pk1 - pk0) / 2), 1.5, 0.18, 0.5, 4.6, 3, yellow, true);
  front(pk0 - 0.3, pk1 + 0.3, 4.4, 5.6, -0.1, yellow);
  fplane(pk0 - 0.2, pk1 + 0.2, 5.0, 1.0, TM(signTex([{ text: 'SAÍDA', font: '800 60px Arial', color: '#f0c419', x: 0.25, y: 0.55, align: 'center' }, { text: 'ENTRADA', font: '800 60px Arial', color: '#f0c419', x: 0.72, y: 0.55, align: 'center' }], '#1c2c5c')), -0.22);
  fplane(pk0 - 2.5, pk0 - 0.6, 3.6, 1.1, TM(signTex([{ text: 'ESTACIONAMENTO', font: '800 44px Arial', color: '#1c2c5c', x: 0.5, y: 0.35, align: 'center' }, { text: 'PARA CLIENTES', font: '800 44px Arial', color: '#1c2c5c', x: 0.5, y: 0.75, align: 'center' }], '#f0c419', 512, 128)), -0.05);
  // painel de ofertas num poste, perto da loja
  { const pu = U(g1 + 2), p = st.W2(pu, -2.2); box(pu, -2.2, 0.18, 0.4, 9, 0.4, M('#7d8186'), true);
    const bt = cv(512, 256, (g, W, Hh) => { g.fillStyle = '#16181b'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#f0c419'; g.font = '800 46px Arial'; g.textAlign = 'center'; g.fillText('OFERTA DA SEMANA', W / 2, 62); g.font = '900 120px Arial'; g.fillText('3,49', W / 2, 200); });
    const bd = box(pu, -2.6, 8.4, 7, 3.6, 0.3, [black, black, black, black, black, black]); const bp = plane(pu, -2.78, 10.2, 6.6, 3.2, new T.MeshBasicMaterial({ map: bt })); }
  // outros lados: concreto cinza e faixa amarela
  for (let i = 0; i < P.length; i++) {
    if (i === fi) continue; const a = P[i], b = P[(i + 1) % P.length], Ls = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Ls < 0.5) continue;
    const es = [(b[0] - a[0]) / Ls, (b[1] - a[1]) / Ls], yaw = Math.atan2(-es[1], es[0]);
    const seg2 = (y0, y1, mat) => { const m = new T.Mesh(UB, mat); m.position.set((a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2); m.scale.set(Ls, y1 - y0, 0.5); m.rotation.y = yaw; m.castShadow = true; S.add(m); };
    seg2(0.18, hGray, grayM(Ls)); seg2(hGray, hDark, dark); seg2(hDark, H, yellow);
    ctx.addObstacle({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, w: Ls, d: 0.8, ex: es, nx: [-es[1], es[0]] });
  }
  { const sh = new T.Shape(); P.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); const rf = new T.Mesh(new T.ShapeGeometry(sh), M('#d8d5c8')); rf.rotation.x = -Math.PI / 2; rf.position.y = H; S.add(rf); }
  // interior: atrás da porta da loja de vidro
  const Wd = 34, D = 36, du = U((door0 + door1) / 2), ic = st.W2(du, 0.6 + D / 2), dp = st.W2(du, -2), out = [-st.n[0], -st.n[1]];
  ctx.enterables.push({ x: dp[0], z: dp[1], out, name: 'Coelho Diniz - Ilha dos Araújos', kind: 'coelho', cat: 'Supermercado', seed: 3, cx: ic[0], cz: ic[1], th: Math.atan2(out[0], out[1]), W: Wd, D, y0: 0.19 });
}

export function buildLugares(ctx, kind, arg) {
  if (kind === 'coelho') { T = ctx.THREE; S = ctx.scene; OB = ctx.addObstacle; UB = ctx.unitBox; coelho(ctx, arg); return; }
  T = ctx.THREE; S = ctx.scene; OB = ctx.addObstacle; UB = ctx.unitBox;
  if (kind === 'nacle') nacle(ctx);
  else if (kind === 'lourdes') lourdes(ctx);
  else if (kind === 'garfo') garfo(ctx);
  else if (kind === 'pracas') { pracaMaconaria(ctx); pracaCaparao(ctx); pracaItatiaia(ctx); minhaCasa(ctx); }
}
