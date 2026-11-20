// Servidor do jogo Ilha dos Araújos: arquivos do jogo + multiplayer (WebSocket em /ws), sem dependências.
// Local: serve tudo e aceita POST /save?f=nome (fotos/ferramentas de desenvolvimento).
// Público (PUBLIC=1, ou rodando no Render): só os arquivos do jogo, sem /save.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT || 8080;
const PUBLIC = process.env.PUBLIC === '1' || !!process.env.RENDER; // na hospedagem (Render) fica sempre público
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jsonl': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const PUBLIC_FILES = /^\/(index\.html|game\.js|interiors\.js|lugares\.js|net\.js|data\/(world\.json|places\.json|overrides\.jsonl))$/;
const gzCache = new Map();

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!PUBLIC && req.method === 'POST' && u.pathname === '/save') {
    const f = path.basename(u.searchParams.get('f') || 'out.txt');
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { fs.writeFileSync(path.join(root, 'data', f), Buffer.concat(chunks)); res.end('ok'); }); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  let rel = decodeURIComponent(u.pathname); if (rel === '/') rel = '/index.html';
  if (rel === '/healthz') return res.end('ok');
  if (PUBLIC && !PUBLIC_FILES.test(rel)) { res.statusCode = 404; return res.end('404'); }
  let p = path.join(root, rel);
  if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('404'); }
  const ext = path.extname(p);
  res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', PUBLIC ? 'public, max-age=300' : 'no-store');
  if (/gzip/.test(req.headers['accept-encoding'] || '') && /\.(js|json|jsonl|html)$/.test(p)) {
    const st = fs.statSync(p), key = p + st.mtimeMs; let gz = gzCache.get(key);
    if (!gz) { gz = zlib.gzipSync(fs.readFileSync(p)); gzCache.set(key, gz); }
    res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Content-Length', gz.length); return res.end(gz);
  }
  fs.createReadStream(p).pipe(res);
});

// ---------------------------------------------------------------- multiplayer
const MAX_PLAYERS = 40, clients = new Map(); let nextId = 1;
function wsSend(c, obj) {
  if (c.sock.destroyed) return; const data = Buffer.from(JSON.stringify(obj)); const n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  c.sock.write(Buffer.concat([head, data]));
}
const clean = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim();
const num = (v, lim = 1e5) => (typeof v === 'number' && isFinite(v) && Math.abs(v) < lim) ? Math.round(v * 100) / 100 : 0;
function onMsg(c, m) {
  c.last = Date.now();
  if (m.t === 'hi') { c.name = clean(m.name).slice(0, 16) || 'Jogador ' + c.id; wsSend(c, { t: 'welcome', id: c.id }); broadcast({ t: 'chat', n: '', m: `${c.name} entrou na ilha` }); return; }
  if (m.t === 's') { c.st = [num(m.x), num(m.y, 1e3), num(m.z), num(m.yaw, 1e3), num(m.ph, 1e6), num(m.amp, 10), m.car ? 1 : 0, num(m.cx), num(m.cz), num(m.ch, 1e3), /^#[0-9a-f]{6}$/i.test(m.cc || '') ? m.cc : '#888888']; return; }
  if (m.t === 'chat') { const now = Date.now(); if (now - (c.lastChat || 0) < 800) return; c.lastChat = now; const txt = clean(m.m).slice(0, 140); if (txt) broadcast({ t: 'chat', n: c.name, m: txt }); }
}
function broadcast(obj) { for (const c of clients.values()) if (c.name) wsSend(c, obj); }
server.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x'), key = req.headers['sec-websocket-key'];
  if (u.pathname !== '/ws' || !key || clients.size >= MAX_PLAYERS) { sock.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return sock.destroy(); }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { id: nextId++, sock, name: '', st: null, buf: Buffer.alloc(0), last: Date.now() }; clients.set(c.id, c);
  const bye = () => { if (!clients.has(c.id)) return; clients.delete(c.id); if (c.name) broadcast({ t: 'chat', n: '', m: `${c.name} saiu` }); sock.destroy(); };
  sock.on('close', bye); sock.on('error', bye); sock.on('end', bye);
  sock.on('data', d => {
    c.buf = Buffer.concat([c.buf, d]); if (c.buf.length > 64 * 1024) return bye();
    for (;;) {
      if (c.buf.length < 2) return; const b0 = c.buf[0], b1 = c.buf[1], op = b0 & 15, masked = b1 & 128; let len = b1 & 127, off = 2;
      if (!masked) return bye(); if (len === 127) return bye(); if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
      if (len > 4096) return bye(); if (c.buf.length < off + 4 + len) return;
      const mask = c.buf.subarray(off, off + 4), pl = Buffer.from(c.buf.subarray(off + 4, off + 4 + len)); for (let i = 0; i < pl.length; i++) pl[i] ^= mask[i & 3];
      c.buf = c.buf.subarray(off + 4 + len);
      if (op === 8) return bye(); if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, pl.length]), pl])); continue; }
      if (op === 1) { try { onMsg(c, JSON.parse(pl.toString('utf8'))); } catch {} }
    }
  });
});
setInterval(() => { // 10 vezes por segundo: manda o estado de todo mundo para todo mundo
  const now = Date.now(), list = [];
  for (const c of clients.values()) { if (now - c.last > 30000) { c.sock.destroy(); clients.delete(c.id); continue; } if (c.name && c.st) list.push([c.id, c.name, ...c.st]); }
  const msg = { t: 'w', p: list }; for (const c of clients.values()) if (c.name) wsSend(c, msg);
}, 100);

server.listen(PORT, () => console.log(`ready http://localhost:${PORT}${PUBLIC ? ' (público)' : ''}`));
