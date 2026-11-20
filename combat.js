// Armas, mira, tiros, algemas, vida, inventário ('), roda de armas (Tab) e console escondido (F8).
export const WEAPONS = {
  pistola: { nome: 'Pistola', dmg: 25, rate: 0.28, mag: 12, range: 90, spread: 0.012, auto: false, reload: 1.3, two: false, snd: [0.10, 1500, 0.7] },
  fuzil: { nome: 'Fuzil', dmg: 28, rate: 0.11, mag: 30, range: 170, spread: 0.02, auto: true, reload: 2.0, two: true, snd: [0.13, 900, 0.8] },
  awm: { nome: 'AWM', dmg: 100, rate: 1.4, mag: 5, range: 700, spread: 0, auto: false, reload: 3.0, two: true, scope: true, snd: [0.4, 420, 1] },
  algema: { nome: 'Algemas', melee: true },
};
export const WIDS = ['', 'pistola', 'fuzil', 'awm', 'algema'];

// ---------------------------------------------------------------- modelos das armas
export function makeWeaponMesh(T, id) {
  const G = new T.Group(), M = c => new T.MeshLambertMaterial({ color: c });
  const box = (w, h, d, x, y, z, m) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); G.add(b); return b; };
  const dark = M('#1f2124'), metal = M('#4a4e53');
  if (id === 'pistola') { box(0.05, 0.08, 0.22, 0, 0.02, 0.06, dark); box(0.045, 0.13, 0.06, 0, -0.07, 0.0, M('#2a2522')); }
  if (id === 'fuzil') { box(0.06, 0.09, 0.7, 0, 0.02, 0.22, dark); box(0.04, 0.04, 0.3, 0, 0.04, 0.68, metal); box(0.045, 0.16, 0.08, 0, -0.08, 0.2, dark); box(0.05, 0.1, 0.22, 0, -0.01, -0.2, M('#3a3530')); box(0.04, 0.12, 0.05, 0, -0.07, 0.05, M('#2a2522')); }
  if (id === 'awm') { const g = M('#4b5320'); box(0.07, 0.09, 0.95, 0, 0.02, 0.3, g); box(0.035, 0.035, 0.45, 0, 0.03, 0.95, dark); box(0.06, 0.13, 0.28, 0, -0.03, -0.26, g);
    const sc = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.38, 10).rotateX(Math.PI / 2), dark); sc.position.set(0, 0.12, 0.28); G.add(sc); box(0.045, 0.1, 0.05, 0, -0.07, 0.08, M('#2a2522')); }
  if (id === 'algema') { for (const s of [-1, 1]) { const r = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 6, 14), M('#c7cbcf')); r.position.set(s * 0.06, 0, 0.05); r.rotation.y = Math.PI / 2; G.add(r); } box(0.06, 0.012, 0.012, 0, 0, 0.05, M('#c7cbcf')); }
  G.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return G;
}
// coloca a arma na mão de um boneco (mesma convenção do poseMan: frente = +z local)
export function placeHeld(T, G, x, y, z, yaw, aim, pitch, two) {
  const off = aim ? [0.3, 1.45, 0.62] : [0.36, 0.95, 0.16];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  G.position.set(x + c * off[0] + s * off[2], y + off[1], z - s * off[0] + c * off[2]);
  G.rotation.set(aim ? -pitch : 0.55, yaw, 0, 'YXZ');
}

// ---------------------------------------------------------------- som (gerado na hora, sem arquivos)
let AC = null;
function bang(dur, freq, vol) {
  try {
    AC ||= new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = AC.createBufferSource(); src.buffer = buf; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; const g = AC.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
  } catch {}
}
function click() { try { AC ||= new AudioContext(); const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = 2400; g.gain.value = 0.05; o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.02); } catch {} }

