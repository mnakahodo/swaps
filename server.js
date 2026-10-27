// Pregão de Swaps — servidor do jogo (Node.js + Socket.IO)
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const CARDS = require("./cards");

// ---------------- parâmetros do jogo (ilustrativos) ----------------
const CFG = {
  notional: 1000000,     // valor de referência por contrato de swap (R$)
  startPre: 13.2,        // taxa pré de 1 ano no início (% a.a.)
  startUsd: 5.0,         // dólar no início (R$)
  startCdi: 13.15,       // CDI no início (% a.a.), só para exibição
  dv01: 10000,           // R$ por contrato a cada 1 p.p. de variação da taxa pré (prazo de 1 ano)
  usdPerContract: 200000,// US$ por contrato no swap cambial (R$ 1 mi ÷ R$ 5,00)
  exposureContracts: 2,  // exposição de cada hedger = 2 contratos (R$ 2 mi ou US$ 400 mil)
  garantiaCusto: 500,    // custo de registrar com garantia na B3, por contrato (R$)
  specCapital: 100000,   // capital da tesouraria (especulador)
  specMax: 3,            // contratos máximos por mercado
  stopLevel: 20000,      // se capital + resultado < este valor, o comitê de risco encerra as posições
  preMin: 6, preMax: 20, usdMin: 3.5, usdMax: 7.5,
};
const ROLE_PATTERN = ["tomador", "importadora", "aplicador", "exportadora", "especulador"];
const ROLES = ["tomador", "aplicador", "importadora", "exportadora", "especulador"];
// mercado e sentido do hedge: +1 = ganha com alta (juros: ativo em DI × passivo pré; câmbio: ativo em dólar × passivo DI)
const HEDGE = {
  tomador: { mkt: "juros", sign: 1 },
  aplicador: { mkt: "juros", sign: -1 },
  importadora: { mkt: "cambio", sign: 1 },
  exportadora: { mkt: "cambio", sign: -1 },
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PUB = path.join(__dirname, "public");

app.get("/", (req, res) => res.sendFile(path.join(PUB, "index.html")));
app.get("/professor", (req, res) => res.sendFile(path.join(PUB, "host.html")));
app.get("/j/:code", (req, res) => res.sendFile(path.join(PUB, "play.html")));
app.get("/jogar", (req, res) => res.sendFile(path.join(PUB, "play.html")));
app.use("/static", express.static(PUB, { maxAge: "1h" }));
app.get("/qr.svg", async (req, res) => {
  const url = String(req.query.u || "").slice(0, 300);
  if (!/^https?:\/\//.test(url)) return res.status(400).send("url inválida");
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#232D5F", light: "#FFFFFF" } });
  res.type("image/svg+xml").send(svg);
});
app.get("/info", (req, res) => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === "IPv4" && !n.internal) ips.push(n.address);
  res.json({ ips, port: PORT });
});
app.get("/health", (req, res) => res.json({ ok: true, games: games.size }));

// ---------------- estado ----------------
const games = new Map();
const rnd = (n) => crypto.randomBytes(n).toString("hex");
function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c;
  do c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join("");
  while (games.has(c));
  return c;
}
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const r2 = (v) => Math.round(v * 100) / 100;

function createGame() {
  const g = {
    code: newCode(), hostToken: rnd(16), createdAt: Date.now(), touched: Date.now(),
    phase: "lobby", round: 0, totalRounds: 8, creditEvent: true, creditRound: 0,
    pre: CFG.startPre, usd: CFG.startUsd, lastPre: 0, lastUsd: 0,
    history: [{ round: 0, pre: CFG.startPre, usd: CFG.startUsd, card: null }],
    deck: [], card: null, players: new Map(), roleSeq: 0,
  };
  games.set(g.code, g);
  return g;
}
function addPlayer(g, name, forceRole) {
  const role = forceRole || ROLE_PATTERN[g.roleSeq++ % ROLE_PATTERN.length];
  const p = {
    id: rnd(6), token: rnd(16), name, role, connected: true, joinedAt: Date.now(),
    pj: 0, pc: 0, pendJ: null, pendC: null, garantia: true, custos: 0,
    mtm: 0, lastMtm: 0, creditLoss: 0, defaulted: false, stopped: false,
    hedgeChosen: false, initialHedge: 0, voteJ: null, voteC: null, points: 0, correct: 0, log: [],
  };
  setupRole(p);
  g.players.set(p.id, p);
  return p;
}
function setupRole(p) {
  p.pj = 0; p.pc = 0; p.pendJ = null; p.pendC = null; p.garantia = true; p.custos = 0;
  p.hedgeChosen = p.role === "especulador";
}

