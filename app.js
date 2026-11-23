const { Client, Account, TablesDB, ID, Query, Permission, Role } = window.Appwrite;

const C = {
  endpoint: "https://nyc.cloud.appwrite.io/v1",
  projectId: "6b01e299000b19ac36ce",
  databaseId: "6b01e350001ca47807e5",
  tables: {
    profiles: "profiles",
    settings: "6b01e569002a228a1c5b",
    transactions: "6b01e6aa0036b4223488",
    goals: "6b01e8700035f839daea",
    accounts: "6b01fc9a00179915f55c",
    categories: "6b01fd500025ac427542",
    bills: "6b01fdb800341288b640",
    cards: "6b020079002ad9473ae5"
  }
};

const client = new Client().setEndpoint(C.endpoint).setProject(C.projectId);
const account = new Account(client);
const db = new TablesDB(client);

let user = null;
let state = {
  page: "home",
  transactions: [],
  goals: [],
  accounts: [],
  categories: [],
  bills: [],
  cards: [],
  settings: null
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const n = v => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  const num = Number(x);
  return Number.isFinite(num) ? num : 0;
};
const money = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n(v));
const dateBR = v => {
  if (!v) return "—";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
};
const today = () => new Date().toISOString().slice(0, 10);
const cap = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
const empty = msg => `<div class="empty"><strong>${esc(msg)}</strong><span>Quando houver dados, eles aparecerão aqui automaticamente.</span></div>`;
const toast = (msg, error = false) => {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.className = error ? "show error" : "show";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.className = "", 3200);
};
const metric = (title, value, note = "", icon = "") =>
  `<article class="metric"><div class="metric-top"><span>${esc(title)}</span><b>${esc(icon)}</b></div><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;

function rowPermissions() {
  return [
    Permission.read(Role.user(user.$id)),
    Permission.update(Role.user(user.$id)),
    Permission.delete(Role.user(user.$id))
  ];
}

function ownerQuery() {
  return Query.equal("user_id", user.$id);
}

async function listRows(table) {
  const res = await db.listRows({
    databaseId: C.databaseId,
    tableId: table,
    queries: [ownerQuery(), Query.limit(100)]
  });
  return res.rows || [];
}

async function createRow(table, data) {
  return db.createRow({
    databaseId: C.databaseId,
    tableId: table,
    rowId: ID.unique(),
    data: { ...data, user_id: user.$id },
    permissions: rowPermissions()
  });
}

async function updateRow(table, rowId, data) {
  return db.updateRow({
    databaseId: C.databaseId,
    tableId: table,
    rowId,
    data
  });
}

async function deleteRow(table, rowId) {
  return db.deleteRow({
    databaseId: C.databaseId,
    tableId: table,
    rowId
  });
}

async function ensureProfile() {
  try {
    return await db.getRow({
      databaseId: C.databaseId,
      tableId: C.tables.profiles,
      rowId: user.$id
    });
  } catch {
    return db.createRow({
      databaseId: C.databaseId,
      tableId: C.tables.profiles,
      rowId: user.$id,
      data: {
        full_name: user.name || "Usuário",
        email: user.email || "",
        avatar_url: ""
      },
      permissions: rowPermissions()
    });
  }
}

async function ensureSettings() {
  const rows = await listRows(C.tables.settings);
  if (rows[0]) return rows[0];
  return createRow(C.tables.settings, {
    gross_salary: 0,
    advance_pct: 0,
    inss_pct: 0,
    assist_pct: 0,
    life_insurance: 0,
    negocial: 0
  });
}

async function load() {
  if (!user?.$id) throw new Error("Sessão inválida.");
  const [transactions, goals, accounts, categories, bills, cards, settings] = await Promise.all([
    listRows(C.tables.transactions),
    listRows(C.tables.goals),
    listRows(C.tables.accounts),
    listRows(C.tables.categories),
    listRows(C.tables.bills),
    listRows(C.tables.cards),
    ensureSettings()
  ]);
  state.transactions = transactions;
  state.goals = goals;
  state.accounts = accounts;
  state.categories = categories;
  state.bills = bills;
  state.cards = cards;
  state.settings = settings;
}

function monthKey(date) {
  return String(date || "").slice(0, 7);
}
function currentMonth() {
  return today().slice(0, 7);
}
function txTypeLabel(type) {
  return ({ income:"Receita", expense:"Despesa", investment:"Investimento", transfer:"Transferência" }[type] || cap(type));
}
function categoryName(idOrName) {
  const hit = state.categories.find(c => c.$id === idOrName || c.name === idOrName);
  return hit?.name || idOrName || "Sem Categoria";
}
function txAmount(t) {
  return n(t.amount);
}
function totals() {
  const month = currentMonth();
  const tx = state.transactions.filter(t => monthKey(t.transaction_date) === month);
  const income = tx.filter(t => t.type === "income").reduce((a,t) => a + txAmount(t), 0);
  const expense = tx.filter(t => t.type === "expense").reduce((a,t) => a + txAmount(t), 0);
  const investment = tx.filter(t => t.type === "investment").reduce((a,t) => a + txAmount(t), 0);
  const transfer = tx.filter(t => t.type === "transfer").reduce((a,t) => a + txAmount(t), 0);
  const accountBalance = state.accounts.reduce((a,x) => a + n(x.balance), 0);
  return { month, tx, income, expense, investment, transfer, balance: accountBalance + income - expense - investment };
}

function shell(title, subtitle, body) {
  $("#main").innerHTML = `<div class="page"><div class="page-title"><div><span class="eyebrow">Makaria</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></div>${body}</div>`;
}

function pageHeader(title, subtitle, action = "") {
  return `<div class="card-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${action}</div>`;
}

