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
// conversa básica sem IA (quando a IA não responde): nome, idade, trabalho, cumprimentos, perguntas comuns
function papo(t, ctx, ped) {
  const P = ped.persona, r = Math.random();
  if (ctx.armado) { // amor à vida: com arma na mão do jogador, qualquer conversa vira súplica
    if (/(quer morrer|vou te matar|te mato|vai morrer|atiro|vou atirar)/.test(t)) return { fala: pick(['Não! Pelo amor de Deus, não me mata, eu tenho família!', 'Por favor, eu faço o que você quiser, só não atira!', 'Eu não quero morrer, moço, por favor!'], r), acao: 'maos' };
  }
  if (/^(oi|ola|opa|eae|e ai|salve|bom dia|boa tarde|boa noite|fala ai|fala)\b/.test(t)) return { fala: ctx.armado ? pick(['O-oi... abaixa essa arma, por favor...', 'Oi... tá tudo bem? Não precisa disso não...'], r) : pick([`Opa, tudo bom? Eu sou ${P.nome}.`, 'E aí, beleza?', `Oi! ${/dia/.test(t) ? 'Bom dia' : /tarde/.test(t) ? 'Boa tarde' : /noite/.test(t) ? 'Boa noite' : 'Tudo certo'} pra você também.`], r), acao: 'nenhuma' };
  if (/(seu nome|como (voce|vc|ce|tu) (se )?chama|quem e (voce|vc)|qual e (o )?(seu|teu) nome)/.test(t)) return { fala: ctx.armado ? `Meu nome é ${P.nome.replace(/^(Seu|Dona|Tia) /, '')}... por favor, não me machuca.` : `Me chamo ${P.nome}, prazer!`, acao: 'nenhuma' };
  if (/(quantos anos|sua idade|qual (a )?sua idade)/.test(t)) return { fala: `Tenho ${P.idade} anos${P.idade > 60 ? ', já tô velho pra essas coisas' : ''}.`, acao: 'nenhuma' };
  if (/(trabalha|profissao|o que (voce|vc|ce) faz|faz o que)/.test(t)) return { fala: `Eu sou ${P.profissao}, aqui mesmo na Ilha.`, acao: 'nenhuma' };
  if (/(tudo bem|tudo bom|como (voce|vc) (ta|esta)|como vai|beleza)/.test(t)) return { fala: ctx.armado ? 'Tava tudo bem até agora...' : pick(['Tudo tranquilo, graças a Deus. E você?', 'Na luta, mas tô bem!', 'De boa, e contigo?'], r), acao: 'nenhuma' };
  if (/(onde (fica|e|tem)|como (chego|faco pra chegar)|sabe onde)/.test(t)) return { fala: pick(['Uai, fica ali pra frente, perto da praça. Só seguir reto.', 'Acho que é lá perto da Rio Doce, pergunta no Coelho Diniz que eles sabem.', 'Ih, não sei te dizer não, eu mal saio de casa.'], r), acao: 'nenhuma' };
  if (/(obrigad|valeu|brigad)/.test(t)) return { fala: pick(['Por nada!', 'Imagina, tamo junto.', 'Disponha!'], r), acao: ctx.armado ? 'nenhuma' : 'liberar' };
  if (/(time|flamengo|cruzeiro|atletico|galo|futebol)/.test(t)) return { fala: pick(['Sou Galo doente, uai!', 'Cruzeiro até morrer!', 'Flamengo, igual metade da cidade kkk.'], r), acao: 'nenhuma' };
  return null;
}
function regras(t, ctx, ped) {
  const armado = ctx.armado;
  // sequestro: com arma, a pessoa obedece e vai junto (até dentro do carro)
  if (/(sequestr|entra no carro|vem comigo|anda logo|bora|me acompanha|vem ca|vem cá|vamos|anda na frente|vai comigo)/.test(t))
    return armado ? { fala: pick(['Tá bom, tá bom, eu vou! Só não me machuca!', 'Eu vou, eu vou... por favor, eu tenho filho!', 'Calma, eu tô indo com você, não precisa atirar!'], Math.random()), acao: 'seguir' }
                  : { fala: pick(['Ir com você pra onde? Nem te conheço!', 'Vou nada, tá doido?'], Math.random()), acao: ped.persona.jeito === 'simpático' ? 'seguir' : 'nenhuma' };
  if (/(assalt|passa (o |a |tudo|a carteira|o celular|o dinheiro|a grana)|perdeu|perdeu playboy|me da (o|a) (dinheiro|carteira|celular|grana)|passa ai|passa logo|mao no bolso)/.test(t)) {
    if (ped.roubado) return { fala: pick(FALAS.jaDeu, Math.random()), acao: 'maos' };
    if (!armado) { const v = ped.persona.jeito; if (v === 'medroso' || v === 'nervoso') return { fala: pick(FALAS.dinheiro.medo, Math.random()), acao: 'dinheiro' }; return { fala: pick(FALAS.semArma, Math.random()), acao: v === 'valente' ? 'nenhuma' : 'fugir' }; }
    return { fala: pick(ped.persona.jeito === 'valente' || ped.persona.jeito === 'debochado' ? FALAS.dinheiro.brabo : FALAS.dinheiro.medo, Math.random()), acao: 'dinheiro' };
  }
  if (/(mao(s)? (pra|para) cima|levanta (a|as) mao|maos ao alto|mao na cabeca|levanta a mao)/.test(t)) return { fala: pick(armado ? FALAS.maos.medo : FALAS.maos.brabo, Math.random()), acao: 'maos' };
  if (/(deita|no chao|cara no chao|deita no chao)/.test(t)) return { fala: pick(FALAS.deitar, Math.random()), acao: armado ? 'deitar' : 'nenhuma' };
  if (/(me segue|segue eu|bora comigo)/.test(t)) return { fala: pick(FALAS.seguir, Math.random()), acao: 'seguir' };
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
    .npcfala{position:fixed;transform:translate(-50%,-100%);max-width:min(340px,70vw);background:#fff;color:#111;font:600 14px system-ui;padding:8px 11px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.4);display:none;pointer-events:none;z-index:5}
    .npcfala b{display:block;font-size:11px;color:#a33;margin-bottom:2px}
    .npcfala:after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#fff}
    #npcvoce{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);font:600 15px system-ui;color:#ffd34d;text-shadow:0 1px 3px #000;pointer-events:none;display:none;max-width:80vw;text-align:center}
    #npcin{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);width:min(440px,84vw);font-size:15px;padding:9px 11px;border-radius:8px;border:1px solid #556;background:rgba(12,15,20,.92);color:#fff;display:none;z-index:6}
    #mic{position:fixed;left:50%;top:22%;transform:translateX(-50%);font:800 18px system-ui;color:#fff;background:rgba(200,30,30,.85);padding:8px 16px;border-radius:30px;display:none;pointer-events:none}`;
  document.head.appendChild(css);
  const mk = (tag, id) => { const d = document.createElement(tag); d.id = id; document.body.appendChild(d); return d; };
  const carteira = mk('div', 'carteira'), dica = mk('div', 'npcdica'), voce = mk('div', 'npcvoce'), mic = mk('div', 'mic'); const inp = mk('input', 'npcin');
  inp.maxLength = 200; inp.placeholder = 'Fale com o pedestre… (Enter envia, Esc cancela)'; inp.autocomplete = 'off'; mic.textContent = '● Ouvindo… (solte V para enviar)';
  const hud = () => { carteira.textContent = `💵 R$ ${st.money}`; }; hud();
  let falaT = 0, voceT = 0;
  // ---- voz do NPC (sintetizador do navegador, português)
  let vozes = []; const loadV = () => { vozes = (speechSynthesis?.getVoices?.() || []).filter(v => /^pt/i.test(v.lang)); }; try { loadV(); speechSynthesis.onvoiceschanged = loadV; } catch {}
  function falar(p, txt, fundo = false) { // fundo = conversa entre NPCs: não interrompe ninguém
    try { if (fundo) { if (speechSynthesis.speaking || st.talkingUntil > performance.now()) return; } else speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR';
      const br = vozes.filter(v => /pt-BR/i.test(v.lang)); const pool = br.length ? br : vozes; if (pool.length) { const fem = pool.filter(v => /(female|feminina|maria|francisca|luciana|vitoria|thalita|camila)/i.test(v.name)); const mas = pool.filter(v => !fem.includes(v)); const set = p.persona.fem ? (fem.length ? fem : pool) : (mas.length ? mas : pool); u.voice = set[(p.persona.idade + p.persona.nome.length) % set.length]; }
      u.pitch = p.persona.fem ? 1.15 : (p.persona.idade > 55 ? 0.8 : 0.95); u.rate = p.persona.jeito === 'nervoso' || p.persona.jeito === 'medroso' ? 1.15 : 1.0; if (fundo) u.volume = 0.55; speechSynthesis.speak(u); } catch {}
  }
  // balões de fala (um por pessoa; vários ao mesmo tempo)
  const baloes = new Map();
  function mostrar(p, txt, fundo = false) {
    let b = baloes.get(p); if (!b) { const el = document.createElement('div'); el.className = 'npcfala'; document.body.appendChild(el); b = { el, t: 0 }; baloes.set(p, b); }
    b.el.innerHTML = ''; const n = document.createElement('b'); n.textContent = p.persona.nome; b.el.append(n, document.createTextNode(txt)); b.t = Math.max(4, txt.length / 12); b.fundo = fundo;
    if (!fundo) { st.talking = p; st.talkingUntil = performance.now() + b.t * 1000; falaT = b.t; }
  }
  // ---- o que o NPC enxerga em volta (vai junto para a IA)
  const fazendo = q => q.dead ? 'caído no chão, baleado' : q.cuffed ? 'algemado' : q.riding ? 'dentro do carro' : q.act ? ({ maos: 'de mãos pra cima', deitar: 'deitado no chão', seguir: 'seguindo o jogador como refém', papo: 'conversando', ouvir: 'parado conversando com o jogador', parar: 'parado' }[q.act.t] || 'parado') : q.panic > 0 ? 'correndo assustado' : 'andando na rua';
  function vizinhos(p, raio = 15) { return peds.filter(q => q !== p && !q.riding && Math.hypot(q.x - p.x, q.z - p.z) < raio).map(q => ({ q, d: Math.hypot(q.x - p.x, q.z - p.z) })).sort((a, b) => a.d - b.d).slice(0, 6); }
  function arredores(p) {
    const R = ctx.remotes ? ctx.remotes() : null, jog = [];
    if (R) for (const o of R.values()) if (Math.hypot((o.car ? o.cx : o.x) - p.x, (o.car ? o.cz : o.z) - p.z) < 40) jog.push(o.name);
    const lug = [...new Set((ctx.landmarks || []).filter(l => Math.hypot(l.x - p.x, l.z - p.z) < 90).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).map(l => l.name))].slice(0, 6);
    const h = new Date(); return { pessoas: vizinhos(p).map(({ q, d }) => ({ nome: q.persona.nome, profissao: q.persona.profissao, dist: Math.round(d), fazendo: fazendo(q) })), jogadores: jog, lugares: lug, rua: ctx.rua ? ctx.rua() : '', noCarro: !!player.inCar, hora: `${h.getHours()}h${String(h.getMinutes()).padStart(2, '0')}` };
  }
  // ---- pedestre alvo: o mais perto na frente (até 5 m)
  function alvo() {
    // quem está com você (algemado, refém seguindo, ou dentro do carro) ouve de qualquer lado
    let comigo = null, cd = 8;
    for (const p of peds) { if (p.dead) continue; if (!(p.cuffed || p.riding || (p.act && p.act.t === 'seguir'))) continue; const d = p.riding ? 0 : Math.hypot(p.x - player.x, p.z - player.z); if (d < cd) { cd = d; comigo = p; } }
    if (player.inCar) return comigo; // no carro: só o refém que está junto
    const fw = [Math.sin(player.yaw), Math.cos(player.yaw)]; let best = null, bd = 5;
    for (const p of peds) { if (p.dead) continue; const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz); if (d < bd && (d < 1.6 || (dx * fw[0] + dz * fw[1]) / d > 0.2)) { bd = d; best = p; } }
    if (best && (!comigo || bd < 2.2)) return best; // alguém bem na sua frente tem preferência
    return comigo || best;
  }
  // ---- aplicar a ação no boneco
  function agir(p, acao, c = {}) {
    p.panic = 0; const eraRefem = p.act && p.act.t === 'seguir' && acao !== 'liberar' && acao !== 'fugir'; p.act = null;
    if (eraRefem && acao !== 'seguir') { p.act = { t: 'seguir', time: 600, up: c.armado }; if (acao === 'dinheiro' && !p.roubado) { p.roubado = true; const v = p.dinheiro; setTimeout(() => { st.money += v; hud(); addChat('', `${p.persona.nome} te entregou R$ ${v}`); }, 900); } return; }
    if (acao === 'seguir') { p.act = { t: 'seguir', time: 600, up: c.armado }; return; } // refém: vai junto (até no carro)
    if (acao === 'maos') p.act = { t: 'maos', time: 25 };
    if (acao === 'dinheiro') { p.act = { t: 'maos', time: 20 }; if (!p.roubado) { const v = p.dinheiro; p.roubado = true; setTimeout(() => { st.money += v; hud(); addChat('', `${p.persona.nome} te entregou R$ ${v}`); }, 900); } }
    if (acao === 'deitar') p.act = { t: 'deitar', time: 25 };
    if (acao === 'seguir') p.act = { t: 'seguir', time: 90 };
    if (acao === 'fugir') { p.panic = 14; }
    if (acao === 'parar') p.act = { t: 'parar', time: 12 };
    if (acao === 'policia') { p.panic = 10; addChat('', `${p.persona.nome} disse que vai chamar a polícia!`); }
    if (acao === 'nenhuma') p.act = { t: 'ouvir', time: 60 }; // fica conversando enquanto você estiver perto
    if (acao === 'liberar') p.act = { t: 'ouvir', time: 4 };
  }
  // ---- conversa
  async function dizer(texto) {
    texto = (texto || '').trim(); if (!texto) return; const p = alvo();
    voce.textContent = '“' + texto + '”'; voce.style.display = 'block'; voceT = 4;
    if (!p) { dica.textContent = 'Ninguém perto para ouvir'; dica.style.display = 'block'; setTimeout(() => dica.style.display = 'none', 1800); return; }
    if (!(p.act && ['seguir', 'maos', 'deitar'].includes(p.act.t))) p.act = { t: 'ouvir', time: 60 }; p.talkYaw = Math.atan2(player.x - p.x, player.z - p.z);
    if (p.conversa) p.conversa.fim = true; // se estava papeando com outro NPC, para para te ouvir
    const W = combat ? combat.st.w : '', armado = !!(W && W !== 'algema'), ctx2 = { armado, arma: W, mirando: !!(combat && combat.st.aiming && armado), dinheiro: p.dinheiro, jaDeuDinheiro: !!p.roubado, algemado: !!p.cuffed, refem: !!(p.act && p.act.t === 'seguir'), arredores: arredores(p) };
    const tn = norm(texto);
    let r = regras(tn, ctx2, p);
    // "quem é essa pessoa do lado?" — responde com quem está mesmo perto dele
    if (!r && /(quem e (ele|ela|esse|essa|aquele|aquela)|nome (dele|dela|desse|dessa|daquele|daquela|da pessoa|do cara|da mulher|do moco|da moca)|conhece (ele|ela|esse|essa|aquele|aquela)|(pessoa|cara|mulher|moco|moca|homem|senhor|senhora|velho|menino|menina) (do|ao) (seu )?lado)/.test(tn)) {
      const v = vizinhos(p, 12)[0];
      if (v) r = { fala: pick([`Aquele ali é ${v.q.persona.nome}, ${v.q.persona.profissao}. Gente boa.`, `É ${v.q.persona.nome}, conheço de vista, é ${v.q.persona.profissao} aqui na Ilha.`, `Ué, é ${v.q.persona.nome}! Tá ${fazendo(v.q)} ali.`], Math.random()), acao: 'nenhuma', local: true };
      else r = { fala: 'Tem ninguém do meu lado não, sô.', acao: 'nenhuma', local: true };
    }
    // com arma na mão, ninguém é valente: sem IA, ele obedece ordens básicas por amor à vida
    if (!r) { // conversa livre: IA do servidor
      if (st.busy && performance.now() - st.busyAt < 18000) { dica.textContent = `${p.persona.nome} ainda está pensando…`; dica.style.display = 'block'; return; }
      st.busy = true; st.busyAt = performance.now(); mostrar(p, '…');
      try { const res = await fetch('/npc', { method: 'POST', signal: AbortSignal.timeout(16000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, persona: p.persona, ctx: ctx2, hist: p.hist.slice(-8) }) });
        if (res.status === 503 && !st.avisouChave) { st.avisouChave = true; addChat('', 'IA dos NPCs desligada: falta a chave GEMINI_API_KEY no servidor (usando respostas prontas)'); }
        if (res.status === 502 && !st.avisouErro) { st.avisouErro = true; addChat('', 'A IA dos NPCs deu erro agora; usando respostas prontas'); }
        if (res.ok) r = await res.json(); else if (res.status === 429 && !st.avisouLimite) { st.avisouLimite = true; addChat('', 'A IA grátis atingiu o limite do Google por agora; os NPCs usam respostas prontas até liberar'); }
      } catch {}
      st.busy = false;
      if (!r || !r.fala) r = papo(norm(texto), ctx2, p) || { fala: ctx2.armado ? pick(['Por favor, eu faço o que você mandar, só não atira!', 'Fala o que você quer, eu faço, juro!'], Math.random()) : pick(FALAS.generico, Math.random()), acao: ctx2.armado ? 'maos' : 'nenhuma' };
    }
    p.hist.push({ r: 'eu', t: texto }, { r: 'npc', t: r.fala }); if (p.hist.length > 16) p.hist.splice(0, p.hist.length - 16);
    mostrar(p, r.fala); falar(p, r.fala); agir(p, r.acao, ctx2);
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
  // ---- NPCs conversando entre si (perto do jogador): diálogo pela IA, ou pronto quando a IA não responde
  const DIALOGOS = [
    [[0, 'Ô {B}, quanto tempo, sô!'], [1, 'Uai, {A}! Tava sumido, hein?'], [0, 'Trabalhando demais, rapaz. E a família?'], [1, 'Tudo em paz, graças a Deus. Passa lá em casa domingo!']],
    [[0, 'Viu o preço do pão lá na padaria?'], [1, 'Vi, tá um absurdo! Daqui a pouco vou fazer em casa.'], [0, 'E esse calor de Valadares, hein? Não dá trégua.'], [1, 'Nem me fala, tô derretendo aqui.']],
    [[0, 'O Galo ganhou ontem, viu?'], [1, 'Vi nada, sô, sou Cruzeiro, não assisto essas coisas.'], [0, 'Kkkk, tá doído ainda, né?'], [1, 'Vai chegar a nossa vez, pode esperar.']],
    [[0, 'Cê ficou sabendo da fofoca da Rua Doze?'], [1, 'Não! Conta aí, {A}.'], [0, 'Depois te conto, que tem gente olhando...'], [1, 'Ah não, agora fiquei curioso!']],
    [[0, '{B}, o Coelho Diniz tá com promoção hoje.'], [1, 'Sério? Vou passar lá depois do serviço.'], [0, 'Vai cedo que acaba rápido.'], [1, 'Valeu pela dica!']],
    [[0, 'Esse movimento na Ilha tá cada vez maior.'], [1, 'É, depois que abriram essas lojas novas lotou.'], [0, 'Bom pro comércio, ruim pra estacionar.'], [1, 'Kkkk, isso é verdade.']],
  ];
  const DIALOGOS_SUSTO = [
    [[0, 'Cê ouviu esse tiro?!'], [1, 'Ouvi! Vamos sair daqui, {A}!'], [0, 'Meu Deus, esse povo tá doido...'], [1, 'Bora, bora, antes que sobre pra gente!']],
  ];
  const conversas = []; let procuraT = 3, iaConversaT = 0;
  const livre = q => !q.dead && !q.cuffed && !q.riding && !q.act && !(q.panic > 0) && !q.conversa;
  function iniciarConversa() {
    if (conversas.length >= 3) return;
    const perto = peds.filter(q => livre(q) && Math.hypot(q.x - player.x, q.z - player.z) < 45);
    for (const a of perto) {
      const b = perto.find(q => q !== a && Math.hypot(q.x - a.x, q.z - a.z) < 12); if (!b) continue; // o segundo vai até o primeiro
      const c = { a, b, falas: null, i: 0, t: 0.8, fim: false, vida: 75 };
      a.conversa = b.conversa = c; a.act = { t: 'papo', time: 80, face: b }; b.act = { t: 'papo', time: 80, face: a, goto: true };
      conversas.push(c); carregar(c); return;
    }
  }
  function dialogoPronto(c, susto) { const d = pick(susto ? DIALOGOS_SUSTO : DIALOGOS, Math.random()); return d.map(([q, f]) => [q, f.replace(/\{A\}/g, c.a.persona.nome).replace(/\{B\}/g, c.b.persona.nome)]); }
  async function carregar(c) {
    const tiros = peds.some(q => q.panic > 0 && Math.hypot(q.x - c.a.x, q.z - c.a.z) < 40);
    if (performance.now() < iaConversaT || st.semIA) { c.falas = dialogoPronto(c, tiros); return; }
    iaConversaT = performance.now() + 15000; // uma conversa pela IA a cada 15 s (economiza o limite grátis)
    try {
      const r = await fetch('/npc-conversa', { method: 'POST', signal: AbortSignal.timeout(16000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: c.a.persona, b: c.b.persona, ctx: { ...arredores(c.a), tiros } }) });
      if (r.status === 503) st.semIA = true;
      if (r.ok) { const j = await r.json(); if (j.falas && j.falas.length) { c.falas = j.falas.map(f => [f.quem, f.fala]); return; } }
    } catch {}
    c.falas = dialogoPronto(c, tiros);
  }
  function tocarConversas(dt) {
    if ((procuraT -= dt) <= 0) { procuraT = 6 + Math.random() * 6; iniciarConversa(); }
    for (let k = conversas.length - 1; k >= 0; k--) {
      const c = conversas[k]; c.vida -= dt;
      const acabou = c.falas && c.i >= c.falas.length && c.t <= 0;
      if (c.fim || acabou || c.vida <= 0 || c.a.dead || c.b.dead || c.a.panic > 0 || c.b.panic > 0 || Math.hypot(c.a.x - player.x, c.a.z - player.z) > 70) {
        for (const q of [c.a, c.b]) { q.conversa = null; if (q.act && q.act.t === 'papo') q.act = null; }
        conversas.splice(k, 1); continue;
      }
      if (!c.falas || (c.t -= dt) > 0 || c.i >= c.falas.length) continue;
      const [quem, f] = c.falas[c.i++], p = quem ? c.b : c.a;
      mostrar(p, f, true); if (Math.hypot(p.x - player.x, p.z - player.z) < 14) falar(p, f, true);
      c.t = Math.max(2.8, f.length / 13 + 1.2);
    }
  }
  // ---- por quadro: dica, conversas, posição dos balões
  const V3 = new T.Vector3();
  function update(dt) {
    const p = alvo(); const falando = st.talkingUntil > performance.now();
    if (p && !st.listening && inp.style.display !== 'block' && !falando) { dica.textContent = `${p.persona.nome} · segure V para falar · N para digitar`; dica.style.display = 'block'; } else if (!st.listening) dica.style.display = 'none';
    tocarConversas(dt);
    for (const [q, b] of baloes) {
      b.t -= dt; if (b.t <= 0 || q.dead) { b.el.remove(); baloes.delete(q); continue; }
      const px = q.riding ? player.x : q.x, pz = q.riding ? player.z : q.z;
      V3.set(px, (q.y || 0) + 2.25, pz).project(camera); const d = Math.hypot(px - player.x, pz - player.z);
      const vis = V3.z < 1 && Math.abs(V3.x) < 1.1 && Math.abs(V3.y) < 1.1 && (!b.fundo || d < 30);
      b.el.style.display = vis ? 'block' : 'none'; b.el.style.left = (V3.x + 1) / 2 * innerWidth + 'px'; b.el.style.top = (1 - V3.y) / 2 * innerHeight - 8 + 'px'; b.el.style.opacity = b.fundo ? 0.85 : 1;
    }
    if (voceT > 0 && (voceT -= dt) <= 0 && !st.listening) voce.style.display = 'none';
  }
  return { update, st, dizer, alvo };
}
