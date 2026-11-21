# Conversor de moedas

Conversor de moedas que atualiza o resultado enquanto você digita ou troca a moeda. Feito com **JavaScript puro** (sem frameworks e sem build) para praticar `fetch`, `async/await`, tratamento de erros e eventos de formulário.

As taxas vêm da [Frankfurter API](https://frankfurter.dev), gratuita e sem chave de API.

<!-- Dica: adicione aqui um print da tela, por exemplo: ![Tela do conversor](docs/screenshot.png) -->

## Funcionalidades

- Conversão automática ao digitar (`input`) ou ao trocar a moeda (`change`)
- Aceita valores com vírgula ou ponto (`12,50` ou `12.50`) e avisa quando o valor é inválido
- Estados de **loading** e de **erro**, com botão "Tentar de novo"
- Botão para **inverter** as moedas
- **Histórico** das últimas 5 conversões (clique em uma para refazer) e botão para limpar
- Lembra o último par de moedas escolhido
- Layout responsivo, foco visível no teclado e animações que respeitam `prefers-reduced-motion`

## Como rodar

O projeto usa módulos ES (`import`/`export`), então **não funciona abrindo o `index.html` com dois cliques** (endereço `file://`). Use um servidor local:

**Opção 1: VS Code**
Instale a extensão **Live Server**, abra a pasta do projeto e clique em **Go Live**.

**Opção 2: terminal**

```bash
# com Node.js
npx serve

# ou com Python
python -m http.server 8000
```

Depois abra o endereço que aparecer no terminal (por exemplo, `http://localhost:8000`).

Não é preciso instalar dependências nem configurar chave de API. A primeira carga precisa de internet (API e Google Fonts).

## Estrutura

```
conversor-moedas/
├── index.html
├── style.css
└── js/
    ├── api.js       # Comunicação com a API (fetch, async/await, cache)
    ├── storage.js   # Histórico e último par de moedas no localStorage
    └── main.js      # DOM, eventos, loading, erros e formatação
```

| Arquivo | Responsabilidade |
| --- | --- |
| `api.js` | Busca a lista de moedas e as taxas de câmbio, trata erros HTTP e mantém o cache. Não mexe no DOM. |
| `storage.js` | Lê e grava o histórico e o último par de moedas, com proteção contra storage bloqueado. |
| `main.js` | Liga tudo: lê o formulário, chama a API, mostra loading/erro/resultado e renderiza o histórico. |

## Como funciona

### Cache por moeda base

Uma requisição a `/v2/rates?base=usd` traz as taxas do dólar contra todas as outras moedas. Essas taxas ficam em memória por 10 minutos. Assim:

1. **Trocar a moeda de destino** (USD → BRL, depois USD → EUR) não faz nova requisição.
2. **Inverter as moedas** também não: se já existem as taxas de `USD`, a taxa de `BRL → USD` é calculada como `1 / taxa`.
3. Só trocar a moeda de **origem** (para uma que ainda não está no cache) dispara um novo `fetch`.

```
getRate(from, to)
 ├─ from === to?                    → taxa 1
 ├─ cache de "from" tem "to"?       → usa a taxa do cache
 ├─ cache de "to" tem "from"?       → usa 1 / taxa
 └─ senão                           → fetch das taxas de "from" e guarda no cache
```

### Digitação sem excesso de requisições

- **Debounce de 400 ms** no evento `input`: a conversão só roda quando a pessoa para de digitar.
- **`AbortController`**: cada conversão cancela a anterior que ainda estava em andamento, e respostas antigas são ignoradas para não sobrescrever as mais novas.

### Erros

`fetch` só rejeita em falha de rede. Por isso `api.js` também confere `res.ok` e lança um erro com mensagem amigável para respostas como 404 ou 500. Em `main.js`, o `try/catch/finally` garante que o loading sempre termine e que o erro apareça na tela.

### Arredondamento seguro

O JavaScript tem imprecisão de ponto flutuante (`0.1 + 0.2` dá `0.30000000000000004`, e `1.005.toFixed(2)` dá `"1.00"`). A função `roundTo()` usa `Math.round` com `Number.EPSILON`, e a exibição usa `Intl.NumberFormat` em `pt-BR`. Valores menores que 1 mostram 4 casas decimais para não virarem `0,00`.

## API utilizada

[Frankfurter](https://frankfurter.dev): gratuita, de código aberto e sem chave de API.

| Uso | Endpoint |
| --- | --- |
| Lista de moedas | `GET https://api.frankfurter.dev/v2/currencies` |
| Taxas de uma moeda base | `GET https://api.frankfurter.dev/v2/rates?base=usd` |

São **taxas de referência**, publicadas uma ou poucas vezes por dia, e não cotações de mercado ao vivo. Não use este projeto para operações financeiras reais. A API não tem endpoint de conversão: o projeto busca a taxa e faz a multiplicação no código.

O formato da resposta de `/rates` e de `/currencies` é lido de forma tolerante (`parseRates()` e `normalizeCurrencies()` em `api.js`). Se você quiser simplificar, confira o JSON real na aba **Network** do navegador.

## Conceitos praticados

- `fetch`, `async/await`, `try/catch/finally`
- Tratamento de erros HTTP e de rede
- Eventos de formulário: `input`, `change`, `submit`
- Debounce, cache em memória e `AbortController`
- Módulos ES (`import`/`export`)
- `localStorage` com tratamento de falhas
- `Intl.NumberFormat` e `Intl.DisplayNames`
- Manipulação do DOM sem `innerHTML` (com `createElement` e `textContent`)

## Ideias para evoluir

- Versão de **conversão de unidades** (km, milhas, °C, °F), sem `fetch`
- Gráfico dos últimos 30 dias usando o endpoint de série temporal
- Favoritar pares de moedas
- Aceitar valores como `1.000,50` no campo de valor
- Testes automatizados para `roundTo()`, `parseAmount()` e `parseRates()`

## Licença

Projeto de estudo, livre para usar e modificar.