function formOptions(items, valueKey = "$id", labelKey = "name", emptyLabel = "Selecione") {
  return `<option value="">${emptyLabel}</option>` + items.map(x => `<option value="${esc(x[valueKey])}">${esc(x[labelKey])}</option>`).join("");
}

function home() {
  const t = totals();
  const investments = state.transactions.filter(x => x.type === "investment").reduce((a,x) => a + n(x.amount), 0);
  const goalsSaved = state.goals.reduce((a,x) => a + n(x.saved_amount), 0);
  const goalsTarget = state.goals.reduce((a,x) => a + n(x.target_amount), 0);
  const categories = {};
  t.tx.filter(x => x.type === "expense").forEach(x => {
    const k = categoryName(x.category);
    categories[k] = (categories[k] || 0) + n(x.amount);
  });
  const top = Object.entries(categories).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const max = top[0]?.[1] || 1;
  const recent = [...state.transactions].sort((a,b) => String(b.transaction_date).localeCompare(String(a.transaction_date))).slice(0, 8);

  shell("Visão Geral", "Seu panorama financeiro em um só lugar.", `
    <div class="metrics">
      ${metric("Saldo Disponível", money(t.balance), "Contas + resultado do mês", "R$")}
      ${metric("Receitas", money(t.income), "Mês atual", "↗")}
      ${metric("Despesas", money(t.expense), "Mês atual", "↘")}
      ${metric("Investimentos", money(investments), "Acumulado em lançamentos", "◎")}
    </div>
    <div class="grid-2">
      <section class="card">${pageHeader("Fluxo do Mês", "Comparação entre entradas e saídas.", `<span class="status">${esc(t.month)}</span>`)}
        <div class="flow"><div><span>Receitas</span><strong>${money(t.income)}</strong></div><div><span>Despesas</span><strong>${money(t.expense)}</strong></div><div><span>Investimentos</span><strong>${money(t.investment)}</strong></div></div>
        <div class="progress"><span style="width:${t.income ? Math.min(100, t.expense/t.income*100) : 0}%"></span></div>
        <p class="muted">Comprometimento das receitas com despesas: <b>${t.income ? (t.expense/t.income*100).toFixed(1) : "0,0"}%</b>.</p>
      </section>
      <section class="card">${pageHeader("Metas", "Progresso geral dos seus objetivos.")}
        <div class="big-number">${money(goalsSaved)}</div><p class="muted">de ${money(goalsTarget)} acumulados nas metas cadastradas.</p>
        <div class="progress"><span style="width:${goalsTarget ? Math.min(100, goalsSaved/goalsTarget*100) : 0}%"></span></div>
        <p class="muted">${goalsTarget ? (goalsSaved/goalsTarget*100).toFixed(1) : "0,0"}% do objetivo total.</p>
      </section>
    </div>
    <div class="grid-2">
      <section class="card">${pageHeader("Despesas por Categoria", "Onde seu dinheiro está sendo utilizado.")}
        ${top.length ? top.map(([name,val]) => `<div class="bar-row"><div><span>${esc(name)}</span><b>${money(val)}</b></div><div class="bar"><span style="width:${Math.max(4,val/max*100)}%"></span></div></div>`).join("") : empty("Nenhuma despesa neste mês.")}
      </section>
      <section class="card">${pageHeader("Últimos Lançamentos", "Movimentações mais recentes.")}
        ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${recent.map(x => `<tr><td>${dateBR(x.transaction_date)}</td><td>${esc(x.description || txTypeLabel(x.type))}</td><td>${esc(categoryName(x.category))}</td><td class="${x.type === "income" ? "positive" : x.type === "expense" ? "negative" : ""}">${x.type === "income" ? "+" : x.type === "expense" ? "−" : ""}${money(x.amount)}</td></tr>`).join("")}</tbody></table></div>` : empty("Nenhum lançamento cadastrado.")}
      </section>
    </div>
  `);
}

function transactions() {
  const rows = [...state.transactions].sort((a,b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
  shell("Transações", "Registre todas as movimentações da sua vida financeira.", `
    <section class="card">${pageHeader("Novo Lançamento", "Receitas, despesas, investimentos e transferências.")}
      <form id="txForm" class="form-grid">
        <label>Tipo<select name="type" required><option value="expense">Despesa</option><option value="income">Receita</option><option value="investment">Investimento</option><option value="transfer">Transferência</option></select></label>
        <label>Valor<input name="amount" type="number" min="0" step="0.01" required></label>
        <label>Categoria<select name="category">${formOptions(state.categories)}</select></label>
        <label>Data<input name="transaction_date" type="date" value="${today()}" required></label>
        <label>Forma De Pagamento<select name="payment_method"><option>Pix</option><option>Cartão de Crédito</option><option>Cartão de Débito</option><option>Dinheiro</option><option>Boleto</option><option>Transferência</option><option>Outro</option></select></label>
        <label>Parcelas<input name="installments" type="number" min="1" value="1"></label>
        <label class="wide">Descrição<input name="description" maxlength="200" placeholder="Ex.: Supermercado, salário, aluguel..."></label>
        <div class="wide actions"><button class="primary">Adicionar Lançamento</button></div>
      </form>
    </section>
    <section class="card">${pageHeader("Histórico", `${rows.length} lançamento(s) registrado(s).`)}
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Pagamento</th><th>Valor</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td>${dateBR(x.transaction_date)}</td><td><span class="tag">${esc(txTypeLabel(x.type))}</span></td><td>${esc(x.description || "—")}</td><td>${esc(categoryName(x.category))}</td><td>${esc(x.payment_method || "—")}</td><td>${money(x.amount)}</td><td><button class="icon-delete" data-del-tx="${x.$id}" type="button">×</button></td></tr>`).join("")}</tbody></table></div>` : empty("Nenhuma transação cadastrada.")}
    </section>
  `);
}

function budget() {
  const t = totals();
  const spent = {};
  t.tx.filter(x => x.type === "expense").forEach(x => spent[x.category] = (spent[x.category] || 0) + n(x.amount));
  shell("Orçamento", "Acompanhe limites e consumo por categoria.", `
    <section class="card">${pageHeader("Resumo Mensal", "Os limites são definidos em Categorias.")}
      <div class="metrics compact">${metric("Despesas", money(t.expense), "Mês atual", "↘")}${metric("Categorias", state.categories.length, "Cadastradas", "◈")}</div>
    </section>
    <section class="card">${pageHeader("Acompanhamento por Categoria", "Quanto já foi utilizado em relação ao limite.")}
      ${state.categories.length ? state.categories.map(c => {
        const limit = n(c.monthly_limit), used = spent[c.$id] || spent[c.name] || 0, pct = limit ? Math.min(100, used/limit*100) : 0;
        return `<div class="budget-item"><div><span>${esc(c.icon || "◈")} ${esc(c.name)}</span><b>${money(used)} ${limit ? `/ ${money(limit)}` : ""}</b></div><div class="progress"><span style="width:${pct}%"></span></div><small>${limit ? `${pct.toFixed(1)}% utilizado` : "Sem limite definido"}</small></div>`;
      }).join("") : empty("Cadastre categorias para acompanhar seu orçamento.")}
    </section>
  `);
}

function goals() {
  shell("Metas", "Transforme planos em objetivos financeiros acompanháveis.", `
    <section class="card">${pageHeader("Nova Meta", "Defina objetivo, valor acumulado e prazo.")}
      <form id="goalForm" class="form-grid">
        <label>Nome Da Meta<input name="name" required placeholder="Ex.: Viagem, Reserva, Faculdade"></label>
        <label>Valor Objetivo<input name="target_amount" type="number" min="0" step="0.01" required></label>
        <label>Valor Já Guardado<input name="saved_amount" type="number" min="0" step="0.01" value="0"></label>
        <label>Data Alvo<input name="target_date" type="date"></label>
        <label class="wide">Descrição<input name="description" placeholder="Detalhes da meta"></label>
        <div class="wide actions"><button class="primary">Criar Meta</button></div>
      </form>
    </section>
    <section class="grid-2">${state.goals.length ? state.goals.map(g => {
      const pct = n(g.target_amount) ? Math.min(100, n(g.saved_amount)/n(g.target_amount)*100) : 0;
      return `<article class="card goal-card"><div class="card-head"><div><h2>${esc(g.name)}</h2><p>${esc(g.description || "Objetivo financeiro")}</p></div><span class="status">${pct.toFixed(0)}%</span></div><div class="big-number">${money(g.saved_amount)}</div><p class="muted">de ${money(g.target_amount)}</p><div class="progress"><span style="width:${pct}%"></span></div><small>${g.target_date ? `Prazo: ${dateBR(g.target_date)}` : "Sem prazo definido"}</small></article>`;
    }).join("") : `<div class="card">${empty("Nenhuma meta cadastrada.")}</div>`}</section>
  `);
}

function accounts() {
  shell("Contas", "Organize contas bancárias, carteiras e outras reservas.", `
    <section class="card">${pageHeader("Nova Conta", "Cadastre uma conta e acompanhe seu saldo.")}
      <form id="accountForm" class="form-grid">
        <label>Nome<input name="name" required placeholder="Ex.: Nubank, Santander, Carteira"></label>
        <label>Saldo Atual<input name="balance" type="number" step="0.01" value="0"></label>
        <label>Dia De Vencimento<input name="due_day" type="number" min="1" max="31" placeholder="Opcional"></label>
        <label>Recorrente<select name="recurring"><option value="false">Não</option><option value="true">Sim</option></select></label>
        <div class="wide actions"><button class="primary">Adicionar Conta</button></div>
      </form>
    </section>
    <section class="grid-3">${state.accounts.length ? state.accounts.map(a => `<article class="card"><span class="eyebrow">Conta</span><h2>${esc(a.name)}</h2><div class="big-number">${money(a.balance)}</div><p class="muted">${a.due_day ? `Vencimento dia ${a.due_day}` : "Sem vencimento definido"}</p></article>`).join("") : `<div class="card">${empty("Nenhuma conta cadastrada.")}</div>`}</section>
  `);
}

function cards() {
  shell("Cartões", "Controle limites, faturas, fechamento e vencimentos.", `
    <section class="card">${pageHeader("Novo Cartão", "Cadastre cartões de crédito para acompanhar suas obrigações.")}
      <form id="cardForm" class="form-grid">
        <label>Nome Do Cartão<input name="name" required placeholder="Ex.: Nubank Platinum"></label>
        <label>Limite<input name="credit_limit" type="number" min="0" step="0.01" value="0"></label>
        <label>Fatura Atual<input name="current_bill" type="number" min="0" step="0.01" value="0"></label>
        <label>Dia De Fechamento<input name="closing_day" type="number" min="1" max="31"></label>
        <label>Dia De Vencimento<input name="due_day" type="number" min="1" max="31"></label>
        <div class="wide actions"><button class="primary">Adicionar Cartão</button></div>
      </form>
    </section>
    <section class="grid-3">${state.cards.length ? state.cards.map(c => {
      const limit=n(c.credit_limit), bill=n(c.current_bill), available=Math.max(0,limit-bill);
      return `<article class="card"><span class="eyebrow">Cartão</span><h2>${esc(c.name)}</h2><div class="big-number">${money(bill)}</div><p class="muted">Fatura atual · Limite ${money(limit)}</p><div class="progress"><span style="width:${limit ? Math.min(100,bill/limit*100) : 0}%"></span></div><small>Disponível: ${money(available)} · Fecha dia ${c.closing_day || "—"} · Vence dia ${c.due_day || "—"}</small></article>`;
    }).join("") : `<div class="card">${empty("Nenhum cartão cadastrado.")}</div>`}</section>
  `);
}

function investments() {
  const inv = state.transactions.filter(x => x.type === "investment");
  const total = inv.reduce((a,x) => a+n(x.amount), 0);
  shell("Investimentos", "Visualize seus aportes registrados no Makaria.", `
    <section class="metrics">${metric("Total Investido", money(total), "Lançamentos de investimento", "◎")}${metric("Aportes", inv.length, "Quantidade registrada", "↗")}</section>
    <section class="card">${pageHeader("Aportes", "Investimentos são registrados pela área de Transações.")}
      ${inv.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${inv.sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date))).map(x=>`<tr><td>${dateBR(x.transaction_date)}</td><td>${esc(x.description||"Investimento")}</td><td>${esc(categoryName(x.category))}</td><td>${money(x.amount)}</td></tr>`).join("")}</tbody></table></div>` : empty("Nenhum investimento registrado.")}
    </section>
  `);
}

