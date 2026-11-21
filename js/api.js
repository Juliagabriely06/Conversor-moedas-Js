/* =========================================================
   api.js: comunicação com a Frankfurter (sem chave de API)
   fetch, async/await, tratamento de erro HTTP e cache por moeda base.
   Este módulo não mexe no DOM: só busca e devolve dados.
   ========================================================= */

const API = "https://api.frankfurter.dev/v2";
const CACHE_TTL = 10 * 60 * 1000; // taxas de cada moeda base ficam em cache por 10 minutos

// Se a lista de moedas da API falhar, o app continua funcionando com estas.
const FALLBACK_CURRENCIES = [
  "AUD", "BRL", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "MXN", "USD",
];

// Cache por moeda base: "USD" -> { rates: { BRL: 5.3, ... }, date, at }
const rateCache = new Map();

/* ---------- Lista de moedas ---------- */

// Não sabemos ao certo o formato da resposta (array de objetos? objeto?),
// então extraímos só os códigos de 3 letras de qualquer um dos formatos.
function normalizeCurrencies(data) {
  let codes = [];

  if (Array.isArray(data)) {
    codes = data.map((item) =>
      typeof item === "string" ? item : item?.iso_code ?? item?.code ?? item?.currency
    );
  } else if (data && typeof data === "object") {
    codes = Object.keys(data);
  }

  const valid = codes
    .filter((c) => typeof c === "string" && /^[A-Za-z]{3}$/.test(c))
    .map((c) => c.toUpperCase());

  return [...new Set(valid)].sort();
}

export async function loadCurrencies() {
  try {
    const res = await fetch(`${API}/currencies`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const codes = normalizeCurrencies(await res.json());
    if (codes.length < 2) throw new Error("Lista de moedas vazia");

    return codes;
  } catch (err) {
    console.warn("Não foi possível carregar as moedas, usando a lista padrão.", err);
    return FALLBACK_CURRENCIES;
  }
}

/* ---------- Taxas de câmbio ---------- */

// Extrai { rates: { BRL: 5.3, EUR: 0.92, ... }, date } da resposta de /rates.
// Não confirmei o formato exato, então aceitamos os formatos mais prováveis:
//   - lista de linhas: [{ date, base, quote, rate }, ...]
//   - objeto: { date, base, rates: { BRL: 5.3, ... } } ou { BRL: 5.3, ... }
export function parseRates(data) {
  const rates = {};
  let date = null;

  const add = (code, value) => {
    const n = Number(value);
    if (typeof code === "string" && /^[A-Za-z]{3}$/.test(code) && Number.isFinite(n) && n > 0) {
      rates[code.toUpperCase()] = n;
    }
  };

  if (Array.isArray(data)) {
    for (const row of data) {
      add(row?.quote, row?.rate);
      if (!date && row?.date) date = row.date;
    }
  } else if (data && typeof data === "object") {
    const map = data.rates && typeof data.rates === "object" ? data.rates : data;
    for (const [code, value] of Object.entries(map)) add(code, value);
    date = data.date ?? null;
  }

  return { rates, date };
}

function getCached(base) {
  const entry = rateCache.get(base);
  return entry && Date.now() - entry.at < CACHE_TTL ? entry : null;
}

// Uma requisição traz as taxas de UMA moeda base contra todas as outras.
async function fetchBaseRates(base, signal) {
  const res = await fetch(`${API}/rates?base=${base.toLowerCase()}`, { signal });

  // fetch só rejeita em falha de rede: erro HTTP (404, 500...) precisamos checar.
  if (!res.ok) {
    throw new Error(
      res.status === 404 || res.status === 422
        ? "Não há taxas disponíveis para essa moeda."
        : `O servidor respondeu com erro ${res.status}.`
    );
  }

  const { rates, date } = parseRates(await res.json());
  if (Object.keys(rates).length === 0) {
    throw new Error("A API devolveu uma resposta inesperada.");
  }

  const entry = { rates, date, at: Date.now() };
  rateCache.set(base, entry);
  return entry;
}

// Devolve { rate, date } para o par from -> to, usando o cache sempre que possível.
export async function getRate(from, to, signal) {
  if (from === to) return { rate: 1, date: null };

  // 1) Já temos as taxas da moeda de origem? Trocar o destino não faz fetch.
  let entry = getCached(from);
  if (entry?.rates[to]) return { rate: entry.rates[to], date: entry.date };

  // 2) Temos as taxas do destino? Então a taxa inversa é 1 / taxa (sem fetch).
  //    É o que acontece ao inverter as moedas.
  const reverse = getCached(to);
  if (reverse?.rates[from]) return { rate: 1 / reverse.rates[from], date: reverse.date };

  // 3) Nada no cache: busca as taxas da moeda de origem.
  entry = await fetchBaseRates(from, signal);
  if (!entry.rates[to]) throw new Error("Não há taxa disponível para esse par de moedas.");

  return { rate: entry.rates[to], date: entry.date };
}