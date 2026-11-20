// Conversa com os pedestres: segurar V fala no microfone (ou N para digitar); o NPC responde com voz e age.
// Comandos (assalto, mãos pra cima, deita, vem comigo, sai daqui...) são reconhecidos na hora, sem IA;
// o resto vai para a IA do servidor (/npc, Google Gemini). Sem IA, o NPC usa frases prontas.
const NOMES_M = ['Seu Zé', 'Joãozinho', 'Carlos', 'Marcão', 'Tiago', 'Seu Antônio', 'Wellington', 'Rafael', 'Lucas', 'Juninho', 'Seu Geraldo', 'Pedro', 'Diego', 'Fabrício'];
const NOMES_F = ['Dona Maria', 'Ana', 'Juliana', 'Dona Cida', 'Fernanda', 'Patrícia', 'Bia', 'Dona Lourdes', 'Camila', 'Rosângela', 'Larissa', 'Tia Neide'];
const PROF = ['pedreiro', 'aposentado', 'estudante do Nacle', 'professora do Lourdinas', 'vendedor', 'motoboy', 'caixa do Coelho Diniz', 'enfermeira', 'mecânico', 'dona de casa', 'personal da academia', 'padeiro', 'advogado', 'cabeleireira'];
const JEITOS = ['medroso', 'calmo', 'valente', 'debochado', 'simpático', 'desconfiado', 'nervoso'];
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

// frases prontas (respostas instantâneas e reserva quando a IA não responde)
const FALAS = {
  maos: { medo: ['Calma, calma! Tô com a mão pra cima, não atira não!', 'Pelo amor de Deus, moço, tô parado!', 'Tá bom, tá bom, mão pra cima!'], brabo: ['Tá, tá... levantei. Fica tranquilo aí.', 'Ô, abaixa isso aí, já tô com a mão pra cima.'] },
  dinheiro: { medo: ['Toma, toma, leva tudo! Não me machuca não!', 'Pega a carteira, é tudo que eu tenho, juro!', 'Tá aqui o dinheiro, pode levar, sô!'], brabo: ['Toma essa merreca aí e some da minha frente.', 'Leva, leva... que dia, viu.'] },
  semArma: ['Assalto? Com essa cara? Vai procurar o que fazer, rapaz!', 'Uai, tá doido? Sai pra lá!', 'Kkkk, tá zoando né? Vou nada.'],
  jaDeu: ['Já te dei tudo, moço, não tenho mais nada!', 'Eu já te passei o dinheiro, tô liso!'],
  deitar: ['Tô deitando, tô deitando!', 'Pronto, tô no chão, calma!'], seguir: ['Tá bom, eu vou com você.', 'Pra onde a gente vai?'],
  fugir: ['Socorro!', 'Tô indo embora, tô indo!', 'Vou sair fora daqui!'], parar: ['Tá, tô parado.', 'Fiquei aqui, ó.'], liberar: ['Graças a Deus...', 'Posso ir? Valeu...', 'Ufa.'],
  generico: ['Oi? Fala de novo que eu não entendi.', 'Uai, não sei não, sô.', 'Hum... tá bom.', 'Tô com pressa, depois a gente conversa.', 'Ô trem bão, sô!'],
};
function regras(t, ctx, ped) {
  const armado = ctx.armado;
  if (/(assalt|passa (o |a |tudo|a carteira|o celular|o dinheiro|a grana)|perdeu|perdeu playboy|me da (o|a) (dinheiro|carteira|celular|grana)|passa ai|passa logo|mao no bolso)/.test(t)) {
    if (ped.roubado) return { fala: pick(FALAS.jaDeu, Math.random()), acao: 'maos' };
    if (!armado) { const v = ped.persona.jeito; if (v === 'medroso' || v === 'nervoso') return { fala: pick(FALAS.dinheiro.medo, Math.random()), acao: 'dinheiro' }; return { fala: pick(FALAS.semArma, Math.random()), acao: v === 'valente' ? 'nenhuma' : 'fugir' }; }
    return { fala: pick(ped.persona.jeito === 'valente' || ped.persona.jeito === 'debochado' ? FALAS.dinheiro.brabo : FALAS.dinheiro.medo, Math.random()), acao: 'dinheiro' };
  }
  if (/(mao(s)? (pra|para) cima|levanta (a|as) mao|maos ao alto|mao na cabeca|levanta a mao)/.test(t)) return { fala: pick(armado ? FALAS.maos.medo : FALAS.maos.brabo, Math.random()), acao: 'maos' };
  if (/(deita|no chao|cara no chao|deita no chao)/.test(t)) return { fala: pick(FALAS.deitar, Math.random()), acao: armado ? 'deitar' : 'nenhuma' };
  if (/(vem comigo|me segue|segue eu|me acompanha|bora comigo|vem cá|vem ca)/.test(t)) return { fala: pick(FALAS.seguir, Math.random()), acao: 'seguir' };
  if (/(sai daqui|vaza|some daqui|corre|ralar|vai embora|rala peito)/.test(t)) return { fala: pick(FALAS.fugir, Math.random()), acao: 'fugir' };
  if (/(fica parado|para ai|parado ai|nao se mexe|fica quieto)/.test(t)) return { fala: pick(FALAS.parar, Math.random()), acao: 'parar' };
  if (/(pode ir|ta liberado|esta liberado|libera|vai em paz|tchau)/.test(t)) return { fala: pick(FALAS.liberar, Math.random()), acao: 'liberar' };
  return null;
}