function bills() {
  const sorted=[...state.bills].sort((a,b)=>(Number(a.due_day)||99)-(Number(b.due_day)||99));
  shell("Contas a Pagar", "Centralize despesas recorrentes e vencimentos.", `
    <section class="card">${pageHeader("Nova Conta", "Cadastre uma obrigação e acompanhe seu status.")}
      <form id="billForm" class="form-grid">
        <label>Nome<input name="name" required placeholder="Ex.: Aluguel, Internet, Energia"></label>
        <label>Valor<input name="amount" type="number" min="0" step="0.01" required></label>
        <label>Dia De Vencimento<input name="due_day" type="number" min="1" max="31" required></label>
        <label>Categoria<select name="category">${formOptions(state.categories)}</select></label>
        <label>Status<select name="status"><option value="Pendente">Pendente</option><option value="Pago">Pago</option></select></label>
        <label>Recorrente<select name="recurring"><option value="true">Sim</option><option value="false">Não</option></select></label>
        <div class="wide actions"><button class="primary">Adicionar Conta</button></div>
      </form>
    </section>
    <section class="card">${pageHeader("Vencimentos", `${sorted.length} conta(s) cadastrada(s).`)}
      ${sorted.length ? `<div class="table-wrap"><table><thead><tr><th>Conta</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>${sorted.map(b=>`<tr><td>${esc(b.name)}</td><td>${esc(categoryName(b.category))}</td><td>Dia ${esc(b.due_day)}</td><td>${money(b.amount)}</td><td><span class="status">${esc(b.status||"Pendente")}</span></td></tr>`).join("")}</tbody></table></div>` : empty("Nenhuma conta cadastrada.")}
    </section>
  `);
}