// ---------------- visões ----------------
function publicState(g) {
  const ps = [...g.players.values()];
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, ps.filter((p) => p.role === r).length]));
  const showWhy = g.phase === "result" || g.phase === "end";
  return {
    code: g.code, phase: g.phase, round: g.round, totalRounds: g.totalRounds, creditEvent: g.creditEvent,
    pre: g.pre, usd: g.usd, lastPre: g.lastPre, lastUsd: g.lastUsd, history: g.history,
    card: g.card ? { titulo: g.card.titulo, texto: g.card.texto, inspiracao: g.card.inspiracao, credito: !!g.card.credito && showWhy, porque: showWhy ? g.card.porque : null } : null,
    players: ps.length, roleCounts,
    voted: ps.filter((p) => p.voteJ && p.voteC).length,
    hedgeDone: ps.filter((p) => p.hedgeChosen).length,
    cfg: CFG,
  };
}
function playerView(p) {
  return {
    id: p.id, name: p.name, role: p.role, pj: p.pj, pc: p.pc, pendJ: p.pendJ, pendC: p.pendC, garantia: p.garantia, custos: p.custos,
    mtm: p.mtm, lastMtm: p.lastMtm, creditLoss: p.creditLoss, defaulted: p.defaulted, stopped: p.stopped,
    hedgeChosen: p.hedgeChosen, initialHedge: p.initialHedge, voteJ: p.voteJ, voteC: p.voteC, points: p.points, correct: p.correct, log: p.log.slice(-14),
  };
}
function results(g) {
  const E = CFG.exposureContracts;
  const notional = E * CFG.notional, usdAmt = E * CFG.usdPerContract;
  const rows = [...g.players.values()].map((p) => {
    const r = { id: p.id, name: p.name, role: p.role, points: p.points, correct: p.correct, mtm: p.mtm, custos: p.custos, creditLoss: p.creditLoss,
      defaulted: p.defaulted, stopped: p.stopped, hedge: Math.abs(p.initialHedge || 0), garantia: p.garantia };
    const net = p.mtm - p.custos;
    if (p.role === "tomador") { r.base = g.pre; r.efetivo = g.pre - (net / notional) * 100; r.liquido = net; }
    else if (p.role === "aplicador") { r.base = g.pre; r.efetivo = g.pre + (net / notional) * 100; r.liquido = net; }
    else if (p.role === "importadora") { r.base = g.usd; r.efetivo = g.usd - net / usdAmt; r.liquido = net; }
    else if (p.role === "exportadora") { r.base = g.usd; r.efetivo = g.usd + net / usdAmt; r.liquido = net; }
    else { r.liquido = net; r.saldoFinal = CFG.specCapital + net; }
    return r;
  });
  rows.sort((a, b) => b.points - a.points || b.correct - a.correct);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { finalPre: g.pre, finalUsd: g.usd, startPre: CFG.startPre, startUsd: CFG.startUsd, creditHappened: g.history.some((h) => h.credito), rows };
}
function broadcast(g) {
  g.touched = Date.now();
  const pub = publicState(g);
  const res = g.phase === "end" ? results(g) : null;
  io.to("host:" + g.code).emit("host:state", { ...pub, results: res, list: [...g.players.values()].map((p) => ({ ...playerView(p), connected: p.connected })) });
  for (const p of g.players.values()) io.to("p:" + p.id).emit("player:state", { pub, me: playerView(p), results: res });
}

