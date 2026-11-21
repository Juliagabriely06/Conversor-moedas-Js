/* =========================================================
   storage.js: histórico e último par de moedas no localStorage
   Todo acesso é protegido com try/catch: se o storage estiver
   bloqueado ou o JSON corrompido, o app segue funcionando.
   ========================================================= */

const KEYS = { history: "conversor:history", pair: "conversor:pair" };
const HISTORY_LIMIT = 5;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem storage: o app segue funcionando, só não lembra */
  }
}

/* ---------- Histórico ---------- */

export function getHistory() {
  const list = loadJSON(KEYS.history, []);
  return Array.isArray(list) ? list.slice(0, HISTORY_LIMIT) : [];
}

// entry: { amount, from, to, result }. Devolve o histórico atualizado.
export function addHistoryEntry(entry) {
  // Remove repetição da mesma conversão e coloca a nova no topo.
  const updated = [
    entry,
    ...getHistory().filter(
      (h) => !(h.amount === entry.amount && h.from === entry.from && h.to === entry.to)
    ),
  ].slice(0, HISTORY_LIMIT);

  saveJSON(KEYS.history, updated);
  return updated;
}

export function clearHistory() {
  saveJSON(KEYS.history, []);
  return [];
}

/* ---------- Último par de moedas ---------- */

export function getPair() {
  const pair = loadJSON(KEYS.pair, {});
  return pair && typeof pair === "object" ? pair : {};
}

export function savePair(from, to) {
  saveJSON(KEYS.pair, { from, to });
}