function reports() {
  const byType={};
  state.transactions.forEach(x=>byType[x.type]=(byType[x.type]||0)+n(x.amount));
  const byCat={};
  state.transactions.filter(x=>x.type==="expense").forEach(x=>byCat[categoryName(x.category)]=(byCat[categoryName(x.category)]||0)+n(x.amount));
  const cat=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,10);
  shell("Relatórios", "Leituras consolidadas para apoiar suas decisões.", `
    <div class="metrics">
      ${metric("Receitas", money(byType.income||0), "Acumulado", "↗")}
      ${metric("Despesas", money(byType.expense||0), "Acumulado", "↘")}
      ${metric("Investimentos", money(byType.investment||0), "Acumulado", "◎")}
      ${metric("Transferências", money(byType.transfer||0), "Acumulado", "↕")}
    </div>
    <section class="card">${pageHeader("Despesas por Categoria", "Acumulado de todas as transações cadastradas.")}
      ${cat.length ? cat.map(([k,v])=>`<div class="bar-row"><div><span>${esc(k)}</span><b>${money(v)}</b></div><div class="bar"><span style="width:${Math.max(4,Math.min(100,v/(cat[0][1]||1)*100))}%"></span></div></div>`).join("") : empty("Ainda não há despesas suficientes para gerar o relatório.")}
    </section>
  `);
}

