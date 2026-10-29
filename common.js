const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v, dec = 0) => (v < 0 ? "– " : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const sbrl = (v) => (v > 0 ? "+ " : "") + brl(v);
const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const pct = (v) => v.toFixed(2).replace(".", ",") + "%";
const usdf = (v) => "R$ " + v.toFixed(2).replace(".", ",");
const dpp = (v) => (v > 0 ? "▲ +" : v < 0 ? "▼ –" : "") + Math.abs(v).toFixed(2).replace(".", ",") + " p.p.";
const dusd = (v) => (v > 0 ? "▲ +" : v < 0 ? "▼ –" : "") + "R$ " + Math.abs(v).toFixed(2).replace(".", ",");
const ROLE_NAME = { tomador: "Empresa endividada", aplicador: "Fundo de renda fixa", importadora: "Importadora", exportadora: "Exportadora", especulador: "Tesouraria" };
const ROLE_SHORT = { tomador: "Endividada", aplicador: "Fundo", importadora: "Importadora", exportadora: "Exportadora", especulador: "Tesouraria" };
const ROLE_MKT = { tomador: "juros", aplicador: "juros", importadora: "cambio", exportadora: "cambio" };
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
// texto da posição em swap
function legText(m, n) {
  if (!n) return m === "juros" ? "Sem swap de juros" : "Sem swap cambial";
  const k = Math.abs(n), c = k + " contrato" + (k > 1 ? "s" : "");
  if (m === "juros") return (n > 0 ? "Ativo em DI × Passivo em pré" : "Ativo em pré × Passivo em DI") + " · " + c;
  return (n > 0 ? "Ativo em dólar × Passivo em DI" : "Ativo em DI × Passivo em dólar") + " · " + c;
}
function posLabel(m, n) {
  if (!n) return "0";
  return (m === "juros" ? (n > 0 ? "DI" : "PRÉ") : (n > 0 ? "US$" : "DI")) + Math.abs(n);
}
// gráfico de linha simples por rodada
function chartSVG(history, key, opts = {}) {
  const W = opts.w || 640, H = opts.h || 200, P = { l: 56, r: 16, t: 14, b: 28 };
  const n = Math.max(opts.total || history.length - 1, history.length - 1, 1);
  const vals = history.map((h) => h[key]);
  const step = opts.step;
  let lo = Math.floor((Math.min(...vals) - step / 2) / step) * step, hi = Math.ceil((Math.max(...vals) + step / 2) / step) * step;
  if (hi - lo < 2 * step) hi = lo + 2 * step;
  const x = (i) => P.l + (i / n) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  let g = "";
  for (let v = lo; v <= hi + 1e-9; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#E3E7EE"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#5F6B7A">${opts.fmt(v)}</text>`;
  for (let i = 0; i <= n; i++) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#5F6B7A">${i === 0 ? "Início" : i}</text>`;
  const c = opts.color;
  const line = `<polyline fill="none" stroke="${c}" stroke-width="3" points="${history.map((h, i) => x(i) + "," + y(h[key])).join(" ")}"/>` +
    history.map((h, i) => `<circle cx="${x(i)}" cy="${y(h[key])}" r="${h.credito ? 7 : 4}" fill="${h.credito ? "#B83A2E" : c}"/>`).join("");
  const last = history[history.length - 1], li = history.length - 1, left = li < n / 2;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)} por rodada">${g}${line}
    <text x="${x(li) + (left ? 10 : -10)}" y="${y(last[key]) - 12}" text-anchor="${left ? "start" : "end"}" font-size="14" font-weight="700" fill="${c}" stroke="#fff" stroke-width="4" paint-order="stroke">${opts.fmt(last[key], true)}</text></svg>`;
}
function charts(history, total, small) {
  const h = small ? 150 : 190;
  return `<div class="chart"><div class="kicker" style="margin-bottom:4px">Taxa pré 1 ano (swap DI × pré)</div>${chartSVG(history, "pre", { total, h, step: 0.5, color: "#232D5F", label: "Taxa pré", fmt: (v) => v.toFixed(1).replace(".", ",") + "%" })}</div>
    <div class="chart" style="margin-top:10px"><div class="kicker" style="margin-bottom:4px">Dólar (R$)</div>${chartSVG(history, "usd", { total, h, step: 0.1, color: "#007F99", label: "Dólar", fmt: (v, last) => (last ? "R$ " : "") + v.toFixed(2).replace(".", ",") })}</div>`;
}
const num = (v) => (v > 0 ? "+" : v < 0 ? "–" : "") + Math.abs(v).toLocaleString("pt-BR");