// ---------------------------------------------------------------- sistema de combate
export function createCombat(ctx) {
  const { THREE: T, scene, camera, player, peds, pushOut, groundY, addChat, $ } = ctx;
  const st = { inv: new Set(), w: '', aiming: false, firing: false, ammo: {}, reload: 0, cool: 0, health: 100, dead: 0, cuffedBy: null, myCuffs: new Set(), hurtFlash: 0 };
  const held = {}; for (const id of Object.keys(WEAPONS)) { held[id] = makeWeaponMesh(T, id); held[id].visible = false; scene.add(held[id]); }

  // ---------- HUD
  const css = document.createElement('style'); css.textContent = `
    #mira{position:fixed;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;display:none;z-index:4}
    #mira:before,#mira:after{content:'';position:absolute;background:#fff;box-shadow:0 0 2px #000}
    #mira:before{left:8px;top:0;width:2px;height:18px}#mira:after{top:8px;left:0;height:2px;width:18px}
    #luneta{position:fixed;inset:0;pointer-events:none;display:none;z-index:4;background:radial-gradient(circle at center,transparent 0,transparent 31vmin,#000 31.4vmin)}
    #luneta:before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:#000}#luneta:after{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:#000}
    #vida{position:fixed;right:20px;bottom:74px;font:700 15px system-ui;color:#fff;text-shadow:0 1px 3px #000;text-align:right;pointer-events:none}
    #vida .bar{width:160px;height:8px;background:rgba(0,0,0,.5);border-radius:4px;margin-top:3px;overflow:hidden}#vida .bar i{display:block;height:100%;background:#3fbf5a}
    #dano{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 160px rgba(200,0,0,.8);opacity:0;transition:opacity .25s;z-index:3}
    #inv{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:8;font-family:system-ui}
    #inv .box{background:#141920;border:1px solid #334;border-radius:12px;padding:18px;min-width:min(520px,92vw);color:#eee}
    #inv h3{margin:0 0 12px;font-size:18px}#inv .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    #inv .slot{background:#1d2430;border:2px solid #2b3442;border-radius:10px;padding:10px 6px;text-align:center;cursor:pointer;min-height:92px}
    #inv .slot.off{opacity:.3;cursor:default}#inv .slot.on{border-color:#ffcc33}#inv .slot canvas{width:100%;height:46px}
    #inv .slot b{display:block;font-size:13px;margin-top:4px}#inv .slot small{color:#9ab;font-size:11px}
    #inv .bottom{margin-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#9ab}
    #inv button{background:#2b3442;color:#eee;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}
    #roda{position:fixed;inset:0;display:none;z-index:7;pointer-events:none}
    #cons{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(560px,90vw);display:none;z-index:9;font:14px monospace}
    #cons input{width:100%;box-sizing:border-box;background:rgba(5,8,12,.94);color:#7CFC9A;border:1px solid #2f5;border-radius:6px;padding:9px 10px;font:14px monospace}
    #aviso{position:fixed;left:50%;top:38%;transform:translateX(-50%);font:800 28px system-ui;color:#fff;text-shadow:0 2px 6px #000;pointer-events:none;display:none;text-align:center}`;
  document.head.appendChild(css);
  const el = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
  const mira = el('mira'), luneta = el('luneta'), vida = el('vida'), dano = el('dano'), inv = el('inv'), aviso = el('aviso');
  const roda = document.createElement('canvas'); roda.id = 'roda'; document.body.appendChild(roda);
  const cons = el('cons', '<input id="consin" autocomplete="off" spellcheck="false" placeholder="">'); const consIn = cons.querySelector('input');
  let avisoT = 0; const say = (t, s = 1.6) => { aviso.textContent = t; aviso.style.display = 'block'; avisoT = s; };
  function hud() {
    const W = WEAPONS[st.w]; let a = '';
    if (W && !W.melee) a = st.reload > 0 ? 'recarregando…' : `${W.nome} · ${st.ammo[st.w]} / ∞`; else if (W) a = W.nome;
    vida.innerHTML = `${a}<div>❤ ${Math.max(0, Math.round(st.health))}</div><div class="bar"><i style="width:${Math.max(0, st.health)}%;background:${st.health > 50 ? '#3fbf5a' : st.health > 25 ? '#e8b923' : '#d9443a'}"></i></div>`;
  }
  // ícones desenhados (inventário e roda)
  const icon = (g, id, x, y, s) => {
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#d7dbe0'; g.strokeStyle = '#d7dbe0'; g.lineWidth = 3;
    if (id === 'pistola') { g.fillRect(-18, -8, 34, 9); g.fillRect(-14, 0, 9, 16); }
    if (id === 'fuzil') { g.fillRect(-34, -6, 60, 8); g.fillRect(26, -4, 12, 4); g.fillRect(-4, 2, 7, 14); g.fillRect(-34, -6, 8, 14); g.fillRect(8, 2, 5, 12); }
    if (id === 'awm') { g.fillStyle = '#9aa86a'; g.fillRect(-38, -5, 64, 8); g.fillRect(26, -3, 16, 4); g.fillRect(-38, -5, 10, 14); g.fillStyle = '#d7dbe0'; g.fillRect(-10, -14, 24, 6); }
    if (id === 'algema') { g.beginPath(); g.arc(-12, 0, 9, 0, 7); g.stroke(); g.beginPath(); g.arc(12, 0, 9, 0, 7); g.stroke(); g.fillRect(-4, -1, 8, 2); }
    if (id === '') { g.beginPath(); g.arc(0, 0, 11, 0, 7); g.stroke(); g.fillRect(-9, -2, 18, 4); }
    g.restore();
  };

  // ---------- equipar / inventário
  function equip(id) {
    if (id && !st.inv.has(id)) return; if (player.inCar && id) return;
    st.w = id || ''; st.reload = 0; st.firing = false; if (st.w && WEAPONS[st.w].mag && st.ammo[st.w] === undefined) st.ammo[st.w] = WEAPONS[st.w].mag;
    for (const k in held) held[k].visible = false; hud(); ctx.onEquip && ctx.onEquip(st.w);
  }
  function give(id) { st.inv.add(id); if (WEAPONS[id].mag) st.ammo[id] = WEAPONS[id].mag; renderInv(); hud(); }
  function renderInv() {
    inv.innerHTML = `<div class="box"><h3>Inventário</h3><div class="grid">${Object.keys(WEAPONS).map(id => `<div class="slot ${st.inv.has(id) ? '' : 'off'} ${st.w === id ? 'on' : ''}" data-id="${id}"><canvas width="120" height="46"></canvas><b>${WEAPONS[id].nome}</b><small>${st.inv.has(id) ? (WEAPONS[id].mag ? (st.ammo[id] ?? WEAPONS[id].mag) + ' balas' : 'equipável') : 'vazio'}</small></div>`).join('')}</div>
      <div class="bottom"><span>Clique para equipar · Tab: roda de armas</span><button data-id="">Guardar arma</button></div></div>`;
    inv.querySelectorAll('canvas').forEach(c => { const id = c.parentElement.dataset.id; icon(c.getContext('2d'), id, 60, 23, 1); });
    inv.querySelectorAll('[data-id]').forEach(n => n.onclick = ev => { ev.stopPropagation(); const id = n.dataset.id; if (id && !st.inv.has(id)) return; equip(id); renderInv(); });
  }
  inv.onclick = e => { if (e.target === inv) toggleInv(false); };
  function toggleInv(show = inv.style.display !== 'flex') { inv.style.display = show ? 'flex' : 'none'; if (show) { renderInv(); document.exitPointerLock?.(); } }

  // ---------- roda de armas (segurar Tab)
  let wheel = null;
  function wheelItems() { return ['', ...Object.keys(WEAPONS).filter(id => st.inv.has(id))]; }
  function drawWheel() {
    const W = innerWidth, H = innerHeight; roda.width = W; roda.height = H; const g = roda.getContext('2d'), cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.26, items = wheelItems(), n = items.length;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    const v = wheel.v, sel = Math.hypot(v[0], v[1]) > 25 ? Math.floor((((Math.atan2(v[1], v[0]) + Math.PI / 2 + Math.PI / n) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI / n)) : items.indexOf(st.w);
    wheel.sel = sel;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 - Math.PI / n + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0 + 0.02, a1 - 0.02); g.closePath(); g.fillStyle = i === sel ? 'rgba(255,204,51,.55)' : 'rgba(20,25,32,.82)'; g.fill();
      const am = (a0 + a1) / 2, ix = cx + Math.cos(am) * R * 0.62, iy = cy + Math.sin(am) * R * 0.62;
      icon(g, items[i], ix, iy - 8, 1.3); g.fillStyle = '#fff'; g.font = '700 14px system-ui'; g.textAlign = 'center'; g.fillText(items[i] ? WEAPONS[items[i]].nome : 'Mãos', ix, iy + 26);
    }
    g.beginPath(); g.arc(cx, cy, R * 0.28, 0, 7); g.fillStyle = 'rgba(10,12,16,.92)'; g.fill(); g.fillStyle = '#ffcc33'; g.font = '800 15px system-ui'; g.textAlign = 'center';
    const cur = items[sel]; g.fillText(cur === undefined ? '' : cur ? WEAPONS[cur].nome : 'Mãos', cx, cy + 5);
  }
  function wheelOpen() { if (wheel || player.inCar) return; wheel = { v: [0, 0], sel: -1 }; roda.style.display = 'block'; drawWheel(); }
  function wheelClose() { if (!wheel) return; const items = wheelItems(); if (wheel.sel >= 0 && wheel.sel < items.length) equip(items[wheel.sel]); wheel = null; roda.style.display = 'none'; }
  addEventListener('mousemove', e => {
    if (!wheel) return;
    if (document.pointerLockElement) { wheel.v[0] += e.movementX; wheel.v[1] += e.movementY; const L = Math.hypot(...wheel.v); if (L > 140) { wheel.v[0] *= 140 / L; wheel.v[1] *= 140 / L; } }
    else wheel.v = [e.clientX - innerWidth / 2, e.clientY - innerHeight / 2];
    drawWheel();
  });

  // ---------- console escondido (F8)
  function runCmd(txt) {
    const [cmd, ...rest] = txt.trim().toLowerCase().split(/\s+/); const arg = rest.join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const alias = { pistola: 'pistola', pistol: 'pistola', glock: 'pistola', fuzil: 'fuzil', rifle: 'fuzil', ak: 'fuzil', ar: 'fuzil', m4: 'fuzil', awm: 'awm', sniper: 'awm', algema: 'algema', algemas: 'algema' };
    if (cmd === 'set') {
      if (arg === 'tudo' || arg === 'all') { for (const id of Object.keys(WEAPONS)) give(id); return 'todos os itens adicionados'; }
      const id = alias[arg]; if (!id) return 'item desconhecido: ' + arg; give(id); equip(id); return WEAPONS[id].nome + ' adicionada';
    }
    if (cmd === 'tirar' || cmd === 'remove') { const id = alias[arg]; if (!id) return 'item desconhecido'; st.inv.delete(id); if (st.w === id) equip(''); return WEAPONS[id].nome + ' removida'; }
    if (cmd === 'vida' || cmd === 'heal') { st.health = 100; hud(); return 'vida cheia'; }
    if (cmd === 'soltar') { if (st.cuffedBy) { ctx.send && ctx.send({ t: 'uncuffme' }); } st.cuffedBy = null; return 'solto'; }
    return 'comando desconhecido';
  }
  function toggleCons(show = cons.style.display !== 'block') { cons.style.display = show ? 'block' : 'none'; if (show) { consIn.value = ''; document.exitPointerLock?.(); setTimeout(() => consIn.focus(), 0); } else consIn.blur(); }
  consIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const r = runCmd(consIn.value); consIn.value = ''; addChat('', '> ' + r); toggleCons(false); } if (e.key === 'Escape' || e.key === 'F8') { e.preventDefault(); toggleCons(false); } });

  // ---------- teclas e mouse
  addEventListener('keydown', e => {
    if (e.code === 'F8') { e.preventDefault(); toggleCons(); return; }
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === "'" || e.code === 'Quote' || e.code === 'Backquote' || e.code === 'IntlRo') { e.preventDefault(); toggleInv(); return; }
    if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) wheelOpen(); return; }
    if (e.code === 'Escape' && inv.style.display === 'flex') toggleInv(false);
    if (e.code === 'KeyR' && WEAPONS[st.w]?.mag && st.reload <= 0 && st.ammo[st.w] < WEAPONS[st.w].mag) { st.reload = WEAPONS[st.w].reload; hud(); }
  });
  addEventListener('keyup', e => { if (e.code === 'Tab') { e.preventDefault(); wheelClose(); } });
  ctx.canvas.addEventListener('contextmenu', e => e.preventDefault());
  ctx.canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { if (st.w && !WEAPONS[st.w].melee && !player.inCar && !st.dead && !st.cuffedBy) st.aiming = true; }
    if (e.button === 0 && st.w && !player.inCar && !st.dead && !st.cuffedBy) { if (WEAPONS[st.w].melee) useCuffs(); else if (st.aiming || document.pointerLockElement) { st.firing = true; if (!WEAPONS[st.w].auto) tryFire(); } }
  });
  addEventListener('mouseup', e => { if (e.button === 2) st.aiming = false; if (e.button === 0) st.firing = false; });
  const busy = () => !!wheel || inv.style.display === 'flex' || cons.style.display === 'block';

  // ---------- efeitos
  const fx = [];
  const tracerM = new T.LineBasicMaterial({ color: '#ffe9a8', transparent: true });
  function tracer(a, b) {
    const g = new T.BufferGeometry().setFromPoints([new T.Vector3(...a), new T.Vector3(...b)]); const l = new T.Line(g, tracerM.clone()); scene.add(l); fx.push({ o: l, t: 0.07, k: 'line' });
    const f = new T.Mesh(new T.SphereGeometry(0.09, 6, 4), new T.MeshBasicMaterial({ color: '#ffcf4a' })); f.position.set(...a); scene.add(f); fx.push({ o: f, t: 0.05 });
    const p = new T.Mesh(new T.SphereGeometry(0.12, 6, 4), new T.MeshBasicMaterial({ color: '#8a857c', transparent: true, opacity: 0.8 })); p.position.set(...b); scene.add(p); fx.push({ o: p, t: 0.35, k: 'puff' });
  }
  function updateFx(dt) { for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.k === 'puff') { f.o.scale.multiplyScalar(1 + dt * 4); f.o.material.opacity = Math.max(0, f.t / 0.35); } if (f.t <= 0) { scene.remove(f.o); f.o.geometry.dispose(); f.o.material.dispose(); fx.splice(i, 1); } } }

  // ---------- tiro
  const V = new T.Vector3();
  function muzzle() { const G = held[st.w]; const d = new T.Vector3(0, 0, WEAPONS[st.w].two ? 0.9 : 0.25).applyEuler(G.rotation); return [G.position.x + d.x, G.position.y + d.y, G.position.z + d.z]; }
  function panic(x, z, r = 30) { for (const p of peds) if (!p.dead && Math.hypot(p.x - x, p.z - z) < r) p.panic = 8 + Math.random() * 4; }
  function rayHit(o, d, range, skipT) {
    let best = { t: range, kind: 'none' };
    // pessoas (cilindro de 0.4 m, 1.85 m de altura)
    const test = (x, y, z, kind, ref) => { const t = (x - o.x) * d.x + (y + 1.1 - o.y) * d.y + (z - o.z) * d.z; if (t < skipT || t > best.t) return; const qx = o.x + d.x * t, qy = o.y + d.y * t, qz = o.z + d.z * t; if (Math.hypot(qx - x, qz - z) < 0.42 && qy > y && qy < y + 1.95) best = { t, kind, ref, head: qy > y + 1.55 }; };
    for (const p of peds) if (!p.dead) test(p.x, p.y ?? groundY(p.x, p.z), p.z, 'ped', p);
    const R = ctx.remotes(); if (R) for (const r of R.values()) if (!r.dd) test(r.car ? r.cx : r.x, r.car ? 0.4 : r.y, r.car ? r.cz : r.z, 'remote', r);
    // mundo: chão e paredes (passo de 0,5 m)
    for (let t = skipT; t < best.t; t += 0.5) { const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; if (y < groundY(x, z)) { best = { t, kind: 'world' }; break; } if (y < 9 && pushOut(x, z, 0.01).hit) { best = { t, kind: 'world' }; break; } }
    return best;
  }
  function tryFire() {
    const W = WEAPONS[st.w]; if (!W || W.melee || st.cool > 0 || st.reload > 0 || busy()) return;
    if (st.ammo[st.w] <= 0) { click(); st.reload = W.reload; hud(); return; }
    st.ammo[st.w]--; st.cool = W.rate; hud();
    const o = camera.position.clone(), d = new T.Vector3(); camera.getWorldDirection(d);
    const sp = (W.scope && st.aiming) ? 0 : W.spread * (st.aiming ? 1 : 2.5); d.x += (Math.random() - 0.5) * sp; d.y += (Math.random() - 0.5) * sp; d.z += (Math.random() - 0.5) * sp; d.normalize();
    const skip = Math.max(0.5, o.distanceTo(new T.Vector3(player.x, player.y + 1.4, player.z)) + 0.4);
    const h = rayHit(o, d, W.range, skip), b = [o.x + d.x * h.t, o.y + d.y * h.t, o.z + d.z * h.t], a = muzzle();
    tracer(a, b); bang(...W.snd); panic(player.x, player.z);
    const dmg = W.dmg * (h.head ? 2 : 1);
    if (h.kind === 'ped') { const p = h.ref; p.hp = (p.hp ?? 100) - dmg; if (p.hp <= 0) { p.dead = 25; p.hp = 100; p.cuffed = false; } else p.panic = 10; }
    if (h.kind === 'remote') ctx.send && ctx.send({ t: 'hit', id: h.ref.id, dmg: Math.min(100, dmg) });
    ctx.send && ctx.send({ t: 'shot', a: a.map(v => +v.toFixed(2)), b: b.map(v => +v.toFixed(2)), w: WIDS.indexOf(st.w) });
    // coice da câmera
    ctx.recoil && ctx.recoil(W.scope ? 0.05 : W.auto ? 0.012 : 0.025);
  }
  // ---------- algemas (clique com as algemas na mão, a menos de 2,5 m)
  function useCuffs() {
    const fw = [Math.sin(player.yaw), Math.cos(player.yaw)]; let best = null, bd = 2.6;
    const near = (x, z) => { const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz); return d < bd && (dx * fw[0] + dz * fw[1]) / (d || 1) > -0.2 ? d : null; };
    for (const p of peds) { if (p.dead) continue; const d = near(p.x, p.z); if (d !== null) { bd = d; best = { kind: 'ped', ref: p }; } }
    const R = ctx.remotes(); if (R) for (const r of R.values()) { if (r.car || r.dd) continue; const d = near(r.x, r.z); if (d !== null) { bd = d; best = { kind: 'remote', ref: r }; } }
    if (!best) { say('Ninguém perto para algemar'); return; }
    if (best.kind === 'ped') { const p = best.ref; p.cuffed = !p.cuffed; p.panic = 0; say(p.cuffed ? 'Algemado! Ele vai te seguir' : 'Solto'); }
    else { const on = !st.myCuffs.has(best.ref.id); if (on) st.myCuffs.add(best.ref.id); else st.myCuffs.delete(best.ref.id); ctx.send && ctx.send({ t: 'cuff', id: best.ref.id, on }); say(on ? `${best.ref.name} algemado!` : `${best.ref.name} solto`); }
  }
  // ---------- eventos da rede
  function onNet(m) {
    if (m.t === 'shot') { tracer(m.a, m.b); const d = Math.hypot(m.a[0] - player.x, m.a[2] - player.z), W = WEAPONS[WIDS[m.w]] || WEAPONS.pistola; if (d < 400) bang(W.snd[0], W.snd[1], W.snd[2] * Math.max(0.05, 1 - d / 400)); panic(m.a[0], m.a[2]); }
    if (m.t === 'hurt' && !st.dead) { st.health -= m.dmg; st.hurtFlash = 0.5; hud(); if (st.health <= 0) die(m.byName); }
    if (m.t === 'cuffed') { st.cuffedBy = m.on ? m.by : null; if (m.on) { st.aiming = false; st.firing = false; say(`Você foi algemado por ${m.byName}`, 2.5); if (player.inCar) ctx.leaveCar && ctx.leaveCar(); } else say('Você foi solto', 2); }
  }
  function die(by) { st.dead = 6; st.health = 0; st.aiming = false; st.firing = false; st.cuffedBy = null; say(by ? `Você foi derrubado por ${by}` : 'Você foi derrubado', 3); ctx.send && ctx.send({ t: 'dead' }); hud(); }

  // ---------- por quadro
  function update(dt) {
    st.cool -= dt; if (st.hurtFlash > 0) st.hurtFlash -= dt; dano.style.opacity = st.hurtFlash > 0 ? Math.min(1, st.hurtFlash * 2) : 0;
    if (avisoT > 0 && (avisoT -= dt) <= 0) aviso.style.display = 'none';
    if (st.reload > 0) { st.reload -= dt; if (st.reload <= 0) { st.ammo[st.w] = WEAPONS[st.w].mag; hud(); } }
    if (st.dead > 0) { st.dead -= dt; if (st.dead <= 0) { st.health = 100; ctx.respawn && ctx.respawn(); hud(); } }
    if (st.firing && WEAPONS[st.w]?.auto) tryFire();
    if (player.inCar || st.dead || st.cuffedBy || !st.w) st.aiming = st.aiming && !!st.w && !player.inCar && !st.dead && !st.cuffedBy;
    const W = WEAPONS[st.w]; const scope = st.aiming && W?.scope;
    mira.style.display = st.w && !W.melee && !scope && !player.inCar && (st.aiming || document.pointerLockElement) ? 'block' : 'none';
    luneta.style.display = scope ? 'block' : 'none';
    for (const k in held) held[k].visible = false;
    if (st.w && !player.inCar && !st.dead && !scope) { const G = held[st.w]; G.visible = true; placeHeld(T, G, player.x, player.y, player.z, player.yaw, st.aiming && !W.melee, ctx.pitch(), W.two); }
    updateFx(dt);
  }
  hud();
  return {
    st, update, onNet, equip, give, busy, held, _ray: rayHit,
    cameraMode: () => st.aiming ? (WEAPONS[st.w]?.scope ? 'scope' : 'aim') : 'normal',
    pose: () => ({ aim: st.aiming && st.w && !WEAPONS[st.w].melee ? (WEAPONS[st.w].two ? 2 : 1) : 0, cuff: !!st.cuffedBy }),
    netState: () => ({ w: WIDS.indexOf(st.w), aim: st.aiming ? 1 : 0, cf: st.cuffedBy ? 1 : 0, dd: st.dead > 0 ? 1 : 0, pt: +ctx.pitch().toFixed(2) }),
  };
}