function calendar() {
  const items = [
    ...state.bills.map(b => ({ day:n(b.due_day), title:b.name, value:n(b.amount), kind:"Conta" })),
    ...state.transactions.map(t => ({ day:Number(String(t.transaction_date||"").slice(8,10)), title:t.description||txTypeLabel(t.type), value:n(t.amount), kind:txTypeLabel(t.type) }))
  ].filter(x=>x.day>0).sort((a,b)=>a.day-b.day);
  shell("Calendário", "Visualize vencimentos e movimentações por dia.", `
    <section class="card">${pageHeader("Agenda Financeira", "Visão simplificada do mês atual.")}
      ${items.length ? `<div class="calendar-list">${items.map(x=>`<div class="calendar-item"><span class="day">${String(x.day).padStart(2,"0")}</span><div><b>${esc(x.title)}</b><small>${esc(x.kind)}</small></div><strong>${money(x.value)}</strong></div>`).join("")}</div>` : empty("Nenhum evento financeiro cadastrado.")}
    </section>
  `);
}

function categories() {
  shell("Categorias", "Crie categorias que façam sentido para sua rotina.", `
    <section class="card">${pageHeader("Nova Categoria", "Defina nome, ícone e limite mensal.")}
      <form id="categoryForm" class="form-grid">
        <label>Nome<input name="name" required placeholder="Ex.: Alimentação"></label>
        <label>Ícone<input name="icon" maxlength="4" value="◈" placeholder="◈"></label>
        <label>Limite Mensal<input name="monthly_limit" type="number" min="0" step="0.01" value="0"></label>
        <div class="wide actions"><button class="primary">Criar Categoria</button></div>
      </form>
    </section>
    <section class="grid-3">${state.categories.length ? state.categories.map(c=>`<article class="card"><span class="eyebrow">${esc(c.icon||"◈")}</span><h2>${esc(c.name)}</h2><p class="muted">Limite mensal: ${n(c.monthly_limit) ? money(c.monthly_limit) : "Não definido"}</p></article>`).join("") : `<div class="card">${empty("Nenhuma categoria cadastrada.")}</div>`}</section>
  `);
}