// ---------------- mecânica ----------------
function buildDeck(g) {
  const normal = shuffle(CARDS.filter((c) => !c.credito));
  const deck = normal.slice(0, g.totalRounds);
  if (g.creditEvent) {
    // evento de crédito numa rodada da segunda metade (nunca a última)
    const lo = Math.ceil(g.totalRounds / 2), hi = g.totalRounds - 1;
    g.creditRound = lo + crypto.randomInt(Math.max(1, hi - lo + 1));
    deck[g.creditRound - 1] = CARDS.find((c) => c.credito);
  }
  return deck;
}
function startRound(g) {
  g.round += 1;
  g.card = g.deck[g.round - 1];
  g.phase = "news";
  for (const p of g.players.values()) { p.voteJ = null; p.voteC = null; p.pendJ = null; p.pendC = null; }
}
function jitter(base) { return base * (0.75 + Math.random() * 0.5); }
function reveal(g) {
  const prevPre = g.pre, prevUsd = g.usd;
  let dPre = r2(jitter(g.card.pre)), dUsd = r2(jitter(g.card.usd));
  if (g.card.pre && Math.abs(dPre) < 0.1) dPre = Math.sign(g.card.pre) * 0.1;
  if (g.card.usd && Math.abs(dUsd) < 0.05) dUsd = Math.sign(g.card.usd) * 0.05;
  g.pre = r2(Math.min(CFG.preMax, Math.max(CFG.preMin, prevPre + dPre)));
  g.usd = r2(Math.min(CFG.usdMax, Math.max(CFG.usdMin, prevUsd + dUsd)));
  dPre = r2(g.pre - prevPre); dUsd = r2(g.usd - prevUsd);
  g.lastPre = dPre; g.lastUsd = dUsd;
  g.history.push({ round: g.round, pre: g.pre, usd: g.usd, card: g.card.titulo, credito: !!g.card.credito });
  const dirJ = dPre > 0 ? "sobe" : dPre < 0 ? "cai" : null;
  const dirC = dUsd > 0 ? "sobe" : dUsd < 0 ? "cai" : null;

  for (const p of g.players.values()) {
    // tesouraria: aplica as novas posições escolhidas
    if (p.role === "especulador" && !p.stopped) {
      if (p.pendJ !== null) p.pj = Math.max(-CFG.specMax, Math.min(CFG.specMax, p.pendJ | 0));
      if (p.pendC !== null) p.pc = Math.max(-CFG.specMax, Math.min(CFG.specMax, p.pendC | 0));
    }
    p.pendJ = null; p.pendC = null;
    const mJ = p.pj * dPre * CFG.dv01, mC = p.pc * dUsd * CFG.usdPerContract;
    const m = Math.round(mJ + mC);
    p.lastMtm = m; p.mtm += m;
    let hit = 0;
    if (p.voteJ && dirJ && p.voteJ === dirJ) hit++;
    if (p.voteC && dirC && p.voteC === dirC) hit++;
    p.points += hit * 50; p.correct += hit;
    const entry = { round: g.round, pre: g.pre, usd: g.usd, dPre, dUsd, pj: p.pj, pc: p.pc, mtm: m, acum: p.mtm, voteJ: p.voteJ, voteC: p.voteC, hits: hit, voted: !!(p.voteJ || p.voteC) };
    // evento de crédito: swaps bilaterais sem garantia perdem o ganho acumulado e a proteção
    if (g.card.credito && p.role !== "especulador" && !p.garantia && (p.pj || p.pc)) {
      p.defaulted = true;
      if (p.mtm > 0) { p.creditLoss = p.mtm; p.mtm = 0; }
      p.pj = 0; p.pc = 0;
      entry.credit = p.creditLoss;
    }
    // tesouraria: limite de risco
    if (p.role === "especulador" && (p.pj || p.pc) && CFG.specCapital + p.mtm < CFG.stopLevel) {
      p.stopped = true; p.pj = 0; p.pc = 0; entry.stop = true;
    }
    p.log.push(entry);
  }
  g.phase = "result";
}
function advance(g) {
  if (g.round >= g.totalRounds) { g.phase = "end"; return; }
  startRound(g);
}