export function createNPC(ctx) {
  const { THREE: T, camera, player, peds, combat, addChat, $ } = ctx;
  // personalidade fixa de cada pedestre
  peds.forEach((p, i) => { const r = k => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1; const fem = r(1) < 0.45;
    p.persona = { nome: pick(fem ? NOMES_F : NOMES_M, r(2)), fem, idade: 16 + Math.floor(r(3) * 62), profissao: pick(PROF, r(4)), jeito: pick(JEITOS, r(5)) };
    p.dinheiro = 20 + Math.floor(r(6) * 280); p.hist = []; });
  const st = { money: 0, talking: null, listening: false, busy: false };
  // ---- HUD: carteira, dica, legenda e campo de texto
  const css = document.createElement('style'); css.textContent = `
    #carteira{position:fixed;right:20px;bottom:128px;font:800 16px system-ui;color:#8ef59b;text-shadow:0 1px 3px #000;pointer-events:none}
    #npcdica{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);font:600 14px system-ui;color:#fff;background:rgba(12,15,20,.7);padding:5px 12px;border-radius:8px;display:none;pointer-events:none}
    #npcfala{position:fixed;transform:translate(-50%,-100%);max-width:min(340px,70vw);background:#fff;color:#111;font:600 14px system-ui;padding:8px 11px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.4);display:none;pointer-events:none;z-index:5}
    #npcfala b{display:block;font-size:11px;color:#a33;margin-bottom:2px}
    #npcfala:after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#fff}
    #npcvoce{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);font:600 15px system-ui;color:#ffd34d;text-shadow:0 1px 3px #000;pointer-events:none;display:none;max-width:80vw;text-align:center}
    #npcin{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);width:min(440px,84vw);font-size:15px;padding:9px 11px;border-radius:8px;border:1px solid #556;background:rgba(12,15,20,.92);color:#fff;display:none;z-index:6}
    #mic{position:fixed;left:50%;top:22%;transform:translateX(-50%);font:800 18px system-ui;color:#fff;background:rgba(200,30,30,.85);padding:8px 16px;border-radius:30px;display:none;pointer-events:none}`;
  document.head.appendChild(css);
  const mk = (tag, id) => { const d = document.createElement(tag); d.id = id; document.body.appendChild(d); return d; };
  const carteira = mk('div', 'carteira'), dica = mk('div', 'npcdica'), fala = mk('div', 'npcfala'), voce = mk('div', 'npcvoce'), mic = mk('div', 'mic'); const inp = mk('input', 'npcin');
  inp.maxLength = 200; inp.placeholder = 'Fale com o pedestre… (Enter envia, Esc cancela)'; inp.autocomplete = 'off'; mic.textContent = '● Ouvindo… (solte V para enviar)';
  const hud = () => { carteira.textContent = `💵 R$ ${st.money}`; }; hud();
  let falaT = 0, voceT = 0;
  // ---- voz do NPC (sintetizador do navegador, português)
  let vozes = []; const loadV = () => { vozes = (speechSynthesis?.getVoices?.() || []).filter(v => /^pt/i.test(v.lang)); }; try { loadV(); speechSynthesis.onvoiceschanged = loadV; } catch {}
  function falar(p, txt) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR';
      const br = vozes.filter(v => /pt-BR/i.test(v.lang)); const pool = br.length ? br : vozes; if (pool.length) { const fem = pool.filter(v => /(female|feminina|maria|francisca|luciana|vitoria|thalita|camila)/i.test(v.name)); const mas = pool.filter(v => !fem.includes(v)); const set = p.persona.fem ? (fem.length ? fem : pool) : (mas.length ? mas : pool); u.voice = set[(p.persona.idade + p.persona.nome.length) % set.length]; }
      u.pitch = p.persona.fem ? 1.15 : (p.persona.idade > 55 ? 0.8 : 0.95); u.rate = p.persona.jeito === 'nervoso' || p.persona.jeito === 'medroso' ? 1.15 : 1.0; speechSynthesis.speak(u); } catch {}
  }
  function mostrar(p, txt) { st.talking = p; fala.innerHTML = ''; const b = document.createElement('b'); b.textContent = p.persona.nome; fala.append(b, document.createTextNode(txt)); fala.style.display = 'block'; falaT = Math.max(4, txt.length / 12); }
  // ---- pedestre alvo: o mais perto na frente (até 5 m)
  function alvo() {
    if (player.inCar) return null; const fw = [Math.sin(player.yaw), Math.cos(player.yaw)]; let best = null, bd = 5;
    for (const p of peds) { if (p.dead) continue; const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz); if (d < bd && (d < 1.6 || (dx * fw[0] + dz * fw[1]) / d > 0.2)) { bd = d; best = p; } }
    return best;
  }
  // ---- aplicar a ação no boneco
  function agir(p, acao) {
    p.panic = 0; p.act = null;
    if (acao === 'maos') p.act = { t: 'maos', time: 25 };
    if (acao === 'dinheiro') { p.act = { t: 'maos', time: 20 }; if (!p.roubado) { const v = p.dinheiro; p.roubado = true; setTimeout(() => { st.money += v; hud(); addChat('', `${p.persona.nome} te entregou R$ ${v}`); }, 900); } }
    if (acao === 'deitar') p.act = { t: 'deitar', time: 25 };
    if (acao === 'seguir') p.act = { t: 'seguir', time: 90 };
    if (acao === 'fugir') { p.panic = 14; }
    if (acao === 'parar') p.act = { t: 'parar', time: 12 };
    if (acao === 'policia') { p.panic = 10; addChat('', `${p.persona.nome} disse que vai chamar a polícia!`); }
    if (acao === 'liberar' || acao === 'nenhuma') p.act = { t: 'ouvir', time: 6 };
  }
  // ---- conversa
  async function dizer(texto) {
    texto = (texto || '').trim(); if (!texto) return; const p = alvo();
    voce.textContent = '“' + texto + '”'; voce.style.display = 'block'; voceT = 4;
    if (!p) { dica.textContent = 'Ninguém perto para ouvir'; dica.style.display = 'block'; setTimeout(() => dica.style.display = 'none', 1800); return; }
    p.act = { t: 'ouvir', time: 10 }; p.talkYaw = Math.atan2(player.x - p.x, player.z - p.z);
    const W = combat ? combat.st.w : '', armado = !!(W && W !== 'algema'), ctx2 = { armado, arma: W, mirando: !!(combat && combat.st.aiming && armado), dinheiro: p.dinheiro, jaDeuDinheiro: !!p.roubado };
    let r = regras(norm(texto), ctx2, p);
    if (!r) { // conversa livre: IA do servidor
      if (st.busy) return; st.busy = true; mostrar(p, '…');
      try { const res = await fetch('/npc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, persona: p.persona, ctx: ctx2, hist: p.hist.slice(-8) }) });
        if (res.ok) r = await res.json(); else if (res.status === 429) r = { fala: pick(['Peraí que eu tô cansado de conversar, fala comigo daqui a pouco.', 'Ô, muita gente falando comigo, dá um tempo!'], Math.random()), acao: 'nenhuma' };
      } catch {}
      st.busy = false;
      if (!r || !r.fala) r = { fala: pick(FALAS.generico, Math.random()), acao: 'nenhuma' };
    }
    p.hist.push({ r: 'eu', t: texto }, { r: 'npc', t: r.fala }); if (p.hist.length > 16) p.hist.splice(0, p.hist.length - 16);
    mostrar(p, r.fala); falar(p, r.fala); agir(p, r.acao);
  }
  // ---- microfone (Chrome): segurar V
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, ouvido = '';
  function micStart() {
    if (!SR) { abrirTexto(); dica.textContent = 'Seu navegador não tem reconhecimento de voz: digite (N)'; dica.style.display = 'block'; setTimeout(() => dica.style.display = 'none', 2500); return; }
    if (st.listening) return; ouvido = ''; rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true;
    rec.onresult = e => { let s = ''; for (const x of e.results) s += x[0].transcript; ouvido = s; voce.textContent = '“' + s + '”'; voce.style.display = 'block'; voceT = 3; };
    rec.onerror = e => { if (e.error === 'not-allowed') { dica.textContent = 'Permita o microfone no Chrome (ícone do cadeado) ou digite com N'; dica.style.display = 'block'; setTimeout(() => dica.style.display = 'none', 3500); } };
    rec.onend = () => { st.listening = false; mic.style.display = 'none'; if (ouvido) dizer(ouvido); ouvido = ''; };
    try { rec.start(); st.listening = true; mic.style.display = 'block'; } catch {}
  }
  function micStop() { if (rec && st.listening) try { rec.stop(); } catch {} }
  function abrirTexto() { inp.style.display = 'block'; inp.value = ''; document.exitPointerLock?.(); setTimeout(() => inp.focus(), 0); }
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const t = inp.value; inp.style.display = 'none'; inp.blur(); dizer(t); } if (e.key === 'Escape') { inp.style.display = 'none'; inp.blur(); } });
  addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; if (e.code === 'KeyV' && !e.repeat) micStart(); if (e.code === 'KeyN') { e.preventDefault(); abrirTexto(); } });
  addEventListener('keyup', e => { if (e.code === 'KeyV') micStop(); });
  // ---- por quadro: dica, posição da legenda
  const V3 = new T.Vector3();
  function update(dt) {
    const p = alvo(); if (p && !st.listening && inp.style.display !== 'block' && falaT <= 0) { dica.textContent = `${p.persona.nome} · segure V para falar · N para digitar`; dica.style.display = 'block'; } else if (!st.listening && falaT <= 0) dica.style.display = 'none';
    if (falaT > 0) { falaT -= dt; const q = st.talking; if (q && !q.dead) { V3.set(q.x, (q.y || 0) + 2.25, q.z).project(camera); const vis = V3.z < 1 && Math.abs(V3.x) < 1.1 && Math.abs(V3.y) < 1.1; fala.style.display = vis ? 'block' : 'none'; fala.style.left = (V3.x + 1) / 2 * innerWidth + 'px'; fala.style.top = (1 - V3.y) / 2 * innerHeight - 8 + 'px'; dica.style.display = 'none'; } if (falaT <= 0) fala.style.display = 'none'; }
    if (voceT > 0 && (voceT -= dt) <= 0 && !st.listening) voce.style.display = 'none';
  }
  return { update, st, dizer, alvo };
}