function salaryItems() {
  const key = `makaria_salary_items_${user?.$id || "guest"}`;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{"income":[],"deduction":[]}');
    return { income:Array.isArray(parsed.income)?parsed.income:[], deduction:Array.isArray(parsed.deduction)?parsed.deduction:[] };
  } catch {
    return { income:[], deduction:[] };
  }
}
function saveSalaryItems(items) {
  localStorage.setItem(`makaria_salary_items_${user.$id}`, JSON.stringify(items));
}
function salaryValue(item, base) {
  return item.mode === "percent" ? base * n(item.value) / 100 : n(item.value);
}
function salary() {
  const base=n(state.settings?.gross_salary);
  const items=salaryItems();
  const extra=items.income.reduce((a,x)=>a+salaryValue(x,base),0);
  const ded=items.deduction.reduce((a,x)=>a+salaryValue(x,base),0);
  const total=base+extra, available=total-ded;
  const rows=(type,arr)=>arr.length?arr.map((x,i)=>`<div class="dynamic-row"><div><b>${esc(cap(x.name))}</b><small>${x.mode==="percent"?`${n(x.value).toFixed(2)}% da renda bruta`:"Valor fixo"}</small></div><strong>${money(salaryValue(x,base))}</strong><button class="icon-delete" type="button" data-salary-del="${type}" data-salary-index="${i}">×</button></div>`).join(""):empty(type==="income"?"Nenhuma renda extra cadastrada.":"Nenhum desconto cadastrado.");
  shell("Renda e Descontos","Personalize sua composição de renda sem assumir regras de uma empresa específica.",`
    <section class="card"><div class="card-head"><div><h2>Renda Bruta</h2><p>Este é o valor principal usado como base para cálculos percentuais.</p></div></div>
      <form id="salaryForm" class="form-grid"><label class="wide">Renda Bruta<input name="gross_salary" type="number" min="0" step="0.01" value="${base}" placeholder="0,00"></label><div class="wide actions"><button class="primary">Salvar Renda</button></div></form>
    </section>
    <div class="metrics">${metric("Renda Total",money(total),"Renda Bruta + Extras","↗")}${metric("Descontos",money(ded),"Itens personalizados","−")}${metric("Disponível Estimado",money(available),"Após descontos","✓")}${metric("Retenção",total?`${(ded/total*100).toFixed(2)}%`:"0,00%","Sobre a renda total","%")}</div>
    <div class="grid-2">
      <section class="card">${pageHeader("Rendas Extras","Cada item pode ser valor fixo ou percentual da renda bruta.",`<button class="secondary" id="addIncome" type="button">+ Adicionar Renda</button>`)}<div>${rows("income",items.income)}</div></section>
      <section class="card">${pageHeader("Descontos e Encargos","Cadastre somente o que se aplica à sua realidade.",`<button class="secondary" id="addDeduction" type="button">+ Adicionar Desconto</button>`)}<div>${rows("deduction",items.deduction)}</div></section>
    </div>
    <section class="card salary-note"><h2>Como Funciona</h2><p>Escolha <b>Valor Fixo</b> para informar diretamente em reais ou <b>Percentual Da Renda Bruta</b> para o Makaria calcular automaticamente o equivalente em reais.</p></section>
  `);
}
function openSalaryItemForm(type) {
  const title=type==="income"?"Adicionar Renda Extra":"Adicionar Desconto";
  const label=type==="income"?"Nome Da Renda":"Nome Do Desconto";
  const base=n(state.settings?.gross_salary);
  const box=document.createElement("div");
  box.className="modal-backdrop";
  box.innerHTML=`<div class="modal card"><div class="card-head"><div><h2>${title}</h2><p>Escolha como o valor deve ser calculado.</p></div><button class="icon-delete" id="closeSalaryModal" type="button">×</button></div>
  <form id="salaryItemForm" class="form-grid"><label class="wide">${label}<input name="name" required placeholder="${type==="income"?"Ex.: Comissão, Freelance, Aluguel":"Ex.: INSS, Plano De Saúde, Vale-Transporte"}"></label>
  <label>Forma De Cálculo<select name="mode" id="salaryMode"><option value="fixed">Valor Fixo (R$)</option><option value="percent">Percentual Da Renda Bruta (%)</option></select></label>
  <label>Valor<input name="value" id="salaryValueInput" type="number" min="0" step="0.01" required value="0"></label>
  <div class="wide salary-calc-preview" id="salaryCalcPreview"></div><div class="wide actions"><button type="button" class="secondary" id="cancelSalaryModal">Cancelar</button><button class="primary">Adicionar</button></div></form></div>`;
  document.body.appendChild(box);
  const mode=$("#salaryMode",box), value=$("#salaryValueInput",box), preview=$("#salaryCalcPreview",box);
  const refresh=()=>preview.innerHTML=mode.value==="percent"
    ? `<b>${n(value.value).toFixed(2)}%</b> da renda bruta de <b>${money(base)}</b> = <b>${money(base*n(value.value)/100)}</b>`
    : `Valor informado: <b>${money(value.value)}</b>`;
  mode.onchange=refresh; value.oninput=refresh; refresh();
  const close=()=>box.remove();
  $("#closeSalaryModal",box).onclick=close; $("#cancelSalaryModal",box).onclick=close;
  $("#salaryItemForm",box).onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));d.value=n(d.value);const items=salaryItems();items[type].push(d);saveSalaryItems(items);close();render();toast(type==="income"?"Renda Extra Adicionada.":"Desconto Adicionado.")};
}

