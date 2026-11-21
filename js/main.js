/* =========================================================
   main.js: DOM, eventos, loading, erros e formatação
   Usa api.js para buscar taxas e storage.js para o histórico.
   ========================================================= */

import { loadCurrencies, getRate } from "./api.js";
import {
  getHistory,
  addHistoryEntry,
  clearHistory,
  getPair,
  savePair,
} from "./storage.js";

const DEBOUNCE_MS = 400; // espera o usuário parar de digitar

/* ---------- Elementos e estado ---------- */

const $ = (id) => document.getElementById(id);

const els = {
  form: $("form"),
  amount: $("amount"),
  from: $("from"),
  to: $("to"),
  swap: $("swap"),
  panel: $("result-panel"),
  label: $("result-label"),
  value: $("result-value"),
  rate: $("result-rate"),
  status: $("status"),
  retry: $("retry"),
  history: $("history"),
  historyEmpty: $("history-empty"),
  clearHistory: $("clear-history"),
};

const state = {
  controller: null, // AbortController da requisição em andamento
  history: [], // [{ amount, from, to, result }]
  turns: 0, // quantas vezes o botão de inverter girou
};

/* ---------- Números: leitura, arredondamento, formatação ---------- */

// Aceita "100", "12.5" e "12,5". Devolve { ok, value } ou { ok:false, message }.
function parseAmount(text) {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");

  if (clean === "") return { ok: false, empty: true };

  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) {
    return { ok: false, message: "Digite apenas números, por exemplo 100 ou 12,50." };
  }

  const value = Number(clean);
  if (!Number.isFinite(value) || value > 1e12) {
    return { ok: false, message: "Esse valor é grande demais." };
  }

  return { ok: true, value };
}

// Arredondamento seguro: Number.EPSILON evita casos como 1.005 -> 1.00.
function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// Valores menores que 1 ganham mais casas para não virar "0,00".
function decimalsFor(value) {
  return value === 0 || Math.abs(value) >= 1 ? 2 : 4;
}

function formatMoney(value, code) {
  const d = decimalsFor(value);
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(value);
  } catch {
    // código que o Intl não reconhece como moeda
    return `${value.toLocaleString("pt-BR", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    })} ${code}`;
  }
}

function formatNumber(value) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

function formatRate(rate) {
  return rate.toLocaleString("pt-BR", { maximumSignificantDigits: 6 });
}

function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("pt-BR");
}

/* ---------- Moedas (selects) ---------- */

const displayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["pt-BR"], { type: "currency" })
    : null;

function currencyName(code) {
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function fillSelect(select, codes, selected) {
  select.replaceChildren(
    ...codes.map((code) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${code}: ${currencyName(code)}`;
      option.selected = code === selected;
      return option;
    })
  );
}

/* ---------- Interface: status, loading, resultado ---------- */

function setLoading(on) {
  els.panel.setAttribute("aria-busy", String(on));
  els.panel.classList.toggle("is-loading", on);
}

// type: "info" | "warning" | "error". Só o erro mostra "Tentar de novo".
function setStatus(message, type = "info") {
  els.status.textContent = message;
  els.status.dataset.type = type;
  els.retry.hidden = type !== "error";
}

function clearResult() {
  els.label.textContent = "";
  els.value.textContent = "—";
  els.rate.textContent = "";
}

function showResult({ amount, from, to, result, rate, date }) {
  els.label.textContent = `${formatNumber(amount)} ${from} equivalem a`;
  els.value.textContent = formatMoney(result, to);

  const when = date ? `, taxa de ${formatDate(date)}` : "";
  els.rate.textContent = `1 ${from} = ${formatRate(rate)} ${to}${when}`;
}

function friendlyError(err) {
  if (err instanceof TypeError) {
    return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
  }
  return err.message || "Algo deu errado. Tente de novo.";
}

/* ---------- Conversão ---------- */

async function convert({ save = true } = {}) {
  const parsed = parseAmount(els.amount.value);

  if (!parsed.ok) {
    state.controller?.abort();
    setLoading(false);
    clearResult();
    setStatus(parsed.empty ? "" : parsed.message, "warning");
    return;
  }

  const from = els.from.value;
  const to = els.to.value;
  if (!from || !to) return;

  // Cancela a requisição anterior: só a mais recente importa.
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;

  setLoading(true);
  setStatus("Buscando taxa…");

  try {
    const { rate, date } = await getRate(from, to, controller.signal);

    // Segurança extra: ignora resposta de uma conversão que já ficou velha.
    if (controller !== state.controller) return;

    const raw = parsed.value * rate;
    const result = roundTo(raw, decimalsFor(raw));

    showResult({ amount: parsed.value, from, to, result, rate, date });
    setStatus("");

    if (save) {
      state.history = addHistoryEntry({ amount: parsed.value, from, to, result });
      renderHistory();
    }
  } catch (err) {
    if (err.name === "AbortError") return; // cancelada de propósito

    clearResult();
    setStatus(friendlyError(err), "error");
    console.error(err);
  } finally {
    // Só desliga o loading se esta ainda for a conversão atual.
    if (controller === state.controller) setLoading(false);
  }
}

function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

const convertDebounced = debounce(convert, DEBOUNCE_MS);

/* ---------- Histórico (tela) ---------- */

function renderHistory() {
  els.history.replaceChildren(
    ...state.history.map((entry) => {
      const li = document.createElement("li");
      const button = document.createElement("button");

      button.type = "button";
      button.className = "history-item";
      button.textContent = `${formatNumber(entry.amount)} ${entry.from} = ${formatMoney(entry.result, entry.to)}`;
      button.addEventListener("click", () => reuse(entry));

      li.append(button);
      return li;
    })
  );

  const empty = state.history.length === 0;
  els.historyEmpty.hidden = !empty;
  els.clearHistory.hidden = empty;
}

function reuse(entry) {
  els.amount.value = String(entry.amount).replace(".", ",");
  els.from.value = entry.from;
  els.to.value = entry.to;
  savePair(els.from.value, els.to.value);
  convert({ save: false });
}

/* ---------- Ações ---------- */

function swapCurrencies() {
  [els.from.value, els.to.value] = [els.to.value, els.from.value];

  state.turns += 1;
  els.swap.style.setProperty("--turn", `${state.turns * 180}deg`);

  savePair(els.from.value, els.to.value);
  convert();
}

function onCurrencyChange() {
  savePair(els.from.value, els.to.value);
  convert(); // troca de opção converte na hora
}

/* ---------- Inicialização ---------- */

async function init() {
  state.history = getHistory();
  renderHistory();

  setLoading(true);
  setStatus("Carregando moedas…");

  const codes = await loadCurrencies();
  const saved = getPair();
  const pick = (wanted, fallback) => (codes.includes(wanted) ? wanted : fallback);

  const from = pick(saved.from ?? "USD", codes[0]);
  const to = pick(saved.to ?? "BRL", codes.find((c) => c !== from) ?? codes[1]);

  fillSelect(els.from, codes, from);
  fillSelect(els.to, codes, to);
  els.from.disabled = false;
  els.to.disabled = false;

  // Eventos
  els.amount.addEventListener("input", convertDebounced);
  els.from.addEventListener("change", onCurrencyChange);
  els.to.addEventListener("change", onCurrencyChange);
  els.swap.addEventListener("click", swapCurrencies);
  els.retry.addEventListener("click", () => convert());
  els.form.addEventListener("submit", (event) => {
    event.preventDefault(); // Enter não recarrega a página
    convert();
  });
  els.clearHistory.addEventListener("click", () => {
    state.history = clearHistory();
    renderHistory();
  });

  convert({ save: false });
}

init();