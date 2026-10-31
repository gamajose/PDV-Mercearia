// =====================================================================
// PDV GAMA & GDM RETAIL ERP - PLATAFORMA INTEGRADA DE SUPERMERCADOS E VAREJO
// Arquitetura Industrial: Retaguarda Completa + Frente de Caixa PDV Ágil + Terminal de Etiquetas
// =====================================================================

const API = {
  get: async (url) => (await fetch(url)).json(),
  post: async (url, data) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json(),
  put: async (url, data) => (await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json(),
  del: async (url) => (await fetch(url, { method: "DELETE" })).json(),
};

// Formatação Monetária e Numérica
const fmtMoeda = (val) => Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (val, dec = 2) => Number(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";
const fmtDataHora = (iso) => iso ? new Date(iso).toLocaleString("pt-BR") : "-";

// Síntese de Áudio para Bip de Leitor de Código de Barras (Web Audio API)
let audioCtx = null;
function playScannerBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    console.debug("Audio not allowed yet:", e);
  }
}

// Estado Global da Aplicação (Arquitetura Inspirada no Odoo ERP & Point of Sale)
const state = {
  currentRoute: "/admin",
  user: { name: "Administrador Master", login: "admin", role: "Administrador" },
  company: { name: "Supermercado & Magazine Modelo Ltda", tradeName: "Supermercado Modelo", segment: "Supermercado e Varejo Geral" },
  products: [],
  customers: [],
  suppliers: [],
  collaborators: [],
  cashSession: null,
  // Arquitetura Multi-Pedidos / Comandas em Aberto (Odoo POS Multi-Orders)
  orders: [
    { id: 1, name: "Venda 1", cart: [], customer: null, selectedItemIdx: 0, discountGlobalPct: 0 }
  ],
  activeOrderId: 1,
  activeCategory: "Todos",
  posSearchQuery: "",
  numpadMode: "qty", // 'qty' | 'disc' | 'price'
  activeScaleWeight: 0.0,
  lastScannedItem: null,
  // Estado transitório da tela de pagamentos múltiplos / fracionados (Odoo Split Payments)
  paymentLines: [],
};

// Helper: Retorna o pedido ativo atual (Odoo Order)
function getActiveOrder() {
  let ord = state.orders.find(o => o.id === state.activeOrderId);
  if (!ord) {
    if (state.orders.length === 0) {
      ord = { id: 1, name: "Venda 1", cart: [], customer: null, selectedItemIdx: 0, discountGlobalPct: 0 };
      state.orders.push(ord);
    } else {
      ord = state.orders[0];
    }
    state.activeOrderId = ord.id;
  }
  return ord;
}

// =====================================================================
// ROTEADOR E NAVEGAÇÃO
// =====================================================================
function navigate(route) {
  state.currentRoute = route;
  window.history.pushState({}, "", route);
  renderApp();
}

window.addEventListener("popstate", () => {
  state.currentRoute = window.location.pathname || "/admin";
  renderApp();
});

// Inicialização Principal
async function init() {
  try {
    const s = await API.get("/api/state");
    if (s.user) state.user = s.user;
    const comp = await API.get("/api/company");
    if (comp) state.company = comp;
  } catch (e) {
    console.warn("Estado inicial:", e);
  }

  // Inicializa relógio da barra de status
  setInterval(() => {
    const el = document.getElementById("clock-display");
    if (el) el.innerText = new Date().toLocaleString("pt-BR");
  }, 1000);

  // Rota inicial pela URL
  const path = window.location.pathname;
  if (path && path !== "/") {
    state.currentRoute = path;
  } else {
    state.currentRoute = "/admin";
  }

  renderApp();
}

// =====================================================================
// RENDERIZADOR MASTER DO LAYOUT (FlatLaf / Enterprise Style Sem Emojis)
// =====================================================================
function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = `
    <!-- 1. Barra de Menus Superior (Rigidamente alinhada com o conteúdo, sem emojis) -->
    <header class="menubar">
      <div class="menubar-inner">
        <div class="menu-item">
          <span>Arquivos</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/produtos')">Cadastro de Produtos <small>Ctrl+P</small></div>
            <div class="dropdown-link" onclick="navigate('/clientes')">Cadastro de Clientes <small>Ctrl+C</small></div>
            <div class="dropdown-link" onclick="navigate('/colaboradores')">Cadastro de Colaboradores</div>
            <div class="dropdown-link" onclick="navigate('/fornecedores')">Cadastro de Fornecedores</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="navigate('/pdv')">Frente de Caixa (PDV) <small>F2</small></div>
            <div class="dropdown-link" onclick="navigate('/vendas')">Gerenciador de Vendas & Cupons</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="navigate('/compras-nfe')">Importar XML NF-e Compras</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Configurações</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/configuracoes')">Dados da Empresa Matriz</div>
            <div class="dropdown-link" onclick="navigate('/config-hardware')">Balanças & Impressoras Térmicas</div>
            <div class="dropdown-link" onclick="navigate('/config-segmento')">Configurar Segmento da Loja</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="navigate('/colaboradores')">Gestão de Colaboradores e Senhas</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Financeiro</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/caixa')">Abertura / Fechamento de Caixa</div>
            <div class="dropdown-link" onclick="navigate('/movimentacoes-caixa')">Movimentações Diárias de Caixa</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="openSangriaModal()">Sangria de Caixa (Retirada)</div>
            <div class="dropdown-link" onclick="openSuprimentoModal()">Suprimento de Caixa (Troco)</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="navigate('/financeiro')">Contas a Pagar e Receber</div>
            <div class="dropdown-link" onclick="navigate('/crediario')">Extrato de Crediário & Carnês</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Estoque</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/compras-nfe')">Entrada de Mercadorias (XML NF-e)</div>
            <div class="dropdown-link" onclick="navigate('/produtos')">Consulta & Posição de Estoque</div>
            <div class="dropdown-link" onclick="navigate('/rel-estoque-baixo')">Alertas de Reposição Mínima</div>
            <div class="dropdown-link" onclick="navigate('/etiquetas')">Terminal de Etiquetas de Gôndola</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Etiquetas e Balança</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/etiquetas')">Impressão de Etiquetas (Gôndola / Balança)</div>
            <div class="dropdown-link" onclick="downloadToledoCarga()">Carga para Balança Toledo (MGV5/MGV6)</div>
            <div class="dropdown-link" onclick="downloadFilizolaCarga()">Carga para Balança Filizola Smart</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Relatórios</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/relatorios-abc')">Curva ABC de Produtos (Faturamento)</div>
            <div class="dropdown-link" onclick="navigate('/relatorios-caixa')">Resumo de Fechamento de Caixa</div>
            <div class="dropdown-link" onclick="navigate('/rel-inadimplencia')">Relatório de Inadimplência Crediário</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Ajuda</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="openAboutModal()">Sobre o Sistema PDV Gama</div>
            <div class="dropdown-link" onclick="openShortcutsModal()">Guia de Teclas de Atalho</div>
          </div>
        </div>
      </div>
    </header>

    <!-- 2. Barra de Ferramentas Enterprise (Sóbria, Sem Emojis, Alinhada com Conteúdo) -->
    <nav class="app-toolbar">
      <div class="toolbar-inner">
        <button class="tool-btn highlight ${state.currentRoute === '/pdv' ? 'active' : ''}" onclick="navigate('/pdv')">
          <span class="tool-label">PDV VENDAS</span>
          <span class="tool-sub">F2</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/produtos' ? 'active' : ''}" onclick="navigate('/produtos')">
          <span class="tool-label">PRODUTOS</span>
          <span class="tool-sub">F3</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/clientes' ? 'active' : ''}" onclick="navigate('/clientes')">
          <span class="tool-label">CLIENTES</span>
          <span class="tool-sub">F4</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/colaboradores' || state.currentRoute === '/usuarios' ? 'active' : ''}" onclick="navigate('/colaboradores')">
          <span class="tool-label">COLABORADORES</span>
          <span class="tool-sub">EQUIPE</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/fornecedores' ? 'active' : ''}" onclick="navigate('/fornecedores')">
          <span class="tool-label">FORNECEDORES</span>
          <span class="tool-sub">COMPRAS</span>
        </button>

        <div class="tool-divider"></div>

        <button class="tool-btn ${state.currentRoute === '/caixa' ? 'active' : ''}" onclick="navigate('/caixa')">
          <span class="tool-label">ABRIR / FECHAR CAIXA</span>
          <span class="tool-sub">STATUS</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/movimentacoes-caixa' ? 'active' : ''}" onclick="navigate('/movimentacoes-caixa')">
          <span class="tool-label">MOVIMENTAÇÕES</span>
          <span class="tool-sub">EXTRATO</span>
        </button>

        <button class="tool-btn" onclick="openSangriaModal()">
          <span class="tool-label">SANGRIA</span>
          <span class="tool-sub">RETIRADA</span>
        </button>

        <button class="tool-btn" onclick="openSuprimentoModal()">
          <span class="tool-label">SUPRIMENTO</span>
          <span class="tool-sub">TROCO</span>
        </button>

        <div class="tool-divider"></div>

        <button class="tool-btn ${state.currentRoute === '/etiquetas' ? 'active' : ''}" onclick="navigate('/etiquetas')">
          <span class="tool-label">ETIQUETAS</span>
          <span class="tool-sub">GÔNDOLA</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/compras-nfe' ? 'active' : ''}" onclick="navigate('/compras-nfe')">
          <span class="tool-label">ENTRADA XML</span>
          <span class="tool-sub">NF-E</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/financeiro' ? 'active' : ''}" onclick="navigate('/financeiro')">
          <span class="tool-label">FINANCEIRO</span>
          <span class="tool-sub">CONTAS P/R</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/crediario' ? 'active' : ''}" onclick="navigate('/crediario')">
          <span class="tool-label">CREDIÁRIO</span>
          <span class="tool-sub">CONVÊNIO</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/admin' ? 'active' : ''}" onclick="navigate('/admin')">
          <span class="tool-label">RETAGUARDA</span>
          <span class="tool-sub">PAINEL</span>
        </button>

        <div class="tool-divider"></div>

        <button class="tool-btn danger-action" style="margin-left:auto;" onclick="openLogoutModal()">
          <span class="tool-label">ENCERRAR</span>
          <span class="tool-sub">LOGOUT</span>
        </button>
      </div>
    </nav>

    <!-- 3. Área Central Dinâmica (Alinhada Rigorosamente) -->
    <main class="app-workspace" id="workspace">
      ${renderCurrentModule()}
    </main>

    <!-- 4. Barra de Status Inferior (Sem Badges/Pills, Somente Versão no Lado Direito) -->
    <footer class="statusbar">
      <div class="statusbar-inner">
        <div class="status-left">
          <span id="clock-display">${new Date().toLocaleString("pt-BR")}</span>
          <span>|</span>
          <span>Operador: <strong>${state.user.name}</strong> (${state.user.role})</span>
          <span>|</span>
          <span>Loja: <strong>${state.company.tradeName || state.company.name}</strong></span>
        </div>

        <div class="status-right">
          <span>Versão 2.0.0 Enterprise</span>
        </div>
      </div>
    </footer>

    <!-- Container Global para Modais -->
    <div id="modal-container"></div>
  `;

  // Se estiver na tela de PDV, vincula os atalhos de teclado e foca no leitor
  if (state.currentRoute === "/pdv") {
    setupPdvShortcuts();
  }
}

// =====================================================================
// SELETOR DE MÓDULOS / TELAS
// =====================================================================
function renderCurrentModule() {
  switch (state.currentRoute) {
    case "/pdv":
      return renderPdvModule();
    case "/vendas":
      return renderSalesManagerModule();
    case "/produtos":
      return renderProductsModule();
    case "/clientes":
      return renderCustomersModule();
    case "/colaboradores":
    case "/usuarios":
      return renderCollaboratorsModule();
    case "/caixa":
      return renderCashModule();
    case "/movimentacoes-caixa":
      return renderCashMovementsModule();
    case "/financeiro":
      return renderFinancialModule();
    case "/crediario":
      return renderCrediarioModule();
    case "/compras-nfe":
      return renderNfeImportModule();
    case "/etiquetas":
      return renderLabelsModule();
    case "/relatorios-abc":
      return renderAbcReportModule();
    case "/relatorios-caixa":
      return renderCashMovementsModule();
    case "/configuracoes":
    case "/config-hardware":
    case "/config-segmento":
      return renderSettingsModule();
    case "/fornecedores":
      return renderSuppliersModule();
    case "/admin":
    default:
      return renderDashboardModule();
  }
}

// =====================================================================
// MÓDULO 1: CADASTRO DE COLABORADORES & FUNCIONÁRIOS (UNIFICADO COM CLIENTE)
// =====================================================================
function renderCollaboratorsModule() {
  setTimeout(() => loadCollaboratorsList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Cadastro de Colaboradores & Funcionários</h2>
          <small style="color:var(--text-muted);">Quadro de funcionários, controle de acesso, permissões de sistema e opção unificada como cliente (crediário / convênio)</small>
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" id="collab-search" class="form-control" style="width:260px;" placeholder="Buscar colaborador por nome, CPF ou cargo..." onkeyup="filterCollaboratorsList(this.value)" />
          <button class="btn btn-success" onclick="openCollaboratorModal(null)">+ Novo Colaborador</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome Completo</th>
              <th>CPF</th>
              <th>Cargo / Função</th>
              <th>Admissão</th>
              <th class="text-right">Salário Base</th>
              <th class="text-center">Comissão %</th>
              <th class="text-center">Também é Cliente?</th>
              <th class="text-center">Acesso Sistema</th>
              <th class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody id="collaborators-tbody">
            <tr><td colspan="9" class="text-center" style="padding:24px; color:#94a3b8;">Carregando colaboradores...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadCollaboratorsList() {
  try {
    const list = await API.get("/api/collaborators");
    state.collaborators = list || [];
    renderCollaboratorsTable(state.collaborators);
  } catch (e) {
    console.error("Erro ao carregar colaboradores:", e);
  }
}

function filterCollaboratorsList(term) {
  const t = (term || "").toLowerCase().trim();
  if (!t) {
    renderCollaboratorsTable(state.collaborators);
    return;
  }
  const filtered = state.collaborators.filter(c =>
    (c.name && c.name.toLowerCase().includes(t)) ||
    (c.cpf && c.cpf.includes(t)) ||
    (c.role && c.role.toLowerCase().includes(t))
  );
  renderCollaboratorsTable(filtered);
}

function renderCollaboratorsTable(list) {
  const tbody = document.getElementById("collaborators-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:30px; color:#94a3b8;">Nenhum colaborador cadastrado. Clique no botão acima para adicionar.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.cpf || "-"}</td>
      <td><span class="badge badge-blue">${c.role || "Operador"}</span></td>
      <td>${fmtData(c.admissionDate)}</td>
      <td class="text-right">${fmtMoeda(c.salary)}</td>
      <td class="text-center">${fmtNum(c.commissionPct, 1)}%</td>
      <td class="text-center">
        ${c.isCustomer
          ? `<span class="badge badge-green" title="Limite: ${fmtMoeda(c.creditLimit)} | Saldo: ${fmtMoeda(c.currentDebt)}">Sim (Limite: ${fmtMoeda(c.creditLimit)})</span>`
          : `<span class="badge badge-gray">Não</span>`}
      </td>
      <td class="text-center">
        ${c.canLogin
          ? `<span class="badge badge-green">Ativo (${c.login || "login"})</span>`
          : `<span class="badge badge-gray">Sem Login</span>`}
      </td>
      <td class="text-center">
        <button class="btn btn-outline btn-sm" onclick="openCollaboratorModal('${c.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteCollaborator('${c.id}', '${c.name}')">Excluir</button>
      </td>
    </tr>
  `).join("");
}

function openCollaboratorModal(id) {
  const c = id ? state.collaborators.find(x => String(x.id) === String(id)) : {
    name: "",
    cpf: "",
    rg: "",
    phone: "",
    email: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "São Paulo",
    state: "SP",
    zipCode: "",
    role: "Operador de Caixa",
    admissionDate: new Date().toISOString().split("T")[0],
    salary: 2150.00,
    commissionPct: 1.5,
    isCustomer: true,
    creditLimit: 800.00,
    currentDebt: 0.00,
    canLogin: true,
    login: "",
    password: ""
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? "Editar Cadastro de Colaborador" : "Novo Cadastro de Colaborador"}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form id="collab-form" onsubmit="saveCollaboratorForm(event, '${id || ""}')">
          <div class="modal-body">
            <!-- Seção 1: Dados Pessoais & Contato -->
            <div class="form-section-title">1. Dados Pessoais & Contato</div>
            <div class="form-grid">
              <div class="form-group" style="grid-column: span 2;">
                <label>Nome Completo: *</label>
                <input type="text" id="collab-name" class="form-control" value="${c.name || ""}" required />
              </div>
              <div class="form-group">
                <label>CPF: *</label>
                <input type="text" id="collab-cpf" class="form-control" value="${c.cpf || ""}" placeholder="000.000.000-00" required />
              </div>
              <div class="form-group">
                <label>RG / Órgão:</label>
                <input type="text" id="collab-rg" class="form-control" value="${c.rg || ""}" />
              </div>
              <div class="form-group">
                <label>Telefone / WhatsApp:</label>
                <input type="text" id="collab-phone" class="form-control" value="${c.phone || ""}" placeholder="(00) 00000-0000" />
              </div>
              <div class="form-group" style="grid-column: span 2;">
                <label>E-mail:</label>
                <input type="email" id="collab-email" class="form-control" value="${c.email || ""}" />
              </div>
            </div>

            <!-- Seção 2: Endereço -->
            <div class="form-section-title">2. Endereço Residencial</div>
            <div class="form-grid">
              <div class="form-group" style="grid-column: span 2;">
                <label>Logradouro / Rua:</label>
                <input type="text" id="collab-street" class="form-control" value="${c.street || ""}" />
              </div>
              <div class="form-group">
                <label>Número:</label>
                <input type="text" id="collab-number" class="form-control" value="${c.number || ""}" />
              </div>
              <div class="form-group">
                <label>Bairro:</label>
                <input type="text" id="collab-neighborhood" class="form-control" value="${c.neighborhood || ""}" />
              </div>
              <div class="form-group">
                <label>Cidade:</label>
                <input type="text" id="collab-city" class="form-control" value="${c.city || ""}" />
              </div>
              <div class="form-group">
                <label>UF:</label>
                <input type="text" id="collab-state" class="form-control" value="${c.state || "SP"}" maxlength="2" />
              </div>
              <div class="form-group">
                <label>CEP:</label>
                <input type="text" id="collab-zip" class="form-control" value="${c.zipCode || ""}" />
              </div>
            </div>

            <!-- Seção 3: Cargo & Remuneração -->
            <div class="form-section-title">3. Cargo & Remuneração</div>
            <div class="form-grid">
              <div class="form-group">
                <label>Cargo / Função: *</label>
                <select id="collab-role" class="form-control">
                  <option value="Operador de Caixa" ${c.role === 'Operador de Caixa' ? 'selected' : ''}>Operador de Caixa</option>
                  <option value="Gerente Geral" ${c.role === 'Gerente Geral' ? 'selected' : ''}>Gerente Geral</option>
                  <option value="Supervisor de Loja" ${c.role === 'Supervisor de Loja' ? 'selected' : ''}>Supervisor de Loja</option>
                  <option value="Vendedor / Atendente" ${c.role === 'Vendedor / Atendente' ? 'selected' : ''}>Vendedor / Atendente</option>
                  <option value="Repositor de Mercadorias" ${c.role === 'Repositor de Mercadorias' ? 'selected' : ''}>Repositor de Mercadorias</option>
                  <option value="Açougueiro" ${c.role === 'Açougueiro' ? 'selected' : ''}>Açougueiro</option>
                  <option value="Estoquista" ${c.role === 'Estoquista' ? 'selected' : ''}>Estoquista</option>
                  <option value="Conferente" ${c.role === 'Conferente' ? 'selected' : ''}>Conferente</option>
                </select>
              </div>
              <div class="form-group">
                <label>Data de Admissão:</label>
                <input type="date" id="collab-adm-date" class="form-control" value="${c.admissionDate ? c.admissionDate.split("T")[0] : ""}" />
              </div>
              <div class="form-group">
                <label>Salário Base (R$):</label>
                <input type="number" step="0.01" id="collab-salary" class="form-control" value="${c.salary || 0}" />
              </div>
              <div class="form-group">
                <label>Comissão sobre Vendas (%):</label>
                <input type="number" step="0.1" id="collab-commission" class="form-control" value="${c.commissionPct || 0}" />
              </div>
            </div>

            <!-- Seção 4: Opção Unificada de Cliente da Loja -->
            <div class="form-section-title">4. Vínculo de Cliente da Loja (Compras a Prazo / Desconto em Folha)</div>
            <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:14px; margin-bottom:14px;">
              <label class="custom-checkbox">
                <input type="checkbox" id="collab-is-customer" ${c.isCustomer ? "checked" : ""} onchange="toggleCollabCustomerFields(this.checked)" />
                <strong>Este colaborador também é cliente da loja (Permitir compras a prazo, crediário e convênio interno com desconto em folha)</strong>
              </label>

              <div id="collab-customer-details" style="display:${c.isCustomer ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap:14px; margin-top:12px; padding-top:10px; border-top:1px dashed #1e293b;">
                <div class="form-group">
                  <label>Limite de Crédito Aprovado (R$):</label>
                  <input type="number" step="0.01" id="collab-credit-limit" class="form-control" value="${c.creditLimit || 500}" />
                </div>
                <div class="form-group">
                  <label>Saldo Devedor Atual (R$):</label>
                  <input type="number" step="0.01" id="collab-current-debt" class="form-control" value="${c.currentDebt || 0}" readonly />
                  <small style="color:#94a3b8;">Atualizado automaticamente conforme compras no crediário.</small>
                </div>
              </div>
            </div>

            <!-- Seção 5: Acesso ao Sistema & Credenciais -->
            <div class="form-section-title">5. Acesso ao Sistema & Credenciais de Login</div>
            <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:14px;">
              <label class="custom-checkbox">
                <input type="checkbox" id="collab-can-login" ${c.canLogin ? "checked" : ""} onchange="toggleCollabLoginFields(this.checked)" />
                <strong>Permitir acesso / login no PDV Frente de Caixa e Retaguarda</strong>
              </label>

              <div id="collab-login-details" style="display:${c.canLogin ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap:14px; margin-top:12px; padding-top:10px; border-top:1px dashed #1e293b;">
                <div class="form-group">
                  <label>Usuário / Login:</label>
                  <input type="text" id="collab-login" class="form-control" value="${c.login || ""}" placeholder="Ex: maria.caixa" />
                </div>
                <div class="form-group">
                  <label>Senha de Acesso: ${id ? "(Deixe em branco para manter a atual)" : "*"}</label>
                  <input type="password" id="collab-password" class="form-control" placeholder="Senha do operador" />
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Salvar Cadastro de Colaborador</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

function toggleCollabCustomerFields(checked) {
  const div = document.getElementById("collab-customer-details");
  if (div) div.style.display = checked ? "grid" : "none";
}

function toggleCollabLoginFields(checked) {
  const div = document.getElementById("collab-login-details");
  if (div) div.style.display = checked ? "grid" : "none";
}

async function saveCollaboratorForm(event, id) {
  event.preventDefault();

  const payload = {
    id: id || null,
    name: document.getElementById("collab-name").value.trim(),
    cpf: document.getElementById("collab-cpf").value.trim(),
    rg: document.getElementById("collab-rg").value.trim(),
    phone: document.getElementById("collab-phone").value.trim(),
    email: document.getElementById("collab-email").value.trim(),
    street: document.getElementById("collab-street").value.trim(),
    number: document.getElementById("collab-number").value.trim(),
    neighborhood: document.getElementById("collab-neighborhood").value.trim(),
    city: document.getElementById("collab-city").value.trim(),
    state: document.getElementById("collab-state").value.trim().toUpperCase(),
    zipCode: document.getElementById("collab-zip").value.trim(),
    role: document.getElementById("collab-role").value,
    admissionDate: document.getElementById("collab-adm-date").value,
    salary: parseFloat(document.getElementById("collab-salary").value) || 0,
    commissionPct: parseFloat(document.getElementById("collab-commission").value) || 0,
    isCustomer: document.getElementById("collab-is-customer").checked,
    creditLimit: parseFloat(document.getElementById("collab-credit-limit").value) || 0,
    currentDebt: parseFloat(document.getElementById("collab-current-debt").value) || 0,
    canLogin: document.getElementById("collab-can-login").checked,
    login: document.getElementById("collab-login").value.trim(),
    password: document.getElementById("collab-password").value
  };

  try {
    if (id) {
      await API.put(`/api/collaborators/${id}`, payload);
    } else {
      await API.post("/api/collaborators", payload);
    }
    closeModal();
    await loadCollaboratorsList();
    alert("Colaborador salvo com sucesso!");
  } catch (e) {
    alert("Erro ao salvar colaborador: " + e.message);
  }
}

async function deleteCollaborator(id, name) {
  if (!confirm(`Confirma a exclusão do colaborador "${name}"?`)) return;
  try {
    await API.del(`/api/collaborators/${id}`);
    await loadCollaboratorsList();
  } catch (e) {
    alert("Erro ao excluir colaborador: " + e.message);
  }
}

// =====================================================================
// MÓDULO 2: CADASTRO DE PRODUTOS COMPLETO (ENGENHARIA REVERSA LINEAR SISTEMAS)
// =====================================================================
function renderProductsModule() {
  setTimeout(() => loadProductsList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Catálogo & Cadastro de Produtos</h2>
          <small style="color:var(--text-muted);">Padrão Linear Sistemas Supermercados: Multi-EAN, Mercadológico 4 Níveis, Balança/PLU, SEFAZ e Formação de Preço</small>
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" id="prod-search" class="form-control" style="width:280px;" placeholder="Buscar por Descrição, SKU, EAN ou PLU..." onkeyup="filterProductsList(this.value)" />
          <button class="btn btn-success" onclick="openProductEditModal(null)">+ Novo Produto</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Código de Barras (EAN)</th>
              <th>Descrição do Produto</th>
              <th>Departamento / Seção</th>
              <th class="text-center">Pesável / PLU</th>
              <th class="text-right">Custo Líquido</th>
              <th class="text-right">Preço Venda</th>
              <th class="text-right">Estoque</th>
              <th class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody id="products-tbody">
            <tr><td colspan="9" class="text-center" style="padding:24px; color:#94a3b8;">Carregando produtos do banco...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadProductsList() {
  try {
    const list = await API.get("/api/products");
    state.products = list || [];
    renderProductsTable(state.products);
  } catch (e) {
    console.error("Erro ao carregar produtos:", e);
  }
}

function filterProductsList(term) {
  const t = (term || "").toLowerCase().trim();
  if (!t) {
    renderProductsTable(state.products);
    return;
  }
  const filtered = state.products.filter(p =>
    (p.name && p.name.toLowerCase().includes(t)) ||
    (p.sku && p.sku.toLowerCase().includes(t)) ||
    (p.barcode && p.barcode.includes(t)) ||
    (p.secondaryBarcodes && p.secondaryBarcodes.includes(t)) ||
    (p.pluCode && p.pluCode.includes(t))
  );
  renderProductsTable(filtered);
}

function renderProductsTable(list) {
  const tbody = document.getElementById("products-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:30px; color:#94a3b8;">Nenhum produto cadastrado. Clique no botão "+ Novo Produto" acima.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><strong>${p.sku}</strong></td>
      <td><code>${p.barcode || "-"}</code></td>
      <td>
        <div><strong>${p.name}</strong></div>
        <small style="color:#94a3b8;">PDV: ${p.shortName || p.name.slice(0, 25)} | Marca: ${p.brand || "-"}</small>
      </td>
      <td>
        <div>${p.department || "Mercearia"}</div>
        <small style="color:#64748b;">${p.section || p.category || "-"}</small>
      </td>
      <td class="text-center">
        ${p.isWeighable
          ? `<span class="badge badge-amber" title="Pesa: ${p.weighType === 1 ? 'Retaguarda (Etiqueta)' : 'Checkout (Balança)'}">PLU: ${p.pluCode || p.sku}</span>`
          : `<span class="badge badge-gray">Unidade</span>`}
      </td>
      <td class="text-right">${fmtMoeda(p.costPrice * (1 + ((p.freightPct || 0) + (p.otherExpensesPct || 0))/100))}</td>
      <td class="text-right"><strong style="color:#38bdf8;">${fmtMoeda(p.salePrice)}</strong></td>
      <td class="text-right">
        <span class="${p.quantity <= (p.minQuantity || 5) ? 'badge badge-red' : 'badge badge-green'}">
          ${fmtNum(p.quantity, p.isWeighable ? 3 : 0)} ${p.unit || "UN"}
        </span>
      </td>
      <td class="text-center">
        <button class="btn btn-outline btn-sm" onclick="openProductEditModal('${p.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="deleteProduct('${p.id}', '${p.name}')">Excluir</button>
      </td>
    </tr>
  `).join("");
}

function openProductEditModal(id) {
  const p = id ? state.products.find(x => String(x.id) === String(id)) : {
    sku: String(Math.floor(1000 + Math.random() * 9000)),
    barcode: "",
    secondaryBarcodes: "",
    name: "",
    shortName: "",
    labelName: "",
    brand: "",
    department: "Mercearia",
    section: "Mercearia Seca",
    category: "Alimentos",
    subcategory: "Básicos",
    unit: "UN",
    itemType: "00",
    costPrice: 0.00,
    freightPct: 0.0,
    otherExpensesPct: 0.0,
    markupPct: 45.0,
    salePrice: 0.00,
    wholesaleMinQty: 6,
    wholesalePrice: 0.00,
    promoPrice: 0.00,
    commissionPct: 0.0,
    quantity: 10,
    minQuantity: 5,
    maxQuantity: 100,
    location: "Corredor 01 / Gôndola B",
    ncm: "19053100",
    cest: "",
    cfop: "5102",
    origin: "0",
    icmsCst: "102",
    icmsRate: 0.0,
    pisCst: "07",
    pisRate: 0.0,
    cofinsCst: "07",
    cofinsRate: 0.0,
    isWeighable: false,
    weighType: 0,
    pluCode: "",
    tareWeight: 0.0,
    shelfLifeDays: 90,
    supervisorAuthRequired: false,
    size: "",
    color: "",
    expiryDate: ""
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box extra-wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? "Editar Produto: " + p.name : "Novo Cadastro de Produto (Engenharia Reversa Linear Sistemas)"}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form id="product-form" onsubmit="saveProductForm(event, '${id || ""}')">
          <div class="modal-body">
            <!-- Navegador de Abas Estilo Linear Sistemas -->
            <div class="form-tabs">
              <span class="tab-link active" onclick="switchProductTab('identificacao', this)">1. Identificação & Classificação</span>
              <span class="tab-link" onclick="switchProductTab('balanca', this)">2. Balança, Açougue & Hortifruti</span>
              <span class="tab-link" onclick="switchProductTab('precificacao', this)">3. Formação de Preço & Custos</span>
              <span class="tab-link" onclick="switchProductTab('fiscal', this)">4. Fiscal & Tributário SEFAZ</span>
              <span class="tab-link" onclick="switchProductTab('estoque', this)">5. Estoque & Localização</span>
              <span class="tab-link" onclick="switchProductTab('grade', this)">6. Moda & Confecção</span>
            </div>

            <!-- Aba 1: Identificação & Classificação -->
            <div id="ptab-identificacao" class="ptab-content active">
              <div class="form-grid">
                <div class="form-group">
                  <label>Código Interno / SKU: *</label>
                  <input type="text" id="p-sku" class="form-control" value="${p.sku}" required />
                </div>
                <div class="form-group">
                  <label>EAN Principal (GTIN-13):</label>
                  <input type="text" id="p-barcode" class="form-control" value="${p.barcode || ""}" placeholder="7890000000000" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>EANs Secundários / Agrupamentos (DUN-14, Caixa, Fardo separados por vírgula):</label>
                  <input type="text" id="p-sec-barcodes" class="form-control" value="${p.secondaryBarcodes || ""}" placeholder="Ex: 17890000000007 (cx12), 27890000000004 (fd24)" />
                </div>

                <div class="form-group" style="grid-column: span 3;">
                  <label>Descrição Completa do Produto (Nota Fiscal / Cadastro Oficial): *</label>
                  <input type="text" id="p-name" class="form-control" value="${p.name}" required />
                </div>
                <div class="form-group">
                  <label>Marca / Fabricante:</label>
                  <input type="text" id="p-brand" class="form-control" value="${p.brand || ""}" />
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label>Descrição Reduzida PDV (Telas e Cupom Fiscal - máx 25 chars):</label>
                  <input type="text" id="p-shortname" class="form-control" maxlength="25" value="${p.shortName || ""}" placeholder="Ex: ARROZ CAMIL T1 5KG" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Descrição para Cartaz e Etiqueta de Gôndola:</label>
                  <input type="text" id="p-labelname" class="form-control" value="${p.labelName || ""}" placeholder="Ex: ARROZ BRANCO TIPO 1 CAMIL 5KG" />
                </div>

                <!-- Hierarquia Mercadológica em 4 Níveis (Linear Sistemas) -->
                <div class="form-group">
                  <label>Departamento: *</label>
                  <select id="p-dept" class="form-control">
                    <option value="Mercearia" ${p.department === 'Mercearia' ? 'selected' : ''}>Mercearia</option>
                    <option value="Açougue & Carnes" ${p.department === 'Açougue & Carnes' ? 'selected' : ''}>Açougue & Carnes</option>
                    <option value="Hortifruti" ${p.department === 'Hortifruti' ? 'selected' : ''}>Hortifruti</option>
                    <option value="Laticínios & Frios" ${p.department === 'Laticínios & Frios' ? 'selected' : ''}>Laticínios & Frios</option>
                    <option value="Bebidas" ${p.department === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
                    <option value="Padaria & Confeitaria" ${p.department === 'Padaria & Confeitaria' ? 'selected' : ''}>Padaria & Confeitaria</option>
                    <option value="Higiene & Perfumaria" ${p.department === 'Higiene & Perfumaria' ? 'selected' : ''}>Higiene & Perfumaria</option>
                    <option value="Limpeza" ${p.department === 'Limpeza' ? 'selected' : ''}>Limpeza</option>
                    <option value="Bazar & Utilidades" ${p.department === 'Bazar & Utilidades' ? 'selected' : ''}>Bazar & Utilidades</option>
                    <option value="Têxtil & Moda" ${p.department === 'Têxtil & Moda' ? 'selected' : ''}>Têxtil & Moda</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Seção:</label>
                  <input type="text" id="p-section" class="form-control" value="${p.section || ""}" placeholder="Ex: Mercearia Salgada" />
                </div>
                <div class="form-group">
                  <label>Categoria:</label>
                  <input type="text" id="p-category" class="form-control" value="${p.category || ""}" placeholder="Ex: Biscoitos" />
                </div>
                <div class="form-group">
                  <label>Subcategoria:</label>
                  <input type="text" id="p-subcategory" class="form-control" value="${p.subcategory || ""}" placeholder="Ex: Recheados" />
                </div>

                <div class="form-group">
                  <label>Unidade Comercial: *</label>
                  <select id="p-unit" class="form-control">
                    <option value="UN" ${p.unit === 'UN' ? 'selected' : ''}>UN - Unidade</option>
                    <option value="KG" ${p.unit === 'KG' ? 'selected' : ''}>KG - Quilograma</option>
                    <option value="CX" ${p.unit === 'CX' ? 'selected' : ''}>CX - Caixa</option>
                    <option value="FD" ${p.unit === 'FD' ? 'selected' : ''}>FD - Fardo</option>
                    <option value="LT" ${p.unit === 'LT' ? 'selected' : ''}>LT - Litro</option>
                    <option value="MT" ${p.unit === 'MT' ? 'selected' : ''}>MT - Metro</option>
                    <option value="PC" ${p.unit === 'PC' ? 'selected' : ''}>PC - Peça</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Tipo do Item (SPED):</label>
                  <select id="p-itemtype" class="form-control">
                    <option value="00" ${p.itemType === '00' ? 'selected' : ''}>00 - Mercadoria para Revenda</option>
                    <option value="01" ${p.itemType === '01' ? 'selected' : ''}>01 - Matéria-Prima</option>
                    <option value="04" ${p.itemType === '04' ? 'selected' : ''}>04 - Produto Acabado</option>
                    <option value="07" ${p.itemType === '07' ? 'selected' : ''}>07 - Material de Uso e Consumo</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Aba 2: Balança, Açougue & Hortifruti -->
            <div id="ptab-balanca" class="ptab-content">
              <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:16px; margin-bottom:16px;">
                <label class="custom-checkbox">
                  <input type="checkbox" id="p-is-weighable" ${p.isWeighable ? "checked" : ""} onchange="toggleWeighableSettings(this.checked)" />
                  <strong>PRODUTO PESÁVEL EM BALANÇA (Açougue, Hortifruti, Frios, Padaria, Balcão de Pesagem)</strong>
                </label>
              </div>

              <div id="balanca-fields" style="display:${p.isWeighable ? 'grid' : 'none'}; grid-template-columns: repeat(3, 1fr); gap:14px;">
                <div class="form-group">
                  <label>Código PLU da Balança (Toledo / Filizola): *</label>
                  <input type="text" id="p-plu" class="form-control" value="${p.pluCode || p.sku}" placeholder="Ex: 101, 205..." />
                </div>
                <div class="form-group">
                  <label>Modo de Pesagem:</label>
                  <select id="p-weigh-type" class="form-control">
                    <option value="0" ${p.weighType === 0 ? 'selected' : ''}>Pesa no Checkout (Balança acoplada ao PDV)</option>
                    <option value="1" ${p.weighType === 1 ? 'selected' : ''}>Pesa na Retaguarda / Balcão (Etiqueta emitida pela balança)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Tara da Embalagem (em Gramas):</label>
                  <input type="number" step="1" id="p-tare" class="form-control" value="${p.tareWeight || 0}" placeholder="Gramas a abater" />
                </div>
                <div class="form-group">
                  <label>Validade após Embalagem (dias):</label>
                  <input type="number" step="1" id="p-shelflife" class="form-control" value="${p.shelfLifeDays || 90}" />
                </div>
                <div class="form-group" style="grid-column: span 2; display:flex; align-items:center;">
                  <label class="custom-checkbox" style="margin-top:16px;">
                    <input type="checkbox" id="p-supervisor-auth" ${p.supervisorAuthRequired ? "checked" : ""} />
                    <span>Exigir autorização de supervisor para alterar peso no PDV</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Aba 3: Formação de Preço & Custos -->
            <div id="ptab-precificacao" class="ptab-content">
              <div class="form-grid-4">
                <div class="form-group">
                  <label>Custo de Compra / Entrada (R$):</label>
                  <input type="number" step="0.01" id="p-cost" class="form-control" value="${p.costPrice || 0}" oninput="recalcProductPricing()" />
                </div>
                <div class="form-group">
                  <label>Frete Rateado (%):</label>
                  <input type="number" step="0.1" id="p-freight" class="form-control" value="${p.freightPct || 0}" oninput="recalcProductPricing()" />
                </div>
                <div class="form-group">
                  <label>Outras Despesas (%):</label>
                  <input type="number" step="0.1" id="p-otherexp" class="form-control" value="${p.otherExpensesPct || 0}" oninput="recalcProductPricing()" />
                </div>
                <div class="form-group">
                  <label>Custo Líquido Real (R$):</label>
                  <input type="text" id="p-netcost" class="form-control" readonly style="font-weight:700; color:#38bdf8;" />
                </div>
              </div>

              <div class="form-grid-4" style="margin-top:16px;">
                <div class="form-group">
                  <label>Markup de Venda (%):</label>
                  <input type="number" step="0.1" id="p-markup" class="form-control" value="${p.markupPct || 45}" oninput="calcSaleFromCost()" />
                </div>
                <div class="form-group">
                  <label>Preço Venda Varejo (R$): *</label>
                  <input type="number" step="0.01" id="p-sale" class="form-control" value="${p.salePrice || 0}" required oninput="calcMarkupFromSale()" style="font-weight:800; font-size:16px; color:#22c55e;" />
                </div>
                <div class="form-group">
                  <label>Margem Bruta Real (%):</label>
                  <input type="text" id="p-realmargin" class="form-control" readonly style="font-weight:700;" />
                </div>
                <div class="form-group">
                  <label>Comissão Vendedor (%):</label>
                  <input type="number" step="0.1" id="p-comms" class="form-control" value="${p.commissionPct || 0}" />
                </div>
              </div>

              <div class="form-section-title" style="margin-top:20px;">Preço Atacarejo (Atacado) & Promoção Tablóide</div>
              <div class="form-grid-4">
                <div class="form-group">
                  <label>Qtd Mínima Atacarejo:</label>
                  <input type="number" step="1" id="p-ws-qty" class="form-control" value="${p.wholesaleMinQty || 6}" placeholder="Ex: A partir de 6 un" />
                </div>
                <div class="form-group">
                  <label>Preço Venda Atacarejo (R$):</label>
                  <input type="number" step="0.01" id="p-ws-price" class="form-control" value="${p.wholesalePrice || 0}" placeholder="Preço especial atacado" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Preço Promocional / Tablóide (R$):</label>
                  <input type="number" step="0.01" id="p-promo-price" class="form-control" value="${p.promoPrice || 0}" placeholder="Preço se estiver em encarte" />
                </div>
              </div>
            </div>

            <!-- Aba 4: Fiscal & Tributário SEFAZ -->
            <div id="ptab-fiscal" class="ptab-content">
              <div class="form-grid-4">
                <div class="form-group">
                  <label>NCM (8 Dígitos): *</label>
                  <input type="text" id="p-ncm" class="form-control" value="${p.ncm || ""}" placeholder="00000000" maxlength="8" required />
                </div>
                <div class="form-group">
                  <label>CEST (Substituição Tributária):</label>
                  <input type="text" id="p-cest" class="form-control" value="${p.cest || ""}" placeholder="0000000" maxlength="7" />
                </div>
                <div class="form-group">
                  <label>CFOP Venda Estadual: *</label>
                  <select id="p-cfop" class="form-control">
                    <option value="5102" ${p.cfop === '5102' ? 'selected' : ''}>5102 - Venda Mercadoria Adquirida</option>
                    <option value="5405" ${p.cfop === '5405' ? 'selected' : ''}>5405 - Venda c/ ICMS Cobrado ST</option>
                    <option value="5101" ${p.cfop === '5101' ? 'selected' : ''}>5101 - Venda Produção do Estabelecimento</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Origem da Mercadoria:</label>
                  <select id="p-origin" class="form-control">
                    <option value="0" ${p.origin === '0' ? 'selected' : ''}>0 - Nacional</option>
                    <option value="1" ${p.origin === '1' ? 'selected' : ''}>1 - Importação Direta</option>
                    <option value="2" ${p.origin === '2' ? 'selected' : ''}>2 - Adquirida Mercado Interno</option>
                  </select>
                </div>
              </div>

              <div class="form-section-title" style="margin-top:16px;">Tributação ICMS, PIS e COFINS</div>
              <div class="form-grid-3">
                <div class="form-group">
                  <label>CST / CSOSN ICMS:</label>
                  <select id="p-icms-cst" class="form-control">
                    <option value="102" ${p.icmsCst === '102' ? 'selected' : ''}>102 - Tributada pelo Simples sem permissão de crédito</option>
                    <option value="500" ${p.icmsCst === '500' ? 'selected' : ''}>500 - ICMS cobrado anteriormente por ST</option>
                    <option value="00" ${p.icmsCst === '00' ? 'selected' : ''}>00 - Tributada integralmente</option>
                    <option value="20" ${p.icmsCst === '20' ? 'selected' : ''}>20 - Com redução de base de cálculo</option>
                    <option value="40" ${p.icmsCst === '40' ? 'selected' : ''}>40 - Isenta</option>
                    <option value="60" ${p.icmsCst === '60' ? 'selected' : ''}>60 - Cobrado anteriormente por ST</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Alíquota ICMS (%):</label>
                  <input type="number" step="0.1" id="p-icms-rate" class="form-control" value="${p.icmsRate || 0}" />
                </div>
                <div></div>

                <div class="form-group">
                  <label>CST PIS:</label>
                  <select id="p-pis-cst" class="form-control">
                    <option value="07" ${p.pisCst === '07' ? 'selected' : ''}>07 - Operação Isenta da Contribuição</option>
                    <option value="01" ${p.pisCst === '01' ? 'selected' : ''}>01 - Operação Tributável com Alíquota Básica</option>
                    <option value="04" ${p.pisCst === '04' ? 'selected' : ''}>04 - Operação Tributável Monofásica</option>
                    <option value="06" ${p.pisCst === '06' ? 'selected' : ''}>06 - Alíquota Zero</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Alíquota PIS (%):</label>
                  <input type="number" step="0.1" id="p-pis-rate" class="form-control" value="${p.pisRate || 0}" />
                </div>
                <div></div>

                <div class="form-group">
                  <label>CST COFINS:</label>
                  <select id="p-cofins-cst" class="form-control">
                    <option value="07" ${p.cofinsCst === '07' ? 'selected' : ''}>07 - Operação Isenta da Contribuição</option>
                    <option value="01" ${p.cofinsCst === '01' ? 'selected' : ''}>01 - Operação Tributável com Alíquota Básica</option>
                    <option value="04" ${p.cofinsCst === '04' ? 'selected' : ''}>04 - Operação Tributável Monofásica</option>
                    <option value="06" ${p.cofinsCst === '06' ? 'selected' : ''}>06 - Alíquota Zero</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Alíquota COFINS (%):</label>
                  <input type="number" step="0.1" id="p-cofins-rate" class="form-control" value="${p.cofinsRate || 0}" />
                </div>
              </div>
            </div>

            <!-- Aba 5: Estoque & Localização -->
            <div id="ptab-estoque" class="ptab-content">
              <div class="form-grid-3">
                <div class="form-group">
                  <label>Estoque Físico Atual: *</label>
                  <input type="number" step="0.001" id="p-qty" class="form-control" value="${p.quantity || 0}" required />
                </div>
                <div class="form-group">
                  <label>Estoque Mínimo (Ponto de Reposição):</label>
                  <input type="number" step="0.001" id="p-minqty" class="form-control" value="${p.minQuantity || 5}" />
                </div>
                <div class="form-group">
                  <label>Estoque Máximo (Capacidade Loja):</label>
                  <input type="number" step="0.001" id="p-maxqty" class="form-control" value="${p.maxQuantity || 100}" />
                </div>
              </div>

              <div class="form-grid-2" style="margin-top:16px;">
                <div class="form-group">
                  <label>Localização Física na Loja (Corredor, Gôndola, Prateleira):</label>
                  <input type="text" id="p-location" class="form-control" value="${p.location || ""}" placeholder="Ex: Corredor 03, Prateleira 2" />
                </div>
                <div class="form-group">
                  <label>Data de Validade do Lote Atual:</label>
                  <input type="date" id="p-expiry" class="form-control" value="${p.expiryDate ? p.expiryDate.split("T")[0] : ""}" />
                </div>
              </div>
            </div>

            <!-- Aba 6: Grade Moda & Confecção -->
            <div id="ptab-grade" class="ptab-content">
              <div class="form-grid-2">
                <div class="form-group">
                  <label>Tamanho / Numeração (Se aplicável):</label>
                  <input type="text" id="p-size" class="form-control" value="${p.size || ""}" placeholder="Ex: P, M, G, GG, 38, 40, 42..." />
                </div>
                <div class="form-group">
                  <label>Cor / Estampa:</label>
                  <input type="text" id="p-color" class="form-control" value="${p.color || ""}" placeholder="Ex: Azul Marinho, Estampado Floral" />
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Salvar Produto</button>
          </footer>
        </form>
      </div>
    </div>
  `;

  setTimeout(() => recalcProductPricing(), 50);
}

function switchProductTab(tabName, el) {
  document.querySelectorAll(".tab-link").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".ptab-content").forEach(c => c.classList.remove("active"));
  if (el) el.classList.add("active");
  const target = document.getElementById("ptab-" + tabName);
  if (target) target.classList.add("active");
}

function toggleWeighableSettings(checked) {
  const f = document.getElementById("balanca-fields");
  if (f) f.style.display = checked ? "grid" : "none";
}

function recalcProductPricing() {
  const cost = parseFloat(document.getElementById("p-cost")?.value) || 0;
  const freight = parseFloat(document.getElementById("p-freight")?.value) || 0;
  const otherexp = parseFloat(document.getElementById("p-otherexp")?.value) || 0;
  const markup = parseFloat(document.getElementById("p-markup")?.value) || 0;

  const netCost = cost * (1 + (freight + otherexp) / 100);
  const netInput = document.getElementById("p-netcost");
  if (netInput) netInput.value = fmtMoeda(netCost);

  calcSaleFromCost();
}

function calcSaleFromCost() {
  const cost = parseFloat(document.getElementById("p-cost")?.value) || 0;
  const freight = parseFloat(document.getElementById("p-freight")?.value) || 0;
  const otherexp = parseFloat(document.getElementById("p-otherexp")?.value) || 0;
  const markup = parseFloat(document.getElementById("p-markup")?.value) || 0;

  const netCost = cost * (1 + (freight + otherexp) / 100);
  const sale = netCost * (1 + markup / 100);

  const saleInput = document.getElementById("p-sale");
  if (saleInput && document.activeElement !== saleInput) {
    saleInput.value = sale.toFixed(2);
  }

  calcMarginDisplay(netCost, parseFloat(saleInput?.value) || sale);
}

function calcMarkupFromSale() {
  const cost = parseFloat(document.getElementById("p-cost")?.value) || 0;
  const freight = parseFloat(document.getElementById("p-freight")?.value) || 0;
  const otherexp = parseFloat(document.getElementById("p-otherexp")?.value) || 0;
  const netCost = cost * (1 + (freight + otherexp) / 100);

  const sale = parseFloat(document.getElementById("p-sale")?.value) || 0;
  if (netCost > 0) {
    const markup = ((sale - netCost) / netCost) * 100;
    const markupInput = document.getElementById("p-markup");
    if (markupInput) markupInput.value = markup.toFixed(1);
  }
  calcMarginDisplay(netCost, sale);
}

function calcMarginDisplay(netCost, salePrice) {
  const marginInput = document.getElementById("p-realmargin");
  if (!marginInput) return;
  if (salePrice > 0) {
    const grossMargin = ((salePrice - netCost) / salePrice) * 100;
    marginInput.value = grossMargin.toFixed(1) + "%";
  } else {
    marginInput.value = "0.0%";
  }
}

async function saveProductForm(event, id) {
  event.preventDefault();

  const payload = {
    id: id || null,
    sku: document.getElementById("p-sku").value.trim(),
    barcode: document.getElementById("p-barcode").value.trim(),
    secondaryBarcodes: document.getElementById("p-sec-barcodes").value.trim(),
    name: document.getElementById("p-name").value.trim(),
    shortName: document.getElementById("p-shortname").value.trim(),
    labelName: document.getElementById("p-labelname").value.trim(),
    brand: document.getElementById("p-brand").value.trim(),
    department: document.getElementById("p-dept").value,
    section: document.getElementById("p-section").value.trim(),
    category: document.getElementById("p-category").value.trim(),
    subcategory: document.getElementById("p-subcategory").value.trim(),
    unit: document.getElementById("p-unit").value,
    itemType: document.getElementById("p-itemtype").value,
    costPrice: parseFloat(document.getElementById("p-cost").value) || 0,
    freightPct: parseFloat(document.getElementById("p-freight").value) || 0,
    otherExpensesPct: parseFloat(document.getElementById("p-otherexp").value) || 0,
    markupPct: parseFloat(document.getElementById("p-markup").value) || 0,
    salePrice: parseFloat(document.getElementById("p-sale").value) || 0,
    wholesaleMinQty: parseFloat(document.getElementById("p-ws-qty").value) || 0,
    wholesalePrice: parseFloat(document.getElementById("p-ws-price").value) || 0,
    promoPrice: parseFloat(document.getElementById("p-promo-price").value) || 0,
    commissionPct: parseFloat(document.getElementById("p-comms").value) || 0,
    quantity: parseFloat(document.getElementById("p-qty").value) || 0,
    minQuantity: parseFloat(document.getElementById("p-minqty").value) || 0,
    maxQuantity: parseFloat(document.getElementById("p-maxqty").value) || 0,
    location: document.getElementById("p-location").value.trim(),
    ncm: document.getElementById("p-ncm").value.trim(),
    cest: document.getElementById("p-cest").value.trim(),
    cfop: document.getElementById("p-cfop").value,
    origin: document.getElementById("p-origin").value,
    icmsCst: document.getElementById("p-icms-cst").value,
    icmsRate: parseFloat(document.getElementById("p-icms-rate").value) || 0,
    pisCst: document.getElementById("p-pis-cst").value,
    pisRate: parseFloat(document.getElementById("p-pis-rate").value) || 0,
    cofinsCst: document.getElementById("p-cofins-cst").value,
    cofinsRate: parseFloat(document.getElementById("p-cofins-rate").value) || 0,
    isWeighable: document.getElementById("p-is-weighable").checked,
    weighType: parseInt(document.getElementById("p-weigh-type")?.value || "0"),
    pluCode: document.getElementById("p-plu")?.value.trim() || "",
    tareWeight: parseFloat(document.getElementById("p-tare")?.value || "0"),
    shelfLifeDays: parseInt(document.getElementById("p-shelflife")?.value || "90"),
    supervisorAuthRequired: document.getElementById("p-supervisor-auth")?.checked || false,
    size: document.getElementById("p-size").value.trim(),
    color: document.getElementById("p-color").value.trim(),
    expiryDate: document.getElementById("p-expiry").value
  };

  try {
    if (id) {
      await API.put(`/api/products/${id}`, payload);
    } else {
      await API.post("/api/products", payload);
    }
    closeModal();
    await loadProductsList();
    alert("Produto salvo com sucesso!");
  } catch (e) {
    alert("Erro ao salvar produto: " + e.message);
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Confirma a exclusão do produto "${name}"?`)) return;
  try {
    await API.del(`/api/products/${id}`);
    await loadProductsList();
  } catch (e) {
    alert("Erro ao excluir produto: " + e.message);
  }
}