function settings() {
  shell("Configurações","Gerencie sua conta e preferências do aplicativo.",`
    <section class="card"><h2>Perfil</h2><p>Nome: <b>${esc(user?.name||"Usuário")}</b></p><p>E-mail: <b>${esc(user?.email||"")}</b></p></section>
    <section class="card"><h2>Privacidade</h2><p>Os registros financeiros são associados ao usuário autenticado e consultados usando seu identificador. O controle final de acesso é aplicado pelo Appwrite.</p></section>
    <section class="card"><h2>Preferências</h2><p>Use o botão de tema no topo para alternar entre modo claro e escuro.</p></section>
  `);
}

const pages={home,transactions,budget,goals,accounts,cards,investments,bills,reports,calendar,categories,salary,settings};

async function bindForms() {
  const tx=$("#txForm");
  if(tx) tx.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(tx));d.amount=n(d.amount);d.installments=Math.max(1,Number(d.installments)||1);d.installment_number=1;try{await createRow(C.tables.transactions,d);toast("Lançamento Adicionado.");await load();render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const g=$("#goalForm");
  if(g) g.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(g));d.name=cap(d.name);d.target_amount=n(d.target_amount);d.saved_amount=n(d.saved_amount);try{await createRow(C.tables.goals,d);toast("Meta Criada.");await load();render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const a=$("#accountForm");
  if(a) a.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(a));d.balance=n(d.balance);d.due_day=Number(d.due_day)||0;d.recurring=d.recurring==="true";try{await createRow(C.tables.accounts,d);toast("Conta Adicionada.");await load();render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const c=$("#categoryForm");
  if(c) c.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(c));d.name=cap(d.name);d.monthly_limit=n(d.monthly_limit);try{await createRow(C.tables.categories,d);toast("Categoria Criada.");await load();render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const b=$("#billForm");
  if(b) b.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(b));d.amount=n(d.amount);d.due_day=Number(d.due_day);d.recurring=d.recurring==="true";try{await createRow(C.tables.bills,d);toast("Conta Cadastrada.");await load();render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const ca=$("#cardForm");
  if(ca) ca.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(ca));d.name=cap(d.name);d.credit_limit=n(d.credit_limit);d.current_bill=n(d.current_bill);d.closing_day=Number(d.closing_day)||0;d.due_day=Number(d.due_day)||0;try{await createRow(C.tables.cards,d);toast("Cartão Adicionado.");await load();render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const sf=$("#salaryForm");
  if(sf) sf.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(sf));d.gross_salary=n(d.gross_salary);try{await updateRow(C.tables.settings,state.settings.$id,d);state.settings={...state.settings,...d};toast("Renda Bruta Salva.");render()}catch(err){toast(err.message||"Não foi possível salvar.",true)}};

  const addIncome=$("#addIncome"); if(addIncome) addIncome.onclick=()=>openSalaryItemForm("income");
  const addDeduction=$("#addDeduction"); if(addDeduction) addDeduction.onclick=()=>openSalaryItemForm("deduction");

  $$(".icon-delete[data-salary-del]").forEach(btn=>btn.onclick=()=>{const items=salaryItems(),type=btn.dataset.salaryDel,i=Number(btn.dataset.salaryIndex);items[type].splice(i,1);saveSalaryItems(items);render();toast(type==="income"?"Renda Extra Removida.":"Desconto Removido.")});
  $$("[data-del-tx]").forEach(btn=>btn.onclick=async()=>{if(!confirm("Excluir este lançamento?"))return;try{await deleteRow(C.tables.transactions,btn.dataset.delTx);toast("Lançamento Excluído.");await load();render()}catch(err){toast(err.message||"Não foi possível excluir.",true)}});
}