// ---------------- sockets ----------------
io.on("connection", (socket) => {
  socket.on("host:create", (opts, ack) => {
    const g = createGame();
    socket.join("host:" + g.code);
    socket.data = { host: g.code };
    ack && ack({ code: g.code, token: g.hostToken });
    broadcast(g);
  });
  socket.on("host:resume", ({ code, token } = {}, ack) => {
    const g = games.get(String(code || "").toUpperCase());
    if (!g || g.hostToken !== token) return ack && ack({ ok: false });
    socket.join("host:" + g.code);
    socket.data = { host: g.code };
    ack && ack({ ok: true });
    broadcast(g);
  });
  const hostGame = () => (socket.data && socket.data.host ? games.get(socket.data.host) : null);
  socket.on("host:action", (a) => {
    const g = hostGame();
    if (!g || !a) return;
    switch (a.type) {
      case "rounds": if (g.phase === "lobby") g.totalRounds = [6, 8, 10, 12].includes(a.value) ? a.value : 8; break;
      case "credit": if (g.phase === "lobby") g.creditEvent = !g.creditEvent; break;
      case "role": {
        const p = g.players.get(a.id);
        if (p && g.phase === "lobby") { p.role = ROLES[(ROLES.indexOf(p.role) + 1) % ROLES.length]; setupRole(p); }
        break;
      }
      case "kick": if (g.phase === "lobby") g.players.delete(a.id); break;
      case "start": if (g.phase === "lobby" && g.players.size) g.phase = "hedge"; break;
      case "open": if (g.phase === "hedge") {
        for (const p of g.players.values()) {
          p.hedgeChosen = true; // quem não escolheu fica sem hedge
          p.initialHedge = p.pj || p.pc;
          if (p.role !== "especulador" && p.garantia) p.custos = CFG.garantiaCusto * Math.abs(p.initialHedge);
        }
        g.deck = buildDeck(g);
        startRound(g);
      } break;
      case "reveal": if (g.phase === "news") reveal(g); break;
      case "next": if (g.phase === "result") advance(g); break;
      case "restart": {
        Object.assign(g, { phase: "lobby", round: 0, pre: CFG.startPre, usd: CFG.startUsd, lastPre: 0, lastUsd: 0, deck: [], card: null, creditRound: 0,
          history: [{ round: 0, pre: CFG.startPre, usd: CFG.startUsd, card: null }] });
        for (const p of g.players.values()) {
          Object.assign(p, { mtm: 0, lastMtm: 0, creditLoss: 0, defaulted: false, stopped: false, voteJ: null, voteC: null, points: 0, correct: 0, log: [], initialHedge: 0 });
          setupRole(p);
        }
      } break;
    }
    broadcast(g);
  });

  socket.on("player:join", ({ code, name, token } = {}, ack) => {
    const g = games.get(String(code || "").toUpperCase().trim());
    if (!g) return ack && ack({ ok: false, error: "Código de jogo não encontrado." });
    let p = token ? [...g.players.values()].find((x) => x.token === token) : null;
    if (!p) {
      name = clean(name, 24);
      if (!name) return ack && ack({ ok: false, error: "Digite seu nome ou o nome do grupo." });
      if (g.players.size >= 200) return ack && ack({ ok: false, error: "Sala cheia." });
      if (g.phase === "end") return ack && ack({ ok: false, error: "Esta partida já terminou." });
      p = addPlayer(g, name, g.phase === "lobby" ? null : "especulador");
    }
    p.connected = true;
    socket.join("p:" + p.id);
    socket.data = { code: g.code, pid: p.id };
    ack && ack({ ok: true, token: p.token, id: p.id, code: g.code });
    broadcast(g);
  });
  const me = () => {
    const d = socket.data || {};
    const g = d.code && games.get(d.code);
    return g ? { g, p: g.players.get(d.pid) } : {};
  };
  socket.on("player:hedge", (o) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "hedge" || p.role === "especulador" || !o) return;
    const k = Math.max(0, Math.min(CFG.exposureContracts, o.n | 0));
    const h = HEDGE[p.role];
    p.pj = h.mkt === "juros" ? h.sign * k : 0;
    p.pc = h.mkt === "cambio" ? h.sign * k : 0;
    p.garantia = o.garantia !== false;
    p.hedgeChosen = true;
    broadcast(g);
  });
  socket.on("player:vote", (o) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "news" || !o || !["sobe", "cai"].includes(o.v)) return;
    if (o.m === "juros") p.voteJ = o.v; else if (o.m === "cambio") p.voteC = o.v;
    broadcast(g);
  });
  socket.on("player:position", (o) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "news" || p.role !== "especulador" || p.stopped || !o) return;
    const n = Math.max(-CFG.specMax, Math.min(CFG.specMax, o.n | 0));
    if (o.m === "juros") p.pendJ = n; else if (o.m === "cambio") p.pendC = n;
    broadcast(g);
  });
  socket.on("disconnect", () => {
    const { g, p } = me();
    if (g && p) { p.connected = false; broadcast(g); }
  });
});

// limpa partidas paradas há mais de 8 horas
setInterval(() => { const lim = Date.now() - 8 * 3600e3; for (const [c, g] of games) if (g.touched < lim) games.delete(c); }, 600e3);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pregão de Swaps rodando em http://localhost:${PORT}/professor`));
