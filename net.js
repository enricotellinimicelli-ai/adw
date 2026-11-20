// Multiplayer: outros jogadores na mesma ilha (posição, carro, nome em cima) e chat.
export function startNet(ctx, name, getState, onChat, onStatus) {
  const { THREE: T, scene, makePeople, poseMan, flushPeople, palettes } = ctx;
  const MAX = 40, RPM = makePeople(MAX), others = new Map();
  const hide = i => poseMan(RPM, i, 0, -60, 0, 0, 0, 0);
  for (let i = 0; i < MAX; i++) hide(i); flushPeople(RPM);
  // carros dos outros
  const carBody = new T.InstancedMesh(new T.BoxGeometry(4.3, 0.75, 1.85).translate(0, 0.72, 0), new T.MeshLambertMaterial(), MAX);
  const carCab = new T.InstancedMesh(new T.BoxGeometry(2.2, 0.62, 1.7).translate(-0.25, 1.4, 0), new T.MeshLambertMaterial({ color: '#2b3940' }), MAX);
  const carWh = new T.InstancedMesh(new T.CylinderGeometry(0.36, 0.36, 1.95, 10).rotateX(Math.PI / 2).translate(0, 0.36, 0), new T.MeshLambertMaterial({ color: '#1a1a1a' }), MAX * 2);
  for (const m of [carBody, carCab, carWh]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
  const M4 = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S1 = new T.Vector3(1, 1, 1), UP = new T.Vector3(0, 1, 0), C = new T.Color();
  const hash = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const lookOf = n => { const h = hash(n), p = (a, k) => a[(h >>> k) % a.length]; return { skin: p(palettes.SKIN, 0), shirt: p(palettes.SHIRT, 5), pants: p(palettes.PANTS, 11), hair: p(palettes.HAIR, 17) }; };
  const label = n => { const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '700 36px system-ui, sans-serif'; const w = Math.ceil(g.measureText(n).width) + 32; c.width = w; c.height = 54; g.font = '700 36px system-ui, sans-serif'; g.fillStyle = 'rgba(10,40,90,.8)'; g.beginPath(); g.roundRect(0, 0, w, 54, 14); g.fill(); g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(n, 16, 29); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(w / 54 * 0.9, 0.9, 1); s.renderOrder = 11; scene.add(s); return s; };
  let ws = null, myId = null, open = false, sendT = 0, retry = 0;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  function connect() {
    onStatus && onStatus('conectando…');
    try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { return setTimeout(connect, 4000); }
    ws.onopen = () => { open = true; retry = 0; ws.send(JSON.stringify({ t: 'hi', name })); };
    ws.onclose = () => { open = false; myId = null; for (const o of others.values()) drop(o); others.clear(); onStatus && onStatus('offline · tentando de novo…'); setTimeout(connect, Math.min(15000, 2000 * ++retry)); };
    ws.onerror = () => {};
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') { myId = m.id; return; }
      if (m.t === 'chat') { onChat && onChat(m.n, m.m); return; }
      if (m.t === 'shot' || m.t === 'hurt' || m.t === 'cuffed') { ctx.onEvent && ctx.onEvent(m); return; }
      if (m.t === 'w') {
        const seen = new Set();
        for (const p of m.p) {
          const [id, nm, x, y, z, yaw, ph, amp, car, cx, cz, ch, cc, w, aim, cf, dd, pt] = p; if (id === myId) continue; seen.add(id);
          let o = others.get(id);
          if (!o) { const slot = [...Array(MAX).keys()].find(i => ![...others.values()].some(q => q.slot === i)); if (slot === undefined) continue; o = { id, name: nm, slot, look: lookOf(nm), lab: label(nm), x, y, z, yaw, ph, cx, cz, ch, gun: null, gunId: '' }; others.set(id, o); }
          Object.assign(o, { tx: x, ty: y, tz: z, tyaw: yaw, tph: ph, amp, car, tcx: cx, tcz: cz, tch: ch, cc, w: w | 0, aim, cf, dd, pt: pt || 0 });
        }
        for (const [id, o] of others) if (!seen.has(id)) { drop(o); others.delete(id); }
        onStatus && onStatus(`${others.size + 1} online`);
      }
    };
  }
  function drop(o) { hide(o.slot); scene.remove(o.lab); o.lab.material.map.dispose(); o.lab.material.dispose(); if (o.gun) scene.remove(o.gun); }
  const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  function update(dt) {
    if (open && (sendT -= dt) <= 0) { sendT = 0.1; const s = getState(); try { ws.send(JSON.stringify({ t: 's', ...s })); } catch {} }
    const k = Math.min(1, dt * 10); let nc = 0;
    for (const o of others.values()) {
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.z += (o.tz - o.z) * k; o.yaw = angLerp(o.yaw, o.tyaw, k); o.ph += (o.tph - o.ph) * k;
      if (o.car) {
        o.cx += (o.tcx - o.cx) * k; o.cz += (o.tcz - o.cz) * k; o.ch = angLerp(o.ch, o.tch, k);
        hide(o.slot);
        M4.compose(V.set(o.cx, 0.04, o.cz), Q.setFromAxisAngle(UP, -o.ch), S1); carBody.setMatrixAt(nc, M4); carBody.setColorAt(nc, C.set(o.cc)); carCab.setMatrixAt(nc, M4);
        for (const [w, dx] of [[0, 1.35], [1, -1.35]]) { const W4 = new T.Matrix4().makeTranslation(dx, 0, 0).premultiply(M4); carWh.setMatrixAt(nc * 2 + w, W4); }
        nc++; o.lab.position.set(o.cx, 3.2, o.cz);
      } else if (o.dd) { // derrubado
        poseMan(RPM, o.slot, o.x, o.y + 0.15, o.z, o.yaw, 0, 0, o.look, -Math.PI / 2);
        o.lab.position.set(o.x, o.y + 1.2, o.z);
      } else {
        const wid = ctx.WIDS ? ctx.WIDS[o.w] || '' : '', W = wid ? ctx.WEAPONS[wid] : null;
        const pose = { aim: o.aim && W && !W.melee ? (W.two ? 2 : 1) : 0, cuff: !!o.cf, pitch: o.pt };
        poseMan(RPM, o.slot, o.x, o.y, o.z, o.yaw, o.ph, o.aim ? 0.3 : o.amp, o.look, 0, pose);
        o.lab.position.set(o.x, o.y + 2.55, o.z);
        o.lab.material.color.set(o.cf ? '#ffb0b0' : '#ffffff');
      }
      // arma na mão dos outros
      const wid = ctx.WIDS ? ctx.WIDS[o.w] || '' : '';
      if (wid !== o.gunId) { if (o.gun) scene.remove(o.gun); o.gun = wid ? ctx.makeWeaponMesh(T, wid) : null; if (o.gun) scene.add(o.gun); o.gunId = wid; }
      if (o.gun) { o.gun.visible = !o.car && !o.dd && !o.cf; if (o.gun.visible) ctx.placeHeld(T, o.gun, o.x, o.y, o.z, o.yaw, !!o.aim && !ctx.WEAPONS[wid].melee, o.pt, ctx.WEAPONS[wid].two); }
    }
    carBody.count = carCab.count = nc; carWh.count = nc * 2;
    for (const m of [carBody, carCab, carWh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    flushPeople(RPM);
  }
  connect();
  return { update, chat: txt => { if (open && txt) ws.send(JSON.stringify({ t: 'chat', m: txt })); }, send: obj => { if (open) try { ws.send(JSON.stringify(obj)); } catch {} }, others };
}