function bindNav() {
  $$("[data-page]").forEach(btn=>btn.onclick=()=>{state.page=btn.dataset.page;$$("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===state.page));render()});
  $("#theme").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("makaria_theme",document.body.classList.contains("dark")?"dark":"light")};
  $("#logout").onclick=async()=>{try{await account.deleteSession("current")}catch{}location.reload()};
}
function render(){(pages[state.page]||home)();bindForms()}
function auth(){
  $$(".tabs button").forEach(btn=>btn.onclick=()=>{$$(".tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const sign=btn.dataset.mode==="signup";$("#nameBox").classList.toggle("hide",!sign);$("#authBtn").textContent=sign?"Criar Conta":"Entrar";$("#authForm").dataset.mode=btn.dataset.mode});
  $("#authForm").dataset.mode="login";
  $("#authForm").onsubmit=async e=>{
    e.preventDefault();
    const sign=e.currentTarget.dataset.mode==="signup",email=$("#email").value.trim(),pass=$("#pass").value,name=$("#name").value.trim();
    $("#authBtn").disabled=true;$("#authMsg").textContent="";
    try{
      if(sign){if(!name)throw new Error("Informe seu nome.");await account.create(ID.unique(),email,pass,name);await account.createEmailPasswordSession(email,pass)}
      else await account.createEmailPasswordSession(email,pass);
      location.reload();
    }catch(err){$("#authMsg").textContent=err.message||"Não foi possível concluir a operação."}
    finally{$("#authBtn").disabled=false}
  };
}
async function start(){
  auth();
  try{
    user=await account.get();
    $("#auth").classList.add("hide");$("#app").classList.remove("hide");
    $("#hello").textContent=`Olá, ${user.name||"Usuário"}`;
    bindNav();
    if(localStorage.getItem("makaria_theme")==="dark")document.body.classList.add("dark");
    await ensureProfile();
    await load();
    render();
  }catch(err){
    if(err?.code && err.code!==401) console.error(err);
  }
}
start();