// =====================================================================
// MÓDULO 3: ABERTURA E FECHAMENTO DE CAIXA (TELA INDEPENDENTE E DEDICADA)
// =====================================================================
function renderCashModule() {
  setTimeout(() => loadCashSessionStatus(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Abertura & Fechamento de Caixa</h2>
          <small style="color:var(--text-muted);">Controle de turno do terminal PDV, fundo de troco, apuração cega de valores e Leitura Z</small>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-outline" onclick="navigate('/movimentacoes-caixa')">Ver Extrato de Movimentações</button>
        </div>
      </header>

      <div id="cash-session-view">
        <p style="color:#94a3b8; padding:20px;">Verificando status do terminal de caixa...</p>
      </div>

      <div style="margin-top:28px;">
        <h3 style="font-size:15px; color:#fff; margin-bottom:12px; font-weight:700;">Histórico de Turnos e Caixas Fechados Anteriormente</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data / Hora Abertura</th>
                <th>Data / Hora Fechamento</th>
                <th>Operador</th>
                <th class="text-right">Fundo de Troco</th>
                <th class="text-right">Total Dinheiro</th>
                <th class="text-right">Total Cartões</th>
                <th class="text-right">Total PIX</th>
                <th class="text-right">Diferença (Quebra/Sobra)</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody id="cash-history-tbody">
              <tr><td colspan="9" class="text-center" style="padding:20px; color:#94a3b8;">Carregando histórico...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function loadCashSessionStatus() {
  const container = document.getElementById("cash-session-view");
  if (!container) return;

  try {
    const data = await API.get("/api/cash/status");
    const history = await API.get("/api/cash/history");
    renderCashHistoryTable(history || []);

    const s = data && data.id ? data : (data && data.session ? data.session : null);

    if (!s || s.status !== "ABERTO") {
      // CAIXA FECHADO
      container.innerHTML = `
        <div style="background:#1e1b2e; border:1px solid #4338ca; border-radius:10px; padding:24px; max-width:680px; margin:0 auto; text-align:center;">
          <h3 style="color:#c7d2fe; font-size:18px; margin-bottom:8px;">O Caixa deste terminal encontra-se atualmente FECHADO</h3>
          <p style="color:#94a3b8; font-size:13px; margin-bottom:20px;">Para iniciar as vendas no PDV, realize a abertura de caixa informando o valor do fundo de troco:</p>

          <form onsubmit="handleOpenCashSubmit(event)" style="display:flex; flex-direction:column; gap:14px; max-width:380px; margin:0 auto; text-align:left;">
            <div class="form-group">
              <label>Operador Responsável:</label>
              <input type="text" class="form-control" value="${state.user.name}" readonly />
            </div>
            <div class="form-group">
              <label>Fundo de Troco Inicial (R$): *</label>
              <input type="number" step="0.01" id="open-cash-amount" class="form-control" value="150.00" required style="font-size:18px; font-weight:700; color:#22c55e;" />
            </div>
            <button type="submit" class="btn btn-success btn-lg" style="margin-top:10px;">Confirmar Abertura de Caixa</button>
          </form>
        </div>
      `;
      return;
    }

    // CAIXA ABERTO
    s.calculatedInDrawer = s.closingBalanceExpected != null ? s.closingBalanceExpected : (s.openingBalance + (s.totalInflows || 0) - (s.totalOutflows || 0));
    s.totalCash = s.totalCash || (s.totalInflows || 0);
    s.totalPix = s.totalPix || 0;
    s.totalDebit = s.totalDebit || 0;
    s.totalCredit = s.totalCredit || 0;
    s.totalCrediario = s.totalCrediario || 0;
    s.totalSuprimento = s.totalSuprimento || 0;
    s.totalSangria = s.totalSangria || (s.totalOutflows || 0);
    state.cashSession = s;

    container.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card success-card">
          <span>Status do Terminal</span>
          <strong style="color:#22c55e; font-size:20px;">CAIXA ABERTO</strong>
          <small>Operador: ${s.operatorName}</small>
        </div>
        <div class="metric-card">
          <span>Aberto Em</span>
          <strong style="font-size:16px;">${fmtDataHora(s.openedAt)}</strong>
          <small>Terminal PDV 01</small>
        </div>
        <div class="metric-card">
          <span>Fundo de Troco Inicial</span>
          <strong>${fmtMoeda(s.openingBalance)}</strong>
          <small>Aporte de abertura</small>
        </div>
        <div class="metric-card accent-card">
          <span>Saldo Calculado em Gaveta</span>
          <strong style="color:#38bdf8;">${fmtMoeda(s.calculatedInDrawer)}</strong>
          <small>Dinheiro + Suprimentos - Sangrias</small>
        </div>
      </div>

      <div style="background:#0f172a; border:1px solid var(--border); border-radius:10px; padding:20px; margin-bottom:24px;">
        <h3 style="font-size:14px; color:#38bdf8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:14px;">Resumo Acumulado do Turno Atual por Forma de Pagamento</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px;">
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Vendas em Dinheiro</span>
            <div style="font-size:16px; font-weight:700; color:#fff;">${fmtMoeda(s.totalCash)}</div>
          </div>
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Vendas PIX</span>
            <div style="font-size:16px; font-weight:700; color:#fff;">${fmtMoeda(s.totalPix)}</div>
          </div>
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Cartão Débito</span>
            <div style="font-size:16px; font-weight:700; color:#fff;">${fmtMoeda(s.totalDebit)}</div>
          </div>
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Cartão Crédito</span>
            <div style="font-size:16px; font-weight:700; color:#fff;">${fmtMoeda(s.totalCredit)}</div>
          </div>
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Crediário / Convênio</span>
            <div style="font-size:16px; font-weight:700; color:#fff;">${fmtMoeda(s.totalCrediario)}</div>
          </div>
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Suprimentos (+)</span>
            <div style="font-size:16px; font-weight:700; color:#22c55e;">+ ${fmtMoeda(s.totalSuprimento)}</div>
          </div>
          <div style="background:#131c31; padding:12px; border-radius:6px;">
            <span style="font-size:11px; color:#94a3b8;">Sangrias (-)</span>
            <div style="font-size:16px; font-weight:700; color:#ef4444;">- ${fmtMoeda(s.totalSangria)}</div>
          </div>
        </div>
      </div>

      <!-- Seção de Fechamento de Caixa & Leitura Z -->
      <div style="background:#151e34; border:1px solid #374b75; border-radius:10px; padding:22px;">
        <h3 style="font-size:16px; color:#fff; font-weight:700; margin-bottom:12px;">Fechamento de Caixa & Conferência Cega (Leitura Z)</h3>
        <p style="color:#94a3b8; font-size:13px; margin-bottom:16px;">
          Digite o total apurado fisicamente em dinheiro na gaveta para conferência cega:
        </p>

        <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap;">
          <div class="form-group" style="width:240px;">
            <label>Dinheiro Físico na Gaveta (R$):</label>
            <input type="number" step="0.01" id="blind-cash-count" class="form-control" style="font-size:16px; font-weight:700;" placeholder="0,00" oninput="calcCashVariance(${s.calculatedInDrawer})" />
          </div>
          <div id="variance-display" style="padding:10px 16px; background:#0b1120; border-radius:6px; min-width:200px; font-size:13px;">
            Diferença: <strong style="color:#94a3b8;">Digite o valor</strong>
          </div>
          <button class="btn btn-outline" onclick="printLeituraX()">Imprimir Leitura X (Prévia)</button>
          <button class="btn btn-danger btn-lg" onclick="handleCloseCashSubmit()">Encerrar Turno e Fechar Caixa (Leitura Z)</button>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444; padding:20px;">Erro ao carregar dados do caixa: ${e.message}</p>`;
  }
}

function calcCashVariance(expected) {
  const entered = parseFloat(document.getElementById("blind-cash-count")?.value) || 0;
  const diff = entered - expected;
  const disp = document.getElementById("variance-display");
  if (!disp) return;

  if (Math.abs(diff) < 0.01) {
    disp.innerHTML = `Diferença: <strong style="color:#22c55e;">R$ 0,00 (Caixa Perfeito)</strong>`;
  } else if (diff > 0) {
    disp.innerHTML = `Diferença: <strong style="color:#38bdf8;">+ ${fmtMoeda(diff)} (SOBRA DE CAIXA)</strong>`;
  } else {
    disp.innerHTML = `Diferença: <strong style="color:#ef4444;">- ${fmtMoeda(Math.abs(diff))} (QUEBRA DE CAIXA)</strong>`;
  }
}

async function handleOpenCashSubmit(e) {
  e.preventDefault();
  const amt = parseFloat(document.getElementById("open-cash-amount")?.value) || 0;
  try {
    await API.post("/api/cash/open", {
      operatorName: state.user.name,
      openingBalance: amt
    });
    alert("Caixa aberto com sucesso!");
    await loadCashSessionStatus();
  } catch (err) {
    alert("Erro ao abrir caixa: " + err.message);
  }
}

async function handleCloseCashSubmit() {
  const input = document.getElementById("blind-cash-count");
  const count = parseFloat(input?.value);
  if (isNaN(count)) {
    alert("Por favor, digite o valor apurado na gaveta para conferência.");
    input?.focus();
    return;
  }

  if (!confirm(`Confirma o fechamento do caixa com o valor contado de ${fmtMoeda(count)}? Após fechar, será emitida a Leitura Z.`)) {
    return;
  }

  try {
    const res = await API.post("/api/cash/close", { physicalBalance: count });
    alert(`Caixa fechado com sucesso!\n\nSaldo Esperado: ${fmtMoeda(res.expectedBalance)}\nSaldo Contado: ${fmtMoeda(res.physicalBalance)}\nDiferença: ${fmtMoeda(res.difference)}`);
    await loadCashSessionStatus();
  } catch (err) {
    alert("Erro ao fechar caixa: " + err.message);
  }
}

function printLeituraX() {
  window.print();
}

function renderCashHistoryTable(list) {
  const tbody = document.getElementById("cash-history-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:20px; color:#94a3b8;">Nenhum histórico anterior registrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(h => `
    <tr>
      <td>${fmtDataHora(h.openedAt)}</td>
      <td>${fmtDataHora(h.closedAt)}</td>
      <td>${h.operatorName || "-"}</td>
      <td class="text-right">${fmtMoeda(h.openingBalance)}</td>
      <td class="text-right">${fmtMoeda(h.totalCash)}</td>
      <td class="text-right">${fmtMoeda(h.totalDebit + h.totalCredit)}</td>
      <td class="text-right">${fmtMoeda(h.totalPix)}</td>
      <td class="text-right" style="color:${(h.difference || 0) < 0 ? '#ef4444' : ((h.difference || 0) > 0 ? '#38bdf8' : '#22c55e')}; font-weight:700;">
        ${fmtMoeda(h.difference)}
      </td>
      <td class="text-center"><span class="badge badge-gray">Fechado</span></td>
    </tr>
  `).join("");
}

// =====================================================================
// MÓDULO 4: MOVIMENTAÇÃO DIÁRIA E FLUXO DE CAIXA (EXTRATO ANALÍTICO INDEPENDENTE)
// =====================================================================
function renderCashMovementsModule() {
  setTimeout(() => loadCashMovements(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Movimentações Diárias & Fluxo Analítico de Caixa</h2>
          <small style="color:var(--text-muted);">Extrato cronológico completo de entradas, saídas, vendas PDV, sangrias e suprimentos</small>
        </div>
        <div style="display:flex; gap:10px;">
          <select id="mov-filter-type" class="form-control" style="width:180px;" onchange="loadCashMovements()">
            <option value="">Todos os Tipos</option>
            <option value="VENDA">Vendas PDV</option>
            <option value="SUPRIMENTO">Suprimentos (Troco)</option>
            <option value="SANGRIA">Sangrias (Retirada)</option>
            <option value="ABERTURA">Aberturas</option>
            <option value="FECHAMENTO">Fechamentos</option>
          </select>
          <button class="btn btn-secondary" onclick="openSuprimentoModal()">+ Suprimento</button>
          <button class="btn btn-danger" onclick="openSangriaModal()">- Sangria</button>
          <button class="btn btn-outline" onclick="window.print()">Imprimir Extrato</button>
        </div>
      </header>

      <div class="metrics-grid">
        <div class="metric-card success-card">
          <span>Total Entradas (+)</span>
          <strong id="total-entradas" style="color:#22c55e;">R$ 0,00</strong>
          <small>Vendas e suprimentos</small>
        </div>
        <div class="metric-card danger-card">
          <span>Total Saídas (-)</span>
          <strong id="total-saidas" style="color:#ef4444;">R$ 0,00</strong>
          <small>Sangrias e retiradas</small>
        </div>
        <div class="metric-card accent-card">
          <span>Saldo Líquido</span>
          <strong id="total-saldo" style="color:#38bdf8;">R$ 0,00</strong>
          <small>Entradas menos saídas</small>
        </div>
        <div class="metric-card">
          <span>Qtd Lançamentos</span>
          <strong id="total-qtd">0</strong>
          <small>Registros no extrato</small>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Tipo de Movimento</th>
              <th>Histórico / Descrição</th>
              <th>Operador</th>
              <th class="text-right">Entrada (+)</th>
              <th class="text-right">Saída (-)</th>
            </tr>
          </thead>
          <tbody id="movements-tbody">
            <tr><td colspan="6" class="text-center" style="padding:24px; color:#94a3b8;">Carregando extrato...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadCashMovements() {
  const typeFilter = document.getElementById("mov-filter-type")?.value || "";
  try {
    const list = await API.get(`/api/cash/movements${typeFilter ? '?type=' + typeFilter : ''}`);
    renderMovementsTable(list || []);
  } catch (e) {
    console.error("Erro ao carregar movimentações:", e);
  }
}

function renderMovementsTable(list) {
  const tbody = document.getElementById("movements-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:30px; color:#94a3b8;">Nenhuma movimentação encontrada para o filtro selecionado.</td></tr>`;
    document.getElementById("total-entradas").innerText = "R$ 0,00";
    document.getElementById("total-saidas").innerText = "R$ 0,00";
    document.getElementById("total-saldo").innerText = "R$ 0,00";
    document.getElementById("total-qtd").innerText = "0";
    return;
  }

  let totIn = 0;
  let totOut = 0;

  tbody.innerHTML = list.map(m => {
    const isOut = m.type === "SANGRIA";
    const amt = Number(m.amount || 0);
    if (isOut) totOut += amt;
    else totIn += amt;

    const badgeClass = m.type === "SANGRIA" ? "badge-red" : (m.type === "SUPRIMENTO" ? "badge-amber" : "badge-green");

    return `
      <tr>
        <td>${fmtDataHora(m.createdAt)}</td>
        <td><span class="badge ${badgeClass}">${m.type}</span></td>
        <td>${m.description || "-"}</td>
        <td>${m.operatorName || "-"}</td>
        <td class="text-right" style="color:#22c55e; font-weight:600;">${!isOut ? fmtMoeda(amt) : "-"}</td>
        <td class="text-right" style="color:#ef4444; font-weight:600;">${isOut ? fmtMoeda(amt) : "-"}</td>
      </tr>
    `;
  }).join("");

  document.getElementById("total-entradas").innerText = fmtMoeda(totIn);
  document.getElementById("total-saidas").innerText = fmtMoeda(totOut);
  document.getElementById("total-saldo").innerText = fmtMoeda(totIn - totOut);
  document.getElementById("total-qtd").innerText = String(list.length);
}

// =====================================================================
// MODAIS DEDICADOS DE SANGRIA E SUPRIMENTO
// =====================================================================
function openSangriaModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">Sangria de Caixa (Retirada de Dinheiro da Gaveta)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <form onsubmit="handleSangriaSubmit(event)">
          <div class="modal-body">
            <p style="color:#94a3b8; font-size:13px; margin-bottom:14px;">
              A sangria retira valores da gaveta para cofre, depósito ou pagamentos. O comprovante será registrado no extrato.
            </p>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Valor da Retirada (R$): *</label>
              <input type="number" step="0.01" id="sangria-val" class="form-control" required style="font-size:20px; font-weight:800; color:#ef4444;" placeholder="0,00" />
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Motivo Detalhado da Sangria: *</label>
              <select id="sangria-reason" class="form-control" required>
                <option value="Recolhimento para o cofre da loja">Recolhimento para o cofre da loja</option>
                <option value="Depósito bancário diário">Depósito bancário diário</option>
                <option value="Pagamento de despesa operacional">Pagamento de despesa operacional</option>
                <option value="Pagamento de fornecedor no caixa">Pagamento de fornecedor no caixa</option>
                <option value="Excesso de numerário em gaveta">Excesso de numerário em gaveta</option>
              </select>
            </div>
            <div class="form-group">
              <label>Observação / Complemento:</label>
              <input type="text" id="sangria-obs" class="form-control" placeholder="Número do comprovante, favorecido, etc." />
            </div>
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-danger">Confirmar e Imprimir Sangria</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

async function handleSangriaSubmit(e) {
  e.preventDefault();
  const amt = parseFloat(document.getElementById("sangria-val")?.value) || 0;
  const reason = document.getElementById("sangria-reason")?.value;
  const obs = document.getElementById("sangria-obs")?.value.trim();
  const desc = obs ? `${reason} (${obs})` : reason;

  try {
    await API.post("/api/cash/sangria", {
      amount: amt,
      description: desc,
      operatorName: state.user.name
    });
    closeModal();
    alert(`Sangria de ${fmtMoeda(amt)} confirmada com sucesso!`);
    if (state.currentRoute === "/caixa") loadCashSessionStatus();
    if (state.currentRoute === "/movimentacoes-caixa") loadCashMovements();
  } catch (err) {
    alert("Erro ao realizar sangria: " + err.message);
  }
}

function openSuprimentoModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">Suprimento de Caixa (Aporte / Fundo de Troco)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <form onsubmit="handleSuprimentoSubmit(event)">
          <div class="modal-body">
            <p style="color:#94a3b8; font-size:13px; margin-bottom:14px;">
              O suprimento adiciona dinheiro na gaveta durante o expediente para reforço de moedas ou troco.
            </p>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Valor do Aporte (R$): *</label>
              <input type="number" step="0.01" id="suprimento-val" class="form-control" required style="font-size:20px; font-weight:800; color:#22c55e;" placeholder="0,00" />
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Motivo do Suprimento: *</label>
              <select id="suprimento-reason" class="form-control" required>
                <option value="Reforço de moedas e notas para troco">Reforço de moedas e notas para troco</option>
                <option value="Aporte adicional de tesouraria">Aporte adicional de tesouraria</option>
                <option value="Troca de cédulas com gerente">Troca de cédulas com gerente</option>
              </select>
            </div>
            <div class="form-group">
              <label>Observação:</label>
              <input type="text" id="suprimento-obs" class="form-control" placeholder="Detalhes adicionais..." />
            </div>
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Confirmar Suprimento</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

async function handleSuprimentoSubmit(e) {
  e.preventDefault();
  const amt = parseFloat(document.getElementById("suprimento-val")?.value) || 0;
  const reason = document.getElementById("suprimento-reason")?.value;
  const obs = document.getElementById("suprimento-obs")?.value.trim();
  const desc = obs ? `${reason} (${obs})` : reason;

  try {
    await API.post("/api/cash/suprimento", {
      amount: amt,
      description: desc,
      operatorName: state.user.name
    });
    closeModal();
    alert(`Suprimento de ${fmtMoeda(amt)} confirmado com sucesso!`);
    if (state.currentRoute === "/caixa") loadCashSessionStatus();
    if (state.currentRoute === "/movimentacoes-caixa") loadCashMovements();
  } catch (err) {
    alert("Erro ao realizar suprimento: " + err.message);
  }
}

// =====================================================================
// MÓDULO 5: FRENTE DE CAIXA PDV (ARQUITETURA AVANÇADA ODOO POINT OF SALE)
// Recursos Odoo: Multi-Pedidos / Comandas, Grid Visual de Produtos por Categoria,
// Teclado NumPad Interativo, Pagamento Fracionado (Split Payments) e Entrada/Saída de Caixa
// =====================================================================

function renderPdvModule() {
  const order = getActiveOrder();
  const subtotal = order.cart.reduce((acc, it) => acc + (it.total || 0), 0);
  const totalItems = order.cart.reduce((acc, it) => acc + (it.quantity || 0), 0);

  // Filtra produtos para a grade visual (Odoo Product Grid)
  const categoryFilter = state.activeCategory || "Todos";
  const searchFilter = (state.posSearchQuery || "").toLowerCase().trim();

  let filteredProducts = state.products || [];
  if (categoryFilter !== "Todos") {
    filteredProducts = filteredProducts.filter(p => (p.department || "Mercearia") === categoryFilter || (p.category || "") === categoryFilter);
  }
  if (searchFilter) {
    filteredProducts = filteredProducts.filter(p =>
      (p.name && p.name.toLowerCase().includes(searchFilter)) ||
      (p.sku && p.sku.toLowerCase().includes(searchFilter)) ||
      (p.barcode && p.barcode.includes(searchFilter)) ||
      (p.pluCode && p.pluCode.includes(searchFilter))
    );
  }

  const selectedItem = order.cart[order.selectedItemIdx] || null;

  const categories = [
    "Todos", "Mercearia", "Carnes & Açougue", "Hortifruti",
    "Laticínios & Frios", "Bebidas", "Padaria",
    "Higiene & Perfumaria", "Limpeza", "Vestuário"
  ];

  return `
    <div class="odoo-pos-container">
      <!-- COLUNA DA ESQUERDA: PEDIDO / COMANDAS, TICKET, TOTAL E TECLADO NUMPAD (ODOO CART) -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        <!-- 1. Abas de Múltiplos Pedidos / Comandas em Aberto (Odoo Order Tabs) -->
        <div class="pos-order-tabs-bar">
          ${state.orders.map(o => `
            <div class="order-tab ${o.id === state.activeOrderId ? 'active' : ''}" onclick="switchOrderTab(${o.id})">
              <span>${o.name} (${o.cart.length})</span>
              ${state.orders.length > 1 ? `<span style="margin-left:6px; font-weight:800; color:#ef4444;" onclick="closeOrderTab(${o.id}, event)">✕</span>` : ''}
            </div>
          `).join("")}
          <button class="order-tab-add" title="Abrir nova comanda / pedido em paralelo" onclick="addNewOrderTab()">+ Nova Venda</button>
        </div>

        <!-- 2. Barra de Identificação do Cliente / Parceiro Odoo -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:#101a30; border:1px solid var(--border); border-radius:6px; padding:8px 12px; font-size:12px;">
          <div>
            Cliente: <strong style="color:#38bdf8;">${order.customer ? order.customer.name : "Consumidor Final"}</strong>
            ${order.customer && order.customer.creditLimit ? `<span class="badge badge-green" style="margin-left:6px;">Limite: ${fmtMoeda(order.customer.creditLimit - (order.customer.currentDebt || 0))}</span>` : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="openCustomerIdentifyModal()">${order.customer ? "Trocar" : "Identificar (F4)"}</button>
            ${order.customer ? `<button class="btn btn-danger btn-sm" onclick="removeCustomerFromOrder()">✕</button>` : ''}
          </div>
        </div>

        <!-- 3. Ticket / Tabela de Itens Lançados -->
        <div class="odoo-cart-wrapper">
          <table class="odoo-cart-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Descrição</th>
                <th class="text-right">Qtd</th>
                <th class="text-right">Unitário</th>
                <th class="text-center">Desc %</th>
                <th class="text-right">Total</th>
                <th class="text-center">✕</th>
              </tr>
            </thead>
            <tbody>
              ${order.cart.length === 0
                ? `<tr><td colspan="7" class="text-center" style="padding:40px; color:#64748b;">Nenhum item lançado. Bipe com o leitor ou clique nos produtos ao lado.</td></tr>`
                : order.cart.map((it, idx) => `
                  <tr class="${idx === order.selectedItemIdx ? 'selected' : ''}" onclick="selectCartItem(${idx})">
                    <td>${idx + 1}</td>
                    <td>
                      <div><strong>${it.name}</strong></div>
                      ${it.isWholesale ? `<small style="color:#38bdf8; font-weight:700;">★ Preço Atacado Aplicado</small>` : ''}
                    </td>
                    <td class="text-right">${fmtNum(it.quantity, it.isWeighable ? 3 : 0)} ${it.unit}</td>
                    <td class="text-right">${fmtMoeda(it.unitPrice)}</td>
                    <td class="text-center">${it.discountPct > 0 ? `${fmtNum(it.discountPct, 0)}%` : "-"}</td>
                    <td class="text-right"><strong style="color:#22c55e;">${fmtMoeda(it.total)}</strong></td>
                    <td class="text-center"><button class="btn btn-danger btn-sm" onclick="removeCartItem(${idx}, event)">✕</button></td>
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>

        <!-- 4. Totalizador e Item em Edição -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:#040711; border:2px solid #22c55e; border-radius:8px; padding:12px 18px;">
          <div>
            <span style="font-size:11px; color:#86efac; text-transform:uppercase; font-weight:700;">Subtotal (${totalItems} itens)</span>
            <div style="font-size:12px; color:#94a3b8;">
              ${selectedItem ? `Item ativo: <strong>${selectedItem.name}</strong>` : 'Nenhum item selecionado'}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:32px; font-weight:900; color:#22c55e; font-family:'Consolas', monospace; line-height:1;">
              ${fmtMoeda(subtotal)}
            </div>
          </div>
        </div>

        <!-- 5. NumPad Interativo Odoo & Barra de Ações Rápidas -->
        <div class="odoo-numpad-container">
          <div class="odoo-numpad">
            <button class="numpad-btn" onclick="handleNumpadDigit('1')">1</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('2')">2</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('3')">3</button>
            <button class="numpad-btn mode-btn ${state.numpadMode === 'qty' ? 'active' : ''}" onclick="setNumpadMode('qty')">Qtd</button>

            <button class="numpad-btn" onclick="handleNumpadDigit('4')">4</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('5')">5</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('6')">6</button>
            <button class="numpad-btn mode-btn ${state.numpadMode === 'disc' ? 'active' : ''}" onclick="setNumpadMode('disc')">Desc %</button>

            <button class="numpad-btn" onclick="handleNumpadDigit('7')">7</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('8')">8</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('9')">9</button>
            <button class="numpad-btn mode-btn ${state.numpadMode === 'price' ? 'active' : ''}" onclick="setNumpadMode('price')">Preço</button>

            <button class="numpad-btn" onclick="handleNumpadDigit('.')">.</button>
            <button class="numpad-btn" onclick="handleNumpadDigit('0')">0</button>
            <button class="numpad-btn action-danger" onclick="handleNumpadBackspace()">⌫</button>
            <button class="numpad-btn action-danger" onclick="removeSelectedCartItem()">✕ Item</button>
          </div>

          <div class="odoo-action-strip">
            <button class="odoo-strip-btn pay-btn" onclick="openOdooPaymentModal()">
              <strong>PAGAR (F12)</strong>
              <small>Múltiplas Formas</small>
            </button>
            <button class="odoo-strip-btn" onclick="triggerWeighingAction()">
              <span>Balança (F5)</span>
              <small>${state.activeScaleWeight.toFixed(3)} kg</small>
            </button>
            <button class="odoo-strip-btn" onclick="openCashInOutModal()">
              <span>Entrada / Saída</span>
              <small>Gaveta</small>
            </button>
            <button class="odoo-strip-btn" style="color:#ef4444;" onclick="cancelCurrentSale()">
              <span>Cancelar (F7)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- COLUNA DA DIREITA: SCANNER, PESAGEM, CATEGORIAS & GRADE VISUAL DE PRODUTOS (ODOO PRODUCT TILES) -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        <!-- 1. Scanner de Código de Barras & Busca Integrada -->
        <div style="display:grid; grid-template-columns:1fr 140px; gap:10px;">
          <input type="text" id="pdv-barcode-input" class="pdv-scanner-input" placeholder="Bipe o código de barras, SKU, PLU ou digite para filtrar..." value="${state.posSearchQuery}" oninput="handlePosSearchInput(this.value)" onkeydown="handlePdvInputKey(event)" autofocus />
          <button class="btn btn-secondary" onclick="triggerDrawer()">Abrir Gaveta (F6)</button>
        </div>

        <!-- 2. Ribbon de Categorias Odoo (Pills Horizontais) -->
        <div class="odoo-cat-ribbon">
          ${categories.map(cat => `
            <button class="cat-pill ${cat === state.activeCategory ? 'active' : ''}" onclick="filterPdvCategory('${cat}')">
              ${cat}
            </button>
          `).join("")}
        </div>

        <!-- 3. Grade de Produtos Odoo (Cards Interativos) -->
        <div class="odoo-product-grid">
          ${filteredProducts.length === 0
            ? `<div style="grid-column: span 4; text-align:center; padding:50px; color:#64748b;">Nenhum produto encontrado nesta categoria ou pesquisa.</div>`
            : filteredProducts.map(p => `
              <div class="odoo-product-card" onclick="addProductToActiveOrder('${p.id}')">
                <div>
                  <div class="odoo-prod-name" title="${p.name}">${p.name}</div>
                  <div style="font-size:10px; color:#64748b; margin-top:2px;">
                    SKU: ${p.sku} ${p.isWeighable ? `<span class="badge badge-amber" style="padding:1px 4px; font-size:9px;">PLU: ${p.pluCode || p.sku}</span>` : ''}
                  </div>
                </div>
                <div class="odoo-prod-meta">
                  <div class="odoo-prod-price">${fmtMoeda(p.salePrice)}</div>
                  <div class="odoo-prod-stock">
                    <span class="${p.quantity <= (p.minQuantity || 5) ? 'badge badge-red' : 'badge badge-gray'}" style="font-size:9px;">
                      ${fmtNum(p.quantity, p.isWeighable ? 2 : 0)} ${p.unit || "UN"}
                    </span>
                  </div>
                </div>
              </div>
            `).join("")}
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// GERENCIADOR DE MÚLTIPLOS PEDIDOS / COMANDAS (ODOO ORDER TABS)
// ---------------------------------------------------------------------
function switchOrderTab(orderId) {
  state.activeOrderId = orderId;
  renderApp();
}

function addNewOrderTab() {
  const newId = Date.now();
  const nextNum = state.orders.length + 1;
  state.orders.push({
    id: newId,
    name: `Venda ${nextNum}`,
    cart: [],
    customer: null,
    selectedItemIdx: 0,
    discountGlobalPct: 0
  });
  state.activeOrderId = newId;
  renderApp();
}

function closeOrderTab(orderId, event) {
  if (event) event.stopPropagation();
  if (state.orders.length <= 1) {
    const ord = state.orders[0];
    if (ord.cart.length > 0 && !confirm("Deseja limpar todos os itens desta venda?")) return;
    ord.cart = [];
    ord.customer = null;
    ord.selectedItemIdx = 0;
    renderApp();
    return;
  }

  const idx = state.orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    const ord = state.orders[idx];
    if (ord.cart.length > 0 && !confirm(`Confirma o cancelamento da comanda ${ord.name}?`)) return;
    state.orders.splice(idx, 1);
    state.activeOrderId = state.orders[0].id;
    renderApp();
  }
}

function selectCartItem(idx) {
  const order = getActiveOrder();
  order.selectedItemIdx = idx;
  renderApp();
}

function removeSelectedCartItem() {
  const order = getActiveOrder();
  if (order.cart.length === 0) return;
  order.cart.splice(order.selectedItemIdx, 1);
  if (order.selectedItemIdx >= order.cart.length) {
    order.selectedItemIdx = Math.max(0, order.cart.length - 1);
  }
  renderApp();
}

function removeCartItem(idx, event) {
  if (event) event.stopPropagation();
  const order = getActiveOrder();
  order.cart.splice(idx, 1);
  if (order.selectedItemIdx >= order.cart.length) {
    order.selectedItemIdx = Math.max(0, order.cart.length - 1);
  }
  renderApp();
}

function cancelCurrentSale() {
  const order = getActiveOrder();
  if (order.cart.length === 0) return;
  if (!confirm(`Confirma o cancelamento de todos os itens da ${order.name}?`)) return;
  order.cart = [];
  order.customer = null;
  order.selectedItemIdx = 0;
  renderApp();
}

// ---------------------------------------------------------------------
// NUMPAD INTERATIVO & EDIÇÃO DE LINHA ODOO
// ---------------------------------------------------------------------
function setNumpadMode(mode) {
  state.numpadMode = mode;
  renderApp();
}

function handleNumpadDigit(digit) {
  const order = getActiveOrder();
  const item = order.cart[order.selectedItemIdx];
  if (!item) return;

  let currentVal = "";
  if (state.numpadMode === "qty") currentVal = String(item.quantity);
  else if (state.numpadMode === "disc") currentVal = String(item.discountPct || 0);
  else if (state.numpadMode === "price") currentVal = String(item.unitPrice);

  if (currentVal === "0" && digit !== ".") currentVal = "";
  if (digit === "." && currentVal.includes(".")) return;

  const newVal = parseFloat(currentVal + digit) || 0;
  applyNumpadValue(item, newVal);
}

function handleNumpadBackspace() {
  const order = getActiveOrder();
  const item = order.cart[order.selectedItemIdx];
  if (!item) return;

  let currentStr = "";
  if (state.numpadMode === "qty") currentStr = String(item.quantity);
  else if (state.numpadMode === "disc") currentStr = String(item.discountPct || 0);
  else if (state.numpadMode === "price") currentStr = String(item.unitPrice);

  currentStr = currentStr.slice(0, -1);
  const newVal = currentStr ? parseFloat(currentStr) || 0 : 0;
  applyNumpadValue(item, newVal);
}

function applyNumpadValue(item, val) {
  if (state.numpadMode === "qty") {
    item.quantity = Math.max(0.001, val);
  } else if (state.numpadMode === "disc") {
    item.discountPct = Math.min(100, Math.max(0, val));
  } else if (state.numpadMode === "price") {
    item.unitPrice = Math.max(0, val);
  }

  // Recalcula total da linha com desconto
  const base = item.quantity * item.unitPrice;
  const discAmt = base * ((item.discountPct || 0) / 100);
  item.total = Math.max(0, base - discAmt);
  renderApp();
}

// ---------------------------------------------------------------------
// RIBBON DE CATEGORIAS & BUSCA ODOO
// ---------------------------------------------------------------------
function filterPdvCategory(cat) {
  state.activeCategory = cat;
  renderApp();
}

function handlePosSearchInput(term) {
  state.posSearchQuery = term;
  renderApp();
  setTimeout(() => {
    const inp = document.getElementById("pdv-barcode-input");
    if (inp) {
      inp.focus();
      inp.selectionStart = inp.selectionEnd = inp.value.length;
    }
  }, 10);
}

function addProductToActiveOrder(prodId) {
  const p = state.products.find(x => String(x.id) === String(prodId));
  if (!p) return;

  if (p.isWeighable && p.weighType === 0) {
    let weight = state.activeScaleWeight;
    if (weight <= 0) {
      const inputW = prompt(`Produto pesável (${p.name}). Informe o peso em KG (ou utilize balança acoplada):`, "1.000");
      weight = parseFloat(inputW) || 1.0;
    }
    addCartItem(p, weight, p.salePrice);
  } else {
    addCartItem(p, 1, p.salePrice);
  }
}

function addCartItem(prod, qty = 1, unitPrice = null) {
  playScannerBeep();
  const order = getActiveOrder();
  const priceToUse = unitPrice != null ? unitPrice : prod.salePrice;

  // Verifica se o item já existe no carrinho para incrementar quantidade
  const existingIdx = order.cart.findIndex(i => String(i.productId) === String(prod.id));
  if (existingIdx !== -1) {
    const it = order.cart[existingIdx];
    it.quantity += qty;

    // Regra Odoo Pricelists: Ativação automática de Preço Atacado por Volume
    if (prod.wholesaleMinQty > 0 && prod.wholesalePrice > 0 && it.quantity >= prod.wholesaleMinQty) {
      it.unitPrice = prod.wholesalePrice;
      it.isWholesale = true;
    }

    const base = it.quantity * it.unitPrice;
    const discAmt = base * ((it.discountPct || 0) / 100);
    it.total = Math.max(0, base - discAmt);
    order.selectedItemIdx = existingIdx;
  } else {
    let finalPrice = priceToUse;
    let isWs = false;
    if (prod.wholesaleMinQty > 0 && prod.wholesalePrice > 0 && qty >= prod.wholesaleMinQty) {
      finalPrice = prod.wholesalePrice;
      isWs = true;
    }

    const newItem = {
      productId: prod.id,
      sku: prod.sku,
      name: prod.name,
      unit: prod.unit || "UN",
      isWeighable: prod.isWeighable,
      quantity: qty,
      unitPrice: finalPrice,
      discountPct: 0,
      total: qty * finalPrice,
      isWholesale: isWs
    };

    order.cart.push(newItem);
    order.selectedItemIdx = order.cart.length - 1;
    state.lastScannedItem = newItem;
  }

  renderApp();
}

function triggerWeighingAction() {
  const simulated = (Math.random() * 2.5 + 0.3).toFixed(3);
  state.activeScaleWeight = parseFloat(simulated);
  renderApp();
}

function triggerDrawer() {
  alert("Comando de abertura da gaveta de numerário enviado para a impressora ESC/POS.");
}

function setupPdvShortcuts() {
  setTimeout(() => {
    const input = document.getElementById("pdv-barcode-input");
    if (input) input.focus();
  }, 100);

  window.onkeydown = (e) => {
    if (state.currentRoute !== "/pdv") return;
    if (e.key === "F2") { e.preventDefault(); navigate("/pdv"); }
    if (e.key === "F4") { e.preventDefault(); openCustomerIdentifyModal(); }
    if (e.key === "F5") { e.preventDefault(); triggerWeighingAction(); }
    if (e.key === "F6") { e.preventDefault(); triggerDrawer(); }
    if (e.key === "F7") { e.preventDefault(); cancelCurrentSale(); }
    if (e.key === "F12") { e.preventDefault(); openOdooPaymentModal(); }
  };
}

async function handlePdvInputKey(e) {
  if (e.key !== "Enter") return;
  const input = e.target;
  const val = input.value.trim();
  if (!val) return;

  input.value = "";
  state.posSearchQuery = "";
  await processBarcodePdv(val);
}

async function processBarcodePdv(code) {
  if (!state.products || state.products.length === 0) {
    state.products = await API.get("/api/products") || [];
  }

  // Tratamento de Etiqueta de Balança Padrão Supermercado (2 + 5 dígitos PLU + 5 dígitos valor + DV)
  if (code.length === 13 && code.startsWith("2")) {
    const pluCode = code.substring(1, 6);
    const valTotal = parseFloat(code.substring(6, 11)) / 100;

    let prod = state.products.find(p => p.pluCode === pluCode || p.sku === pluCode || String(parseInt(pluCode)) === p.sku);
    if (prod) {
      const unitP = prod.salePrice || 1.0;
      const qty = valTotal / unitP;
      addCartItem(prod, qty, unitP);
      return;
    }
  }

  // Busca padrão por EAN principal, EAN secundário (embalagem) ou SKU
  let prod = state.products.find(p =>
    p.barcode === code ||
    p.sku === code ||
    (p.secondaryBarcodes && p.secondaryBarcodes.includes(code))
  );

  if (!prod) {
    alert("Produto não encontrado para o código de barras ou SKU: " + code);
    return;
  }

  if (prod.isWeighable && prod.weighType === 0) {
    let weight = state.activeScaleWeight;
    if (weight <= 0) {
      const inputW = prompt(`Produto pesável (${prod.name}). Informe o peso em KG (ou utilize balança acoplada):`, "1.000");
      weight = parseFloat(inputW) || 1.0;
    }
    addCartItem(prod, weight, prod.salePrice);
  } else {
    addCartItem(prod, 1, prod.salePrice);
  }
}

// ---------------------------------------------------------------------
// TELA DE PAGAMENTO FRACIONADO ODOO (SPLIT PAYMENTS & MÚLTIPLAS FORMAS)
// ---------------------------------------------------------------------
function openOdooPaymentModal() {
  const order = getActiveOrder();
  const subtotal = order.cart.reduce((a, b) => a + (b.total || 0), 0);
  if (subtotal <= 0) {
    alert("Não há produtos no pedido atual para finalizar a venda.");
    return;
  }

  // Inicializa com uma linha de pagamento sugerida cobrindo o total
  state.paymentLines = [
    { method: "DINHEIRO", amount: subtotal }
  ];

  renderOdooPaymentModalView(subtotal);
}

function renderOdooPaymentModalView(totalOrder) {
  const order = getActiveOrder();
  const totalPaid = state.paymentLines.reduce((acc, p) => acc + (p.amount || 0), 0);
  const remaining = Math.max(0, totalOrder - totalPaid);
  const change = Math.max(0, totalPaid - totalOrder);

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">Pagamento da Venda (${order.name}) - Arquitetura Odoo POS</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <!-- Totais & Resumo da Venda -->
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:18px;">
            <div style="background:#030712; border:1px solid #334155; border-radius:8px; padding:12px; text-align:right;">
              <span style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Total do Pedido</span>
              <div style="font-size:22px; font-weight:800; color:#fff; font-family:'Consolas', monospace;">${fmtMoeda(totalOrder)}</div>
            </div>
            <div style="background:#030712; border:1px solid ${remaining > 0 ? '#ef4444' : '#22c55e'}; border-radius:8px; padding:12px; text-align:right;">
              <span style="font-size:11px; color:${remaining > 0 ? '#fca5a5' : '#86efac'}; text-transform:uppercase;">${remaining > 0 ? 'Falta Pagar' : 'Pago com Sucesso'}</span>
              <div style="font-size:22px; font-weight:800; color:${remaining > 0 ? '#ef4444' : '#22c55e'}; font-family:'Consolas', monospace;">${fmtMoeda(remaining)}</div>
            </div>
            <div style="background:#030712; border:1px solid #38bdf8; border-radius:8px; padding:12px; text-align:right;">
              <span style="font-size:11px; color:#7dd3fc; text-transform:uppercase;">Troco a Devolver</span>
              <div style="font-size:22px; font-weight:800; color:#38bdf8; font-family:'Consolas', monospace;">${fmtMoeda(change)}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <!-- Lado Esquerdo: Linhas de Pagamento Adicionadas -->
            <div style="background:#090e1a; border:1px solid var(--border); border-radius:8px; padding:14px;">
              <h4 style="font-size:13px; color:#38bdf8; text-transform:uppercase; margin-bottom:10px;">Pagamentos Lançados neste Pedido</h4>
              <div style="display:flex; flex-direction:column; gap:8px; min-height:120px;">
                ${state.paymentLines.map((p, idx) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; background:#141f36; padding:8px 12px; border-radius:6px;">
                    <div>
                      <strong>${p.method}</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <strong style="color:#22c55e; font-size:15px; font-family:'Consolas', monospace;">${fmtMoeda(p.amount)}</strong>
                      <button class="btn btn-danger btn-sm" onclick="removeSplitPaymentLine(${idx}, ${totalOrder})">✕</button>
                    </div>
                  </div>
                `).join("")}
              </div>

              ${order.customer ? `
                <div style="margin-top:14px; padding:10px; background:#111c34; border-radius:6px; font-size:12px; color:#cbd5e1;">
                  Vínculo: <strong>${order.customer.name}</strong> | Saldo Devedor: ${fmtMoeda(order.customer.currentDebt || 0)}
                </div>
              ` : ''}
            </div>

            <!-- Lado Direito: Adicionar Novo Pagamento & Cédulas Rápidas -->
            <div style="background:#090e1a; border:1px solid var(--border); border-radius:8px; padding:14px;">
              <h4 style="font-size:13px; color:#38bdf8; text-transform:uppercase; margin-bottom:10px;">Adicionar Pagamento</h4>

              <div class="form-group" style="margin-bottom:10px;">
                <label>Forma:</label>
                <select id="split-method-select" class="form-control">
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="PIX">PIX Dinâmico</option>
                  <option value="CARTAO_DEBITO">Cartão de Débito</option>
                  <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                  <option value="CREDIARIO">Crediário / Desconto em Folha</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom:10px;">
                <label>Valor (R$):</label>
                <input type="number" step="0.01" id="split-amount-input" class="form-control" value="${remaining > 0 ? remaining.toFixed(2) : totalOrder.toFixed(2)}" style="font-size:18px; font-weight:700;" />
              </div>

              <div class="fast-cash-buttons">
                <button class="cash-chip" onclick="setSplitInputAmount(${remaining})">Restante (${fmtMoeda(remaining)})</button>
                <button class="cash-chip" onclick="setSplitInputAmount(10)">+ R$ 10</button>
                <button class="cash-chip" onclick="setSplitInputAmount(20)">+ R$ 20</button>
                <button class="cash-chip" onclick="setSplitInputAmount(50)">+ R$ 50</button>
                <button class="cash-chip" onclick="setSplitInputAmount(100)">+ R$ 100</button>
                <button class="cash-chip" onclick="setSplitInputAmount(200)">+ R$ 200</button>
              </div>

              <button class="btn btn-secondary" style="width:100%; margin-top:12px;" onclick="addCurrentSplitPayment(${totalOrder})">+ Adicionar Linha de Pagamento</button>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Voltar ao Pedido (ESC)</button>
          <button type="button" class="btn btn-success btn-lg" ${remaining > 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="handleOdooCompleteSale(${totalOrder}, ${change})">
            Validar & Emitir Cupom (Enter)
          </button>
        </footer>
      </div>
    </div>
  `;
}

function setSplitInputAmount(val) {
  const inp = document.getElementById("split-amount-input");
  if (inp) inp.value = Number(val || 0).toFixed(2);
}

function addCurrentSplitPayment(totalOrder) {
  const method = document.getElementById("split-method-select")?.value || "DINHEIRO";
  const amt = parseFloat(document.getElementById("split-amount-input")?.value) || 0;
  if (amt <= 0) {
    alert("Informe um valor válido maior que zero.");
    return;
  }

  state.paymentLines.push({ method, amount: amt });
  renderOdooPaymentModalView(totalOrder);
}

function removeSplitPaymentLine(idx, totalOrder) {
  state.paymentLines.splice(idx, 1);
  renderOdooPaymentModalView(totalOrder);
}

async function handleOdooCompleteSale(totalOrder, change) {
  const order = getActiveOrder();

  const payload = {
    subtotal: totalOrder,
    discount: 0,
    addition: 0,
    total: totalOrder,
    change: change,
    operatorName: state.user.name,
    customerId: order.customer ? order.customer.id : null,
    customerName: order.customer ? order.customer.name : "Consumidor Final",
    items: order.cart.map(c => ({
      productId: c.productId,
      name: c.name,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      discount: c.discountPct || 0,
      totalPrice: c.total
    })),
    payments: state.paymentLines.map(p => ({
      method: p.method,
      amount: p.amount,
      cardFlag: "",
      installments: 1
    }))
  };

  try {
    const res = await API.post("/api/sales/complete", payload);
    closeModal();

    // Fecha a comanda finalizada e abre uma nova
    const idx = state.orders.findIndex(o => o.id === order.id);
    if (idx !== -1) {
      state.orders.splice(idx, 1);
    }
    if (state.orders.length === 0) {
      state.orders.push({ id: Date.now(), name: "Venda 1", cart: [], customer: null, selectedItemIdx: 0, discountGlobalPct: 0 });
    }
    state.activeOrderId = state.orders[0].id;
    state.lastScannedItem = null;
    renderApp();

    // Exibe cupom fiscal estilo Odoo POS com impressão direta
    showOdooThermalReceiptModal(res, payload, totalOrder, change);
  } catch (err) {
    alert("Erro ao validar venda no backend: " + err.message);
  }
}

// Modal de Entrada / Saída de Caixa (Cash In / Out Odoo POS)
function openCashInOutModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">Entrada / Saída de Caixa (Gaveta PDV)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
          <p style="color:#94a3b8; font-size:13px;">Selecione a operação de caixa que deseja realizar neste terminal:</p>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <button class="btn btn-secondary btn-lg" onclick="closeModal(); openSuprimentoModal();">
              + Suprimento (Aporte de Troco)
            </button>
            <button class="btn btn-danger btn-lg" onclick="closeModal(); openSangriaModal();">
              - Sangria (Retirada de Gaveta)
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Modal de Identificação do Cliente / Parceiro
async function openCustomerIdentifyModal() {
  const list = await API.get("/api/customers") || [];
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <div style="display:flex; align-items:center; gap:12px;"><strong class="modal-title">Identificar Cliente / Parceiro no Pedido (F4)</strong><button class="btn btn-primary btn-sm" onclick="openQuickCustomerModal()">+ Novo Cliente Rápido</button></div>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <p style="color:#94a3b8; font-size:13px; margin-bottom:12px;">Selecione o parceiro para emissão com CPF/CNPJ ou compras a prazo no crediário:</p>
          <div class="table-wrap" style="max-height:350px; overflow-y:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nome do Parceiro</th>
                  <th>CPF / CNPJ</th>
                  <th>Telefone</th>
                  <th class="text-right">Limite Total</th>
                  <th class="text-right">Saldo Devedor</th>
                  <th class="text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(c => `
                  <tr>
                    <td><strong>${c.name}</strong> ${c.isEmployee ? `<span class="badge badge-blue">Colaborador</span>` : ''}</td>
                    <td>${c.cpfCnpj || "-"}</td>
                    <td>${c.phone || c.cellPhone || "-"}</td>
                    <td class="text-right" style="color:#22c55e;">${fmtMoeda(c.creditLimit)}</td>
                    <td class="text-right" style="color:${(c.currentDebt || 0) > 0 ? '#ef4444' : '#94a3b8'}; font-weight:700;">${fmtMoeda(c.currentDebt)}</td>
                    <td class="text-center"><button class="btn btn-success btn-sm" onclick="setCustomerForActiveOrder('${c.id}', '${c.name.replace(/'/g, "")}', ${c.creditLimit || 0}, ${c.currentDebt || 0})">Vincular</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setCustomerForActiveOrder(id, name, limit, debt) {
  const order = getActiveOrder();
  order.customer = { id, name, creditLimit: limit, currentDebt: debt };
  closeModal();
  renderApp();
}

function removeCustomerFromOrder() {
  const order = getActiveOrder();
  order.customer = null;
  renderApp();
}


// =====================================================================
// MÓDULOS DE SUPORTE: CLIENTES, FINANCEIRO, ETIQUETAS, DASHBOARD & AJUDA
// =====================================================================
function renderCustomersModule() {
  setTimeout(() => loadCustomersList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Cadastro de Clientes & Crediário</h2>
          <small style="color:var(--text-muted);">Clientes de varejo, empresas e colaboradores integrados com limite a prazo</small>
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" id="cust-search" class="form-control" style="width:260px;" placeholder="Buscar cliente por nome ou CPF/CNPJ..." onkeyup="filterCustomersList(this.value)" />
          <button class="btn btn-success" onclick="openCustomerModal(null)">+ Novo Cliente</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome / Razão Social</th>
              <th>CPF / CNPJ</th>
              <th>Telefone</th>
              <th>Cidade / UF</th>
              <th class="text-right">Limite de Crédito</th>
              <th class="text-right">Saldo Devedor</th>
              <th class="text-center">Status</th>
              <th class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody id="customers-tbody">
            <tr><td colspan="8" class="text-center" style="padding:24px; color:#94a3b8;">Carregando clientes...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadCustomersList() {
  try {
    const list = await API.get("/api/customers");
    state.customers = list || [];
    renderCustomersTable(state.customers);
  } catch (e) {
    console.error("Erro ao carregar clientes:", e);
  }
}

function filterCustomersList(term) {
  const t = (term || "").toLowerCase().trim();
  if (!t) {
    renderCustomersTable(state.customers);
    return;
  }
  const filtered = state.customers.filter(c =>
    (c.name && c.name.toLowerCase().includes(t)) ||
    (c.cpfCnpj && c.cpfCnpj.includes(t)) ||
    (c.phone && c.phone.includes(t))
  );
  renderCustomersTable(filtered);
}

function renderCustomersTable(list) {
  const tbody = document.getElementById("customers-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:30px; color:#94a3b8;">Nenhum cliente cadastrado. Clique no botão "+ Novo Cliente".</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.cpfCnpj || "-"}</td>
      <td>${c.phone || c.cellPhone || "-"}</td>
      <td>${c.city || "-"} / ${c.state || "-"}</td>
      <td class="text-right" style="color:#22c55e;">${fmtMoeda(c.creditLimit)}</td>
      <td class="text-right" style="color:${(c.currentDebt || 0) > 0 ? '#ef4444' : '#94a3b8'}; font-weight:700;">${fmtMoeda(c.currentDebt)}</td>
      <td class="text-center">
        ${c.blocked ? `<span class="badge badge-red">Bloqueado</span>` : `<span class="badge badge-green">Ativo</span>`}
      </td>
      <td class="text-center">
        <button class="btn btn-outline btn-sm" onclick="openCustomerModal('${c.id}')">Editar</button>
        <button class="btn btn-secondary btn-sm" style="margin-left:4px;" onclick="navigate('/crediario')">Crediário</button>
      </td>
    </tr>
  `).join("");
}

function openCustomerModal(id) {
  const c = id ? state.customers.find(x => String(x.id) === String(id)) : {
    name: "",
    cpfCnpj: "",
    rgIe: "",
    phone: "",
    email: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "São Paulo",
    state: "SP",
    creditLimit: 1000.00,
    currentDebt: 0.00,
    blocked: false
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? "Editar Cliente" : "Novo Cadastro de Cliente"}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <form onsubmit="saveCustomerForm(event, '${id || ""}')">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group" style="grid-column: span 2;">
                <label>Nome Completo / Razão Social: *</label>
                <input type="text" id="cust-name" class="form-control" value="${c.name}" required />
              </div>
              <div class="form-group">
                <label>CPF ou CNPJ: *</label>
                <input type="text" id="cust-cpf" class="form-control" value="${c.cpfCnpj || ""}" required />
              </div>
              <div class="form-group">
                <label>RG ou Inscrição Estadual:</label>
                <input type="text" id="cust-rg" class="form-control" value="${c.rgIe || ""}" />
              </div>
              <div class="form-group">
                <label>Telefone / WhatsApp:</label>
                <input type="text" id="cust-phone" class="form-control" value="${c.phone || ""}" />
              </div>
              <div class="form-group" style="grid-column: span 2;">
                <label>E-mail:</label>
                <input type="email" id="cust-email" class="form-control" value="${c.email || ""}" />
              </div>
            </div>

            <div class="form-section-title" style="margin-top:16px;">Endereço & Localização</div>
            <div class="form-grid">
              <div class="form-group" style="grid-column: span 2;">
                <label>Rua / Logradouro:</label>
                <input type="text" id="cust-street" class="form-control" value="${c.street || ""}" />
              </div>
              <div class="form-group">
                <label>Número:</label>
                <input type="text" id="cust-number" class="form-control" value="${c.number || ""}" />
              </div>
              <div class="form-group">
                <label>Bairro:</label>
                <input type="text" id="cust-neighborhood" class="form-control" value="${c.neighborhood || ""}" />
              </div>
              <div class="form-group">
                <label>Cidade:</label>
                <input type="text" id="cust-city" class="form-control" value="${c.city || ""}" />
              </div>
              <div class="form-group">
                <label>UF:</label>
                <input type="text" id="cust-state" class="form-control" value="${c.state || "SP"}" maxlength="2" />
              </div>
            </div>

            <div class="form-section-title" style="margin-top:16px;">Limite de Crédito & Convênio da Loja</div>
            <div class="form-grid">
              <div class="form-group">
                <label>Limite de Crédito (R$):</label>
                <input type="number" step="0.01" id="cust-limit" class="form-control" value="${c.creditLimit || 0}" />
              </div>
              <div class="form-group">
                <label>Saldo Devedor Atual (R$):</label>
                <input type="number" step="0.01" class="form-control" value="${c.currentDebt || 0}" readonly />
              </div>
            </div>
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Salvar Cliente</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

async function saveCustomerForm(event, id) {
  event.preventDefault();
  const payload = {
    id: id || null,
    name: document.getElementById("cust-name").value.trim(),
    cpfCnpj: document.getElementById("cust-cpf").value.trim(),
    rgIe: document.getElementById("cust-rg").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    email: document.getElementById("cust-email").value.trim(),
    street: document.getElementById("cust-street").value.trim(),
    number: document.getElementById("cust-number").value.trim(),
    neighborhood: document.getElementById("cust-neighborhood").value.trim(),
    city: document.getElementById("cust-city").value.trim(),
    state: document.getElementById("cust-state").value.trim().toUpperCase(),
    creditLimit: parseFloat(document.getElementById("cust-limit").value) || 0,
    currentDebt: 0,
    blocked: false
  };

  try {
    if (id) {
      await API.put(`/api/customers/${id}`, payload);
    } else {
      await API.post("/api/customers", payload);
    }
    closeModal();
    await loadCustomersList();
    alert("Cliente salvo com sucesso!");
  } catch (e) {
    alert("Erro ao salvar cliente: " + e.message);
  }
}

// Dashboard / Retaguarda
function renderDashboardModule() {
  setTimeout(() => loadDashboardData(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Painel de Controle da Retaguarda</h2>
          <small style="color:var(--text-muted);">${state.company.name} - Monitoramento de Operações em Tempo Real</small>
        </div>
      </header>

      <div class="metrics-grid">
        <div class="metric-card success-card">
          <span>Vendas Hoje</span>
          <strong id="dash-sales-total" style="color:#22c55e;">R$ 0,00</strong>
          <small id="dash-sales-count">0 vendas realizadas</small>
        </div>
        <div class="metric-card accent-card">
          <span>Ticket Médio</span>
          <strong id="dash-ticket-avg" style="color:#38bdf8;">R$ 0,00</strong>
          <small>Média por cliente</small>
        </div>
        <div class="metric-card warning-card">
          <span>Estoque Baixo</span>
          <strong id="dash-low-stock" style="color:#fbbf24;">0 itens</strong>
          <small>Necessitam de reposição</small>
        </div>
        <div class="metric-card danger-card">
          <span>Crediário em Aberto</span>
          <strong id="dash-crediario" style="color:#f87171;">R$ 0,00</strong>
          <small>Total a receber</small>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
        <div style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:18px;">
          <h3 style="font-size:14px; color:#fff; font-weight:700; margin-bottom:12px;">Acessos Rápidos da Retaguarda</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/pdv')">Abrir Frente de Caixa PDV</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/produtos')">Cadastrar / Consultar Produtos</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/colaboradores')">Gerenciar Colaboradores & Vendedores</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/caixa')">Abertura / Fechamento de Caixa</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/movimentacoes-caixa')">Movimentações & Fluxo de Caixa</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/compras-nfe')">Importar Nota Fiscal XML NF-e</button>
          </div>
        </div>

        <div style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:18px;">
          <h3 style="font-size:14px; color:#fff; font-weight:700; margin-bottom:12px;">Informações do Sistema</h3>
          <div style="font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;">
            <div>Versão: <strong>2.0.0 Enterprise</strong></div>
            <div>Arquitetura: <strong>C# .NET 9 + SQLite WAL + Web Engine</strong></div>
            <div>Terminal: <strong>Matriz / Estação Principal 01</strong></div>
            <div>Balança Homologada: <strong>Toledo MGV5/MGV6 & Filizola Smart</strong></div>
            <div>Impressora Homologada: <strong>ESC/POS Térmica 80mm & Zebra EPL/ZPL</strong></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadDashboardData() {
  try {
    const data = await API.get("/api/dashboard");
    if (data) {
      document.getElementById("dash-sales-total").innerText = fmtMoeda(data.todaySalesTotal || 0);
      document.getElementById("dash-sales-count").innerText = `${data.todaySalesCount || 0} cupons emitidos`;
      document.getElementById("dash-ticket-avg").innerText = fmtMoeda(data.averageTicket || 0);
      document.getElementById("dash-low-stock").innerText = `${data.lowStockCount || 0} produtos`;
      document.getElementById("dash-crediario").innerText = fmtMoeda(data.totalCrediarioOpen || 0);
    }
  } catch (e) {
    console.debug("Dashboard load error:", e);
  }
}

// Módulo Financeiro Contas a Pagar / Receber
function renderFinancialModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Financeiro - Contas a Pagar & Receber</h2>
          <small style="color:var(--text-muted);">Controle de duplicatas, títulos a liquidar e fluxo de tesouraria</small>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Tipo</th>
              <th>Documento / Título</th>
              <th>Fornecedor / Cliente</th>
              <th class="text-right">Valor</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>10/11/2026</td>
              <td><span class="badge badge-red">A Pagar</span></td>
              <td>NF 12948 - Ambev Distribuidora</td>
              <td>Ambev Brasil Bebidas</td>
              <td class="text-right" style="color:#ef4444; font-weight:700;">R$ 4.820,00</td>
              <td class="text-center"><span class="badge badge-amber">Pendente</span></td>
            </tr>
            <tr>
              <td>15/11/2026</td>
              <td><span class="badge badge-green">A Receber</span></td>
              <td>Carnê Crediário 042/3</td>
              <td>Marcos Oliveira Ramos</td>
              <td class="text-right" style="color:#22c55e; font-weight:700;">R$ 350,00</td>
              <td class="text-center"><span class="badge badge-blue">Aberto</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Módulo de Crediário & Carnês
function renderCrediarioModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Extrato de Crediário & Convênio de Colaboradores</h2>
          <small style="color:var(--text-muted);">Compras a prazo, contas correntes de funcionários e liquidação de parcelas</small>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cliente / Colaborador</th>
              <th>CPF</th>
              <th>Tipo Vínculo</th>
              <th class="text-right">Limite Total</th>
              <th class="text-right">Saldo Devedor</th>
              <th class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${state.collaborators.filter(c => c.isCustomer).map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.cpf || "-"}</td>
                <td><span class="badge badge-blue">Colaborador da Loja</span></td>
                <td class="text-right" style="color:#22c55e;">${fmtMoeda(c.creditLimit)}</td>
                <td class="text-right" style="color:${c.currentDebt > 0 ? '#ef4444' : '#94a3b8'}; font-weight:700;">${fmtMoeda(c.currentDebt)}</td>
                <td class="text-center"><button class="btn btn-outline btn-sm" onclick="alert('Histórico de compras do colaborador: ${c.name}')">Ver Extrato</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Módulo de Importação XML NF-e
function renderNfeImportModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Entrada de Mercadorias via XML NF-e</h2>
          <small style="color:var(--text-muted);">Leitura automatizada do arquivo XML do fornecedor para atualização de estoque e cadastro de produtos</small>
        </div>
      </header>
      <div style="background:#0f172a; border:2px dashed var(--border-light); border-radius:10px; padding:40px; text-align:center;">
        <p style="color:#cbd5e1; font-size:15px; margin-bottom:12px;">Selecione ou arraste o arquivo XML da NF-e emitida pelo fornecedor:</p>
        <input type="file" id="nfe-file" accept=".xml" class="form-control" style="max-width:380px; margin:0 auto;" />
        <button class="btn btn-success btn-lg" style="margin-top:16px;" onclick="alert('Módulo de parse XML pronto para processamento.')">Processar XML da NF-e</button>
      </div>
    </div>
  `;
}

// Módulo de Etiquetas
function renderLabelsModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Impressão de Etiquetas de Gôndola & Balança</h2>
          <small style="color:var(--text-muted);">Gere etiquetas de preços para gôndolas e arquivos de carga para balanças Toledo e Filizola</small>
        </div>
      </header>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:15px; color:#fff; font-weight:700; margin-bottom:14px;">Modelo de Etiqueta de Gôndola</h3>
          <div class="label-preview-box">
            <div style="font-size:12px; font-weight:700; color:#475569;">SUPERMERCADO MODELO</div>
            <div style="font-size:14px; font-weight:800; color:#000;">ARROZ BRANCO TIPO 1 CAMIL 5KG</div>
            <div style="font-size:28px; font-weight:900; color:#000; text-align:right;">R$ 29,90</div>
            <div class="label-barcode-vis">*7896006700018*</div>
          </div>
          <button class="btn btn-success" style="width:100%; margin-top:16px;" onclick="window.print()">Imprimir Etiquetas Selecionadas</button>
        </div>

        <div style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:15px; color:#fff; font-weight:700; margin-bottom:14px;">Exportação de Carga para Balanças</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <button class="btn btn-outline" onclick="downloadToledoCarga()">Gerar Carga MGV Toledo (CADTXT.TXT / ITENSTXT.TXT)</button>
            <button class="btn btn-outline" onclick="downloadFilizolaCarga()">Gerar Carga Filizola Smart (CADASTRO.TXT)</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function downloadToledoCarga() {
  let content = "010010000000000299000000Alcatra Bovina kg\n010020000000000149000000Mussarela Fatiada kg\n";
  downloadTextFile("CADTXT.TXT", content);
}

function downloadFilizolaCarga() {
  let content = "000001P000299000Alcatra Bovina\n000002P000149000Mussarela Fatiada\n";
  downloadTextFile("CADASTRO.TXT", content);
}

function downloadTextFile(filename, text) {
  const el = document.createElement("a");
  el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  el.setAttribute("download", filename);
  el.style.display = "none";
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

// Relatório Curva ABC
function renderAbcReportModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Relatório Curva ABC de Produtos por Faturamento</h2>
          <small style="color:var(--text-muted);">Classificação de importância: Classe A (80% receita), B (15%) e C (5%)</small>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Classe</th>
              <th>SKU</th>
              <th>Produto</th>
              <th class="text-right">Qtd Vendida</th>
              <th class="text-right">Faturamento</th>
              <th class="text-center">% Acumulado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="badge badge-green">Classe A</span></td>
              <td>1001</td>
              <td>Arroz Tipo 1 Camil 5kg</td>
              <td class="text-right">240 UN</td>
              <td class="text-right" style="color:#22c55e; font-weight:700;">R$ 7.176,00</td>
              <td class="text-center">32,5%</td>
            </tr>
            <tr>
              <td><span class="badge badge-green">Classe A</span></td>
              <td>1002</td>
              <td>Óleo de Soja Liza 900ml</td>
              <td class="text-right">450 UN</td>
              <td class="text-right" style="color:#22c55e; font-weight:700;">R$ 3.825,00</td>
              <td class="text-center">54,2%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Configurações & Segmento
function renderSettingsModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Configurações Gerais & Parâmetros da Aplicação</h2>
          <small style="color:var(--text-muted);">Identificação da empresa, equipamentos homologados e segmento de varejo</small>
        </div>
      </header>

      <form onsubmit="handleSaveCompany(event)">
        <div class="form-grid">
          <div class="form-group" style="grid-column: span 2;">
            <label>Razão Social:</label>
            <input type="text" id="cfg-name" class="form-control" value="${state.company.name}" required />
          </div>
          <div class="form-group">
            <label>Nome Fantasia:</label>
            <input type="text" id="cfg-tradename" class="form-control" value="${state.company.tradeName || state.company.name}" />
          </div>
          <div class="form-group">
            <label>CNPJ:</label>
            <input type="text" id="cfg-cnpj" class="form-control" value="${state.company.cnpj || "12.345.678/0001-90"}" required />
          </div>
          <div class="form-group">
            <label>Segmento do Comércio:</label>
            <select id="cfg-segment" class="form-control">
              <option value="Supermercado e Mercearia">Supermercado e Mercearia</option>
              <option value="Loja de Roupas e Calçados (Vestuário)">Loja de Roupas e Calçados (Vestuário)</option>
              <option value="Açougue e Frigorífico">Açougue e Frigorífico</option>
              <option value="Padaria e Panificadora">Padaria e Panificadora</option>
              <option value="Loja de Conveniência e Bebidas">Loja de Conveniência e Bebidas</option>
              <option value="Varejo em Geral">Varejo em Geral</option>
            </select>
          </div>
        </div>

        <div style="margin-top:20px;">
          <button type="submit" class="btn btn-success">Salvar Configurações</button>
        </div>
      </form>
    </div>
  `;
}

async function handleSaveCompany(e) {
  e.preventDefault();
  const name = document.getElementById("cfg-name").value.trim();
  const trade = document.getElementById("cfg-tradename").value.trim();
  const cnpj = document.getElementById("cfg-cnpj").value.trim();
  const seg = document.getElementById("cfg-segment").value;

  try {
    await API.post("/api/company", {
      name,
      tradeName: trade,
      cnpj,
      segment: seg
    });
    state.company.name = name;
    state.company.tradeName = trade;
    alert("Dados da empresa salvos com sucesso!");
    renderApp();
  } catch (err) {
    alert("Erro ao salvar dados: " + err.message);
  }
}

// Fornecedores
function renderSuppliersModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Cadastro de Fornecedores & Fabricantes</h2>
          <small style="color:var(--text-muted);">Indústrias, atacadistas e distribuidores parceiros</small>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Razão Social</th>
              <th>CNPJ</th>
              <th>Telefone</th>
              <th>Contato Comercial</th>
              <th>Cidade / UF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Camil Alimentos S.A.</strong></td>
              <td>64.904.295/0001-03</td>
              <td>(11) 4004-9000</td>
              <td>Roberto Carlos - Vendas SP</td>
              <td>Itaquaquecetuba / SP</td>
            </tr>
            <tr>
              <td><strong>Bunge Alimentos S.A.</strong></td>
              <td>84.046.101/0001-93</td>
              <td>(11) 3741-6000</td>
              <td>Ana Clara - Representante</td>
              <td>Gaspar / SC</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Modais Genéricos
function closeModal() {
  const m = document.getElementById("modal-container");
  if (m) m.innerHTML = "";
}

function openLogoutModal() {
  if (confirm("Deseja realmente encerrar a sessão de trabalho atual?")) {
    window.location.reload();
  }
}

function openAboutModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">Sobre o Sistema PDV Gama Enterprise</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body" style="font-size:13px; line-height:1.6; color:#cbd5e1;">
          <p><strong>PDV Gama & GDM Retail ERP - Edição Supermercados e Varejo 2.0.0</strong></p>
          <p style="margin-top:8px;">Plataforma completa de automação comercial e gestão de ponto de venda, com retaguarda completa de compras, estoque mercadológico, balanças (Toledo e Filizola), leitor de código de barras, controle de caixa independente, gestão de colaboradores unificada com clientes da loja e frente de caixa ágil.</p>
          <p style="margin-top:8px;">Desenvolvido com arquitetura moderna C# .NET 9 de alto desempenho e SQLite com WAL.</p>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Fechar</button>
        </footer>
      </div>
    </div>
  `;
}

function openShortcutsModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">Guia de Teclas de Atalho do PDV</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tecla</th>
                  <th>Função no Sistema</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>F2</strong></td><td>Abrir Tela de Vendas (PDV)</td></tr>
                <tr><td><strong>F3</strong></td><td>Consultar Catálogo de Produtos</td></tr>
                <tr><td><strong>F4</strong></td><td>Identificar Cliente / Convênio no Cupom</td></tr>
                <tr><td><strong>F5</strong></td><td>Capturar Peso da Balança Toledo/Filizola</td></tr>
                <tr><td><strong>F6</strong></td><td>Acionar Abertura da Gaveta de Dinheiro</td></tr>
                <tr><td><strong>F7</strong></td><td>Cancelar Cupom / Venda em Andamento</td></tr>
                <tr><td><strong>F12</strong></td><td>Finalizar Venda (Pagamento)</td></tr>
                <tr><td><strong>Ctrl+P</strong></td><td>Ir para Cadastro de Produtos</td></tr>
                <tr><td><strong>Ctrl+C</strong></td><td>Ir para Cadastro de Clientes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Fechar</button>
        </footer>
      </div>
    </div>
  `;
}

// Iniciar Aplicação
window.addEventListener("DOMContentLoaded", init);


// =====================================================================
// MODAL DE CUPOM FISCAL TÉRMICO ESC/POS (80MM) - PADRÃO ODOO POS
// =====================================================================
function showOdooThermalReceiptModal(saleResult, saleData, totalOrder, change) {
  const comp = state.company || {};
  const saleNum = saleResult.number || "0001";
  const nowStr = new Date().toLocaleString("pt-BR");

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:440px;">
        <header class="modal-header">
          <strong class="modal-title">Cupom Fiscal Emitido - Venda Nº ${saleNum}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body thermal-receipt-container">
          <div id="thermal-receipt-print-area" class="thermal-receipt">
            <div class="receipt-center receipt-title">${comp.tradeName || comp.name || "SUPERMERCADO MODELO"}</div>
            <div class="receipt-center" style="font-size:10px;">${comp.name || "SUPERMERCADO MODELO LTDA"}</div>
            <div class="receipt-center" style="font-size:10px;">CNPJ: ${comp.cnpj || "12.345.678/0001-90"} - IE: ${comp.stateRegistration || "123.456.789"}</div>
            <div class="receipt-center" style="font-size:10px;">${comp.address || "Rua Principal, 100 - Centro"}</div>
            <div class="receipt-divider"></div>

            <div class="receipt-center receipt-bold" style="font-size:11px;">EXTRATO Nº ${String(saleNum).padStart(6, "0")}</div>
            <div class="receipt-center receipt-bold" style="font-size:11px;">CUPOM FISCAL ELETRÔNICO - NFC-e</div>
            <div class="receipt-divider"></div>

            <div style="font-size:10px; display:flex; justify-content:space-between;">
              <span>DATA: ${nowStr}</span>
              <span>TERM: 01</span>
            </div>
            <div style="font-size:10px;">OPERADOR: ${saleData.operatorName || state.user.name}</div>
            <div style="font-size:10px;">CLIENTE: ${saleData.customerName || "CONSUMIDOR NÃO IDENTIFICADO"}</div>
            ${saleData.customerCpf ? `<div style="font-size:10px;">CPF/CNPJ: ${saleData.customerCpf}</div>` : ''}
            <div class="receipt-divider"></div>

            <table>
              <thead>
                <tr>
                  <th style="width:20px;">#</th>
                  <th>DESCRIÇÃO</th>
                  <th style="text-align:right;">QTD x UNIT</th>
                  <th style="text-align:right;">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${(saleData.items || []).map((it, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${it.name || ("PROD #" + it.productId)}</td>
                    <td style="text-align:right;">${fmtNum(it.quantity, 2)} x ${fmtNum(it.unitPrice, 2)}</td>
                    <td style="text-align:right;" class="receipt-bold">${fmtNum(it.totalPrice || (it.quantity * it.unitPrice), 2)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>

            <div class="receipt-divider"></div>

            <div class="receipt-totals">
              <div class="total-row">
                <span>QTD. TOTAL DE ITENS</span>
                <span>${(saleData.items || []).length}</span>
              </div>
              <div class="total-row">
                <span>SUBTOTAL</span>
                <span>${fmtMoeda(saleData.subtotal || totalOrder)}</span>
              </div>
              ${saleData.discount > 0 ? `
                <div class="total-row" style="color:#b91c1c;">
                  <span>DESCONTO TOTAL</span>
                  <span>- ${fmtMoeda(saleData.discount)}</span>
                </div>
              ` : ''}
              <div class="total-row grand-total">
                <span>TOTAL A PAGAR</span>
                <span>${fmtMoeda(totalOrder)}</span>
              </div>

              <div style="font-weight:700; margin-top:4px;">FORMAS DE PAGAMENTO:</div>
              ${(saleData.payments || []).map(p => `
                <div class="total-row">
                  <span>${p.method}</span>
                  <span>${fmtMoeda(p.amount)}</span>
                </div>
              `).join("")}

              ${change > 0 ? `
                <div class="total-row" style="font-weight:700; margin-top:2px;">
                  <span>TROCO</span>
                  <span>${fmtMoeda(change)}</span>
                </div>
              ` : ''}
            </div>

            <div class="receipt-divider"></div>
            <div class="receipt-center" style="font-size:9px; color:#475569;">
              Tributos Totais Incidentes (Lei 12.741/2012): Aprox. ${fmtMoeda(totalOrder * 0.18)} (18%)
            </div>

            <div class="receipt-qr">
              <div style="font-weight:700; font-size:11px;">[ QR-CODE NFC-e ]</div>
              <div style="font-size:8px; margin-top:4px;">Consulte pela Chave de Acesso no portal da SEFAZ</div>
            </div>

            <div class="receipt-center" style="font-size:9px;">
              Protocolo de Autorização: 135240982348712
            </div>
            <div class="receipt-center receipt-bold" style="font-size:10px; margin-top:6px;">
              OBRIGADO PELA PREFERÊNCIA!
            </div>
          </div>
        </div>

        <footer class="modal-footer" style="justify-content:space-between;">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar</button>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary" onclick="window.print()">Imprimir Cupom Térmico (ESC/POS)</button>
            <button type="button" class="btn btn-success" onclick="closeModal()">+ Nova Venda (F2)</button>
          </div>
        </footer>
      </div>
    </div>
  `;
}

// Modal de Cadastro Rápido de Cliente direto no PDV
function openQuickCustomerModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">+ Cadastro Rápido de Cliente / Parceiro</strong>
          <button class="btn btn-outline btn-sm" onclick="openCustomerIdentifyModal()">✕</button>
        </header>
        <div class="modal-body">
          <form id="quick-customer-form" onsubmit="handleQuickCustomerSubmit(event)" style="display:flex; flex-direction:column; gap:12px;">
            <div class="form-group">
              <label>Nome Completo / Razão Social: *</label>
              <input type="text" id="qc-name" class="form-control" required placeholder="Ex: Maria da Silva" autofocus />
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label>CPF ou CNPJ:</label>
                <input type="text" id="qc-cpf" class="form-control" placeholder="000.000.000-00" />
              </div>
              <div class="form-group">
                <label>Telefone / WhatsApp:</label>
                <input type="text" id="qc-phone" class="form-control" placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label>Limite de Crédito (R$):</label>
                <input type="number" step="0.01" id="qc-limit" class="form-control" value="500.00" />
              </div>
              <div class="form-group">
                <label>Bloqueado para Crediário?</label>
                <select id="qc-blocked" class="form-control">
                  <option value="false">Não (Crédito Liberado)</option>
                  <option value="true">Sim (Apenas à vista)</option>
                </select>
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
              <button type="button" class="btn btn-outline" onclick="openCustomerIdentifyModal()">Voltar</button>
              <button type="submit" class="btn btn-success">+ Salvar e Vincular à Venda</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

async function handleQuickCustomerSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("qc-name")?.value.trim();
  const cpf = document.getElementById("qc-cpf")?.value.trim();
  const phone = document.getElementById("qc-phone")?.value.trim();
  const limit = parseFloat(document.getElementById("qc-limit")?.value) || 0;
  const blocked = document.getElementById("qc-blocked")?.value === "true";

  if (!name) {
    alert("Informe o nome do cliente.");
    return;
  }

  const payload = {
    name,
    cpfCnpj: cpf,
    phone,
    creditLimit: limit,
    isBlocked: blocked,
    isEmployee: false,
    address: "Cadastro Balcão PDV"
  };

  try {
    const created = await API.post("/api/customers", payload);
    const order = getActiveOrder();
    order.customer = {
      id: created.id || created.Id,
      name: name,
      creditLimit: limit,
      currentDebt: 0
    };
    closeModal();
    renderApp();
    alert(`Cliente "${name}" cadastrado e vinculado com sucesso!`);
  } catch (err) {
    alert("Erro ao cadastrar cliente: " + err.message);
  }
}

// =====================================================================
// MÓDULO 6: GERENCIADOR DE VENDAS & HISTÓRICO DE TICKETS (ESTILO ODOO POS.ORDER)
// =====================================================================
let salesCache = [];

function renderSalesManagerModule() {
  setTimeout(() => loadSalesList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Gerenciador de Vendas & Histórico de Cupons</h2>
          <small style="color:var(--text-muted);">Histórico de pedidos Odoo POS, conferência de vendas, reimpressão de cupom térmico e cancelamento</small>
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" id="sales-search" class="form-control" style="width:280px;" placeholder="Buscar por número, cliente ou operador..." onkeyup="filterSalesList(this.value)" />
          <button class="btn btn-secondary" onclick="loadSalesList()">Atualizar Lista</button>
          <button class="btn btn-primary" onclick="navigate('/pdv')">Ir para Frente de Caixa (F2)</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cupom / Nº</th>
              <th>Data / Horário</th>
              <th>Operador</th>
              <th>Cliente / Parceiro</th>
              <th>Formas de Pagamento</th>
              <th class="text-right">Subtotal</th>
              <th class="text-right">Total</th>
              <th class="text-center">Status</th>
              <th class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody id="sales-tbody">
            <tr><td colspan="9" class="text-center" style="padding:40px; color:#64748b;">Carregando histórico de vendas...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadSalesList() {
  try {
    const list = await API.get("/api/sales") || [];
    salesCache = list;
    renderSalesTableRows(list);
  } catch (err) {
    console.error("Erro ao carregar vendas:", err);
    const tbody = document.getElementById("sales-tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:#ef4444; padding:30px;">Falha ao carregar vendas do servidor.</td></tr>`;
  }
}

function renderSalesTableRows(list) {
  const tbody = document.getElementById("sales-tbody");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:40px; color:#64748b;">Nenhuma venda realizada até o momento.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const isCancelled = s.status === "Cancelada" || s.status === "Cancelled";
    return `
      <tr style="${isCancelled ? 'opacity:0.6; background:rgba(239,68,68,0.05);' : ''}">
        <td><strong style="color:#38bdf8;">#${String(s.number).padStart(6, "0")}</strong></td>
        <td>${fmtDataHora(s.completedAt)}</td>
        <td>${s.operatorName || "Caixa"}</td>
        <td>
          <strong>${s.customerName || "Consumidor Final"}</strong>
          ${s.customerCpf ? `<br><small style="color:#64748b;">CPF: ${s.customerCpf}</small>` : ''}
        </td>
        <td><small>${s.paymentSummary || "DINHEIRO"}</small></td>
        <td class="text-right">${fmtMoeda(s.subtotal)}</td>
        <td class="text-right"><strong style="color:${isCancelled ? '#ef4444' : '#22c55e'}; font-size:14px;">${fmtMoeda(s.total)}</strong></td>
        <td class="text-center">
          <span class="badge ${isCancelled ? 'badge-red' : 'badge-green'}">${s.status || "Concluída"}</span>
        </td>
        <td class="text-center" style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="viewSaleReceipt(${s.number})" title="Visualizar e reimprimir cupom fiscal">Cupom (ESC/POS)</button>
          ${!isCancelled ? `<button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="openCancelSaleModal(${s.number})">Cancelar</button>` : ''}
        </td>
      </tr>
    `;
  }).join("");
}

function filterSalesList(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) {
    renderSalesTableRows(salesCache);
    return;
  }
  const filtered = salesCache.filter(s =>
    String(s.number).includes(q) ||
    (s.customerName && s.customerName.toLowerCase().includes(q)) ||
    (s.customerCpf && s.customerCpf.includes(q)) ||
    (s.operatorName && s.operatorName.toLowerCase().includes(q)) ||
    (s.paymentSummary && s.paymentSummary.toLowerCase().includes(q))
  );
  renderSalesTableRows(filtered);
}

async function viewSaleReceipt(saleNumber) {
  try {
    const sale = await API.get(`/api/sales/${saleNumber}`);
    if (!sale) {
      alert("Venda não encontrada.");
      return;
    }

    const payload = {
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      operatorName: sale.operatorName,
      customerName: sale.customerName,
      customerCpf: sale.customerCpf,
      items: (sale.items || []).map(i => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice
      })),
      payments: (sale.payments || []).map(p => ({
        method: p.method,
        amount: p.amount
      }))
    };

    if (payload.payments.length === 0 && sale.paymentSummary) {
      payload.payments = [{ method: sale.paymentSummary, amount: sale.total }];
    }

    showOdooThermalReceiptModal({ number: sale.number }, payload, sale.total, 0);
  } catch (err) {
    alert("Erro ao carregar detalhes da venda: " + err.message);
  }
}

function openCancelSaleModal(saleNumber) {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title" style="color:#ef4444;">Cancelar Venda Nº #${saleNumber}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <p style="color:#94a3b8; font-size:13px; margin-bottom:12px;">O cancelamento irá estornar a movimentação de caixa e devolver os produtos ao estoque.</p>
          <div class="form-group" style="margin-bottom:12px;">
            <label>Motivo do Cancelamento: *</label>
            <input type="text" id="cancel-reason" class="form-control" placeholder="Ex: Desistência do cliente / erro de digitação" required />
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label>Senha de Supervisor: *</label>
            <input type="password" id="cancel-supervisor-pwd" class="form-control" placeholder="Digite a senha de supervisor..." required />
          </div>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Voltar</button>
          <button type="button" class="btn btn-danger" onclick="handleCancelSaleSubmit(${saleNumber})">Confirmar Cancelamento</button>
        </footer>
      </div>
    </div>
  `;
}

async function handleCancelSaleSubmit(saleNumber) {
  const reason = document.getElementById("cancel-reason")?.value.trim();
  const pwd = document.getElementById("cancel-supervisor-pwd")?.value;

  if (!reason) {
    alert("Informe o motivo do cancelamento.");
    return;
  }

  try {
    await API.post(`/api/sales/${saleNumber}/cancel`, { reason, supervisorPassword: pwd });
    closeModal();
    alert(`Venda Nº #${saleNumber} cancelada com sucesso!`);
    loadSalesList();
  } catch (err) {
    alert("Erro ao cancelar venda: " + err.message);
  }
}
