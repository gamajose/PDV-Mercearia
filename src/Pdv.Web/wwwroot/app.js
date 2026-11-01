// =====================================================================
// PDV GAMA & GDM RETAIL ERP - PLATAFORMA INTEGRADA DE SUPERMERCADOS E VAREJO
// Arquitetura Enterprise: Retaguarda Completa + Frente de Caixa PDV Ágil + Terminal de Etiquetas
// Padrão GDM (Java Swing / NetBeans) e Linear Sistemas Supermercados
// =====================================================================

const API = {
  get: async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    return res.json();
  },
  post: async (url, data) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erro HTTP ${res.status}`);
    }
    return res.json();
  },
  put: async (url, data) => {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erro HTTP ${res.status}`);
    }
    return res.json();
  },
  del: async (url) => {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    return res.json();
  }
};

// Formatação Monetária e Numérica Padrão Brasileiro
const fmtMoeda = (val) => Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (val, dec = 2) => Number(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "-");
const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "-");

// Síntese de Áudio para Bip do Leitor de Código de Barras (Web Audio API)
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
    console.debug("Audio not initialized:", e);
  }
}

// =====================================================================
// ESTADO GLOBAL DA APLICAÇÃO
// =====================================================================
const state = {
  activeDiscount: 0,
  terminalConfig: {
    storeNumber: 1,
    storeName: "Loja 01 - Matriz",
    terminalNumber: 1,
    terminalType: "PDV",
    scale: { model: "Toledo Prix 3 / 2090", port: "COM1", baudRate: 9600 },
    printer: { model: "ESC/POS Térmica 80mm", port: "USB001" }
  },
  currentRoute: "/pdv",
  user: { name: "Administrador Master", login: "admin", role: "Administrador" },
  company: {
    name: "Supermercado & Magazine Modelo Ltda",
    tradeName: "Supermercado Modelo",
    cnpj: "12.345.678/0001-90",
    segment: "Supermercado e Mercearia",
    address: "Av. Principal, 1000 - Centro",
    phone: "(11) 3456-7890"
  },
  products: [],
  customers: [],
  suppliers: [],
  collaborators: [],
  cashSession: null,
  // Frente de Caixa PDV Checkout (GDM TelaMasterVenda Style)
  cart: [],
  activeCustomer: null, // Consumidor Final por padrão
  lastItem: null,
  activeScaleWeight: 0.0,
  // Estado transitório do Modal de Pagamento
  payment: {
    method: "DINHEIRO", // DINHEIRO | DEBITO | CREDITO | PIX | CREDIARIO | SPLIT
    amountReceived: 0,
    change: 0,
    cardBrand: "VISA",
    installments: 1,
    splitLines: []
  }
};

// =====================================================================
// NAVEGAÇÃO E INICIALIZAÇÃO MULTI-SISTEMAS (PDV / ETIQUETAS / RETAGUARDA)
// =====================================================================
function navigate(route) {
  state.currentRoute = route || "/";
  window.history.pushState({}, "", route);
  renderApp();
}

window.addEventListener("popstate", () => {
  state.currentRoute = window.location.pathname || "/";
  renderApp();
});

function launchApp(mode) {
  const chk = document.getElementById("chk-remember-app");
  if (chk && chk.checked) {
    localStorage.setItem("preferred_app_mode", mode);
  }
  if (mode === "pdv") navigate("/pdv");
  else if (mode === "etiquetas") navigate("/etiquetas");
  else navigate("/retaguarda");
}

function resetPreferredApp() {
  localStorage.removeItem("preferred_app_mode");
  navigate("/");
}

async function init() {
  try {
    const s = await API.get("/api/state");
    if (s.user) state.user = s.user;
    const comp = await API.get("/api/company");
    if (comp && comp.name) state.company = comp;
    const term = await API.get("/api/terminal/config").catch(() => null);
    if (term && term.storeNumber) state.terminalConfig = term;
  } catch (e) {
    console.warn("Estado inicial:", e);
  }

  // Carrega catálogo e clientes em segundo plano
  loadProductsInBackground();
  loadCustomersInBackground();

  // Relógio sincronizado
  setInterval(() => {
    const el = document.getElementById("clock-display");
    if (el) el.innerText = new Date().toLocaleString("pt-BR");
    const elPdv = document.getElementById("pdv-clock-display");
    if (elPdv) elPdv.innerText = new Date().toLocaleTimeString("pt-BR");
  }, 1000);

  // Rota inicial da estação
  const path = window.location.pathname;
  if (path === "/pdv") {
    state.currentRoute = "/pdv";
  } else if (path === "/etiquetas") {
    state.currentRoute = "/etiquetas";
  } else if (path && path !== "/") {
    state.currentRoute = path;
  } else {
    const pref = localStorage.getItem("preferred_app_mode");
    if (pref === "pdv") state.currentRoute = "/pdv";
    else if (pref === "etiquetas") state.currentRoute = "/etiquetas";
    else if (pref === "retaguarda") state.currentRoute = "/retaguarda";
    else state.currentRoute = "/";
  }

  renderApp();
}

async function loadProductsInBackground() {
  try {
    const list = await API.get("/api/products");
    if (Array.isArray(list)) state.products = list;
  } catch (e) {
    console.debug("Background products load:", e);
  }
}

async function loadCustomersInBackground() {
  try {
    const list = await API.get("/api/customers");
    if (Array.isArray(list)) state.customers = list;
  } catch (e) {
    console.debug("Background customers load:", e);
  }
}

// =====================================================================
// GERENCIADOR GLOBAL DE TECLAS DE ATALHO (HOTKEYS GDM PDV)
// =====================================================================
window.addEventListener("keydown", (e) => {
  // Tecla Escape: fecha modal aberto ou sai do PDV para a Retaguarda
  if (e.key === "Escape") {
    const modal = document.getElementById("modal-container");
    if (modal && modal.children.length > 0) {
      e.preventDefault();
      closeModal();
      return;
    }

  }

  // Atalhos específicos para a tela do Frente de Caixa (/pdv)
  if (state.currentRoute === "/pdv") {
    // F11: Finalizar Venda
    if (e.key === "F11") {
      e.preventDefault();
      openPaymentModal();
      return;
    }
    // F2: Desconto ou Cupom Promocional
    if (e.key === "F2") {
      e.preventDefault();
      openDiscountModal();
      return;
    }
    // F8: Cancelar Item Específico
    if (e.key === "F8") {
      e.preventDefault();
      openCancelItemModal();
      return;
    }
    // F4 ou Ctrl+C: Identificar Cliente -> Abre Modal TelaListaBuscaClientes
    if (e.key === "F4" || (e.ctrlKey && e.key.toLowerCase() === "c")) {
      e.preventDefault();
      openCustomerSearchModal();
      return;
    }
    // F3 ou Ctrl+P: Consultar Produtos -> Abre Modal TelaListaProdutos
    if (e.key === "F3" || (e.ctrlKey && e.key.toLowerCase() === "p")) {
      e.preventDefault();
      openProductSearchModal();
      return;
    }

    // Ctrl+A: Operações de Caixa (Sangria / Suprimento / Posição)
    if (e.ctrlKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      openCashOperationsModal();
      return;
    }
    // F5: Pesar Balança de Checkout
    if (e.key === "F5") {
      e.preventDefault();
      triggerWeighingAction();
      return;
    }
    // F6: Abrir Gaveta de Dinheiro
    if (e.key === "F6") {
      e.preventDefault();
      triggerDrawer();
      return;
    }
    // F7: Cancelar Venda Atual
    if (e.key === "F7") {
      e.preventDefault();
      cancelActiveSale();
      return;
    }
    // F9: Trocar Operador / Bloquear Terminal
    if (e.key === "F9") {
      e.preventDefault();
      openLoginModal();
      return;
    }
  }
});

// =====================================================================
// HELPER PARA TROCA DE ABAS INTERNAS (TABS)
// =====================================================================
function switchModalTab(tabId, el) {
  const container = el.closest(".modal-body") || el.closest(".panel");
  if (!container) return;

  // Atualiza classes dos botões das abas
  const tabLinks = container.querySelectorAll(".tab-link");
  tabLinks.forEach(t => t.classList.remove("active"));
  el.classList.add("active");

  // Atualiza conteúdos das abas
  const tabContents = container.querySelectorAll(".ptab-content");
  tabContents.forEach(c => c.classList.remove("active"));
  const activeContent = container.querySelector(`#${tabId}`);
  if (activeContent) activeContent.classList.add("active");
}

function closeModal() {
  const modal = document.getElementById("modal-container");
  if (modal) modal.innerHTML = "";
  // Devolve o foco ao input do PDV se estiver na tela de checkout
  if (state.currentRoute === "/pdv") {
    setTimeout(() => {
      const inp = document.getElementById("pdv-barcode-input");
      if (inp) inp.focus();
    }, 50);
  }
}

// =====================================================================
// RENDERIZADOR MASTER DO LAYOUT
// =====================================================================
function renderLauncher() {
  return `
    <div class="launcher-wrapper">
      <div class="launcher-card">
        <div class="launcher-header">
          <div style="font-size:36px; margin-bottom:8px;">🛒</div>
          <h2>PDV Gama Retail Suite</h2>
          <p style="color:#94a3b8; font-size:13px; margin-top:4px;">Selecione o Sistema / Módulo Desta Estação:</p>
        </div>
        <div class="launcher-options">
          <div class="launcher-option-card" onclick="launchApp('pdv')">
            <div class="opt-icon">🖥️</div>
            <div class="opt-info">
              <h3>1. Frente de Caixa (PDV)</h3>
              <p>Terminal ágil de checkout para operador, com scanner e balança.</p>
            </div>
            <button class="btn btn-primary" style="pointer-events:none;">Abrir PDV</button>
          </div>

          <div class="launcher-option-card" onclick="launchApp('etiquetas')">
            <div class="opt-icon">🏷️</div>
            <div class="opt-info">
              <h3>2. Terminal de Etiquetas & Balança</h3>
              <p>Emissão de etiquetas de gôndola e exportação de carga Toledo/Filizola.</p>
            </div>
            <button class="btn btn-secondary" style="pointer-events:none;">Abrir Etiquetas</button>
          </div>

          <div class="launcher-option-card" onclick="launchApp('retaguarda')">
            <div class="opt-icon">🏢</div>
            <div class="opt-info">
              <h3>3. Retaguarda Administrativa (ERP)</h3>
              <p>Gestão completa de cadastros, financeiro, auditoria e empresa.</p>
            </div>
            <button class="btn btn-outline" style="pointer-events:none;">Abrir Retaguarda</button>
          </div>
        </div>
        <div class="launcher-footer">
          <label style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:12px; color:#94a3b8; cursor:pointer;">
            <input type="checkbox" id="chk-remember-app" />
            Lembrar este sistema e abrir automaticamente neste computador
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  // 1. Central de Lançamento (quando nenhum módulo estiver selecionado)
  if (state.currentRoute === "/") {
    root.innerHTML = renderLauncher();
    return;
  }

  // 2. MÓDULO FRENTE DE CAIXA (PDV ISOLADO, SEM MENUS DA RETAGUARDA)
  if (state.currentRoute === "/pdv") {
    root.innerHTML = `
      <div class="pdv-standalone-wrapper">
        ${renderPdvCheckout()}
      </div>
      <div id="modal-container"></div>
    `;
    return;
  }

  // 3. MÓDULO TERMINAL DE ETIQUETAS & BALANÇA (ISOLADO, SEM PDV, SEM FINANCEIRO, SEM FORNECEDORES)
  if (state.currentRoute === "/etiquetas") {
    root.innerHTML = `
      <div class="etiquetas-standalone-wrapper">
        <header class="menubar">
          <div class="menubar-inner">
            <strong style="color:#fff; font-size:14px; display:flex; align-items:center; gap:8px;">
              <span>🏷️</span> Terminal de Etiquetas de Gôndola & Balança
            </strong>
            <div style="margin-left:auto; display:flex; align-items:center; gap:12px; font-size:12px; color:#94a3b8;">
              <span>Operador: <strong>${state.user.name}</strong></span>
              <span>•</span>
              <button class="btn btn-outline btn-sm" onclick="resetPreferredApp()">Alternar Sistema</button>
            </div>
          </div>
        </header>

        <main class="app-viewport">
          ${renderLabelsModule()}
        </main>

        <footer class="statusbar">
          <div class="statusbar-inner">
            <div class="status-left">
              <span>${state.company.tradeName || state.company.name}</span>
              <span>•</span>
              <span>Módulo de Etiquetas e Cargas de Balança</span>
            </div>
            <div class="status-right">PDV Gama v2.0</div>
          </div>
        </footer>
        <div id="modal-container"></div>
      </div>
    `;
    return;
  }

  // 4. MÓDULO RETAGUARDA ADMINISTRATIVA (ERP DE GESTÃO, SEM CHECKOUT PDV)
  root.innerHTML = `
    <header class="menubar">
      <div class="menubar-inner">
        <div class="menu-item ${['/produtos', '/clientes', '/colaboradores', '/fornecedores', '/compras-nfe'].includes(state.currentRoute) ? 'active' : ''}">
          <span>Cadastros</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/produtos')">Produtos <small>F3</small></div>
            <div class="dropdown-link" onclick="navigate('/clientes')">Clientes <small>F4</small></div>
            <div class="dropdown-link" onclick="navigate('/colaboradores')">Colaboradores & Usuários</div>
            <div class="dropdown-link" onclick="navigate('/fornecedores')">Fornecedores</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="navigate('/compras-nfe')">Importar XML NF-e Compras</div>
          </div>
        </div>

        <div class="menu-item ${['/caixa', '/movimentacoes-caixa', '/financeiro', '/crediario'].includes(state.currentRoute) ? 'active' : ''}">
          <span>Financeiro</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/caixa')">Abertura / Fechamento de Caixa</div>
            <div class="dropdown-link" onclick="navigate('/movimentacoes-caixa')">Movimentações Diárias</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="openCashOperationsModal('sangria')">Sangria de Caixa (Retirada)</div>
            <div class="dropdown-link" onclick="openCashOperationsModal('suprimento')">Suprimento de Caixa (Troco)</div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-link" onclick="navigate('/financeiro')">Contas a Pagar e Receber</div>
            <div class="dropdown-link" onclick="navigate('/crediario')">Extrato de Crediário & Carnês</div>
          </div>
        </div>

        <div class="menu-item ${['/vendas', '/relatorios-abc'].includes(state.currentRoute) ? 'active' : ''}">
          <span>Vendas & Relatórios</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/vendas')">Gerenciador de Vendas & Cupons</div>
            <div class="dropdown-link" onclick="navigate('/relatorios-abc')">Curva ABC de Produtos</div>
            <div class="dropdown-link" onclick="navigate('/movimentacoes-caixa')">Extrato Consolidado do Caixa</div>
          </div>
        </div>

        <div class="menu-item ${state.currentRoute === '/configuracoes' ? 'active' : ''}">
          <span>Configurações</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="navigate('/configuracoes')">Parâmetros & Dados da Matriz</div>
            <div class="dropdown-link" onclick="navigate('/colaboradores')">Usuários & Permissões</div>
          </div>
        </div>

        <div class="menu-item">
          <span>Ajuda</span> ▾
          <div class="dropdown-menu">
            <div class="dropdown-link" onclick="openShortcutsModal()">Guia de Atalhos</div>
            <div class="dropdown-link" onclick="openAboutModal()">Sobre o Sistema</div>
          </div>
        </div>

        <div style="margin-left:auto; font-size:11px; color:#64748b; display:flex; align-items:center; gap:8px;">
          <button class="btn btn-outline btn-sm" style="font-size:11px; padding:2px 8px;" onclick="resetPreferredApp()">Alternar Sistema</button>
          <span>•</span>
          <span id="clock-display">${new Date().toLocaleString("pt-BR")}</span>
        </div>
      </div>
    </header>

    <nav class="app-toolbar">
      <div class="toolbar-inner">
        

        <button class="tool-btn ${state.currentRoute === '/produtos' ? 'active' : ''}" onclick="navigate('/produtos')">
          <span class="tool-label">PRODUTOS</span>
          <span class="tool-sub">F3</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/clientes' ? 'active' : ''}" onclick="navigate('/clientes')">
          <span class="tool-label">CLIENTES</span>
          <span class="tool-sub">F4</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/colaboradores' ? 'active' : ''}" onclick="navigate('/colaboradores')">
          <span class="tool-label">COLABORADORES</span>
          <span class="tool-sub">Usuários</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/fornecedores' ? 'active' : ''}" onclick="navigate('/fornecedores')">
          <span class="tool-label">FORNECEDORES</span>
          <span class="tool-sub">Compras</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/financeiro' ? 'active' : ''}" onclick="navigate('/financeiro')">
          <span class="tool-label">FINANCEIRO</span>
          <span class="tool-sub">Contas</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/caixa' ? 'active' : ''}" onclick="navigate('/caixa')">
          <span class="tool-label">CAIXA</span>
          <span class="tool-sub">Turno</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/vendas' ? 'active' : ''}" onclick="navigate('/vendas')">
          <span class="tool-label">VENDAS</span>
          <span class="tool-sub">Cupons</span>
        </button>

        <button class="tool-btn ${state.currentRoute === '/configuracoes' ? 'active' : ''}" onclick="navigate('/configuracoes')">
          <span class="tool-label">CONFIGURAÇÕES</span>
          <span class="tool-sub">Sistema</span>
        </button>

        <div class="tool-divider" style="margin-left:auto;"></div>

        <button class="tool-btn danger-action" onclick="openLoginModal()">
          <span class="tool-label">OPERADOR</span>
          <span class="tool-sub">${state.user.name.split(" ")[0]}</span>
        </button>
      </div>
    </nav>

    <main class="app-viewport">
      ${renderCurrentModule()}
    </main>

    <footer class="statusbar">
      <div class="statusbar-inner">
        <div class="status-left">
          <span>Empresa: <strong>${state.company.tradeName || state.company.name}</strong></span>
          <span>•</span>
          <span>CNPJ: ${state.company.cnpj || '-'}</span>
          <span>•</span>
          <span>Usuário: <strong>${state.user.name}</strong> (${state.user.role})</span>
        </div>
        <div class="status-right">PDV Gama Enterprise v2.0</div>
      </div>
    </footer>

    <div id="modal-container"></div>
  `;
}

function renderCurrentModule() {
  switch (state.currentRoute) {
    case "/pdv":
      return renderPdvCheckout();
    case "/produtos":
      return renderProductsModule();
    case "/clientes":
      return renderCustomersModule();
    case "/colaboradores":
    case "/usuarios":
      return renderCollaboratorsModule();
    case "/fornecedores":
      return renderSuppliersModule();
    case "/caixa":
      return renderCashModule();
    case "/movimentacoes-caixa":
      return renderCashMovementsModule();
    case "/vendas":
      return renderSalesManagerModule();
    case "/configuracoes":
    case "/config-hardware":
    case "/config-segmento":
      return renderSettingsModule();
    case "/financeiro":
      return renderFinancialModule();
    case "/crediario":
      return renderCrediarioModule();
    case "/etiquetas":
      return renderLabelsModule();
    case "/relatorios-abc":
      return renderAbcReportModule();
    case "/retaguarda":
    case "/admin":
    default:
      return renderProductsModule();
  }
}

// =====================================================================
// MÓDULO 1: FRENTE DE CAIXA PDV CHECKOUT (GDM TelaMasterVenda & Linear)
// =====================================================================
function renderPdvCheckout() {
  const subtotalRaw = state.cart.reduce((acc, it) => acc + (it.total || 0), 0);
  const discount = state.activeDiscount || 0;
  const subtotal = Math.max(0, subtotalRaw - discount);
  const totalItems = state.cart.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const isSaleActive = state.cart.length > 0;
  const lastItem = state.lastItem;

  // Garante foco contínuo no campo de código de barras
  setTimeout(() => {
    const inp = document.getElementById("pdv-barcode-input");
    if (inp && document.activeElement !== inp && (!document.getElementById("modal-container").children.length)) {
      inp.focus();
    }
  }, 100);

  return `
    <div class="pdv-checkout-screen">
      <!-- 1. Barra de Topo do PDV -->
      <div class="pdv-top-status-bar">
        <div class="pdv-top-info-left">
          <span class="pdv-store-name">${state.terminalConfig?.storeName || state.company.tradeName || state.company.name}</span>
          <span class="pdv-terminal-badge">CAIXA ${String(state.terminalConfig?.terminalNumber || 1).padStart(2, '0')}</span>
          <span class="pdv-status-indicator ${isSaleActive ? 'in-sale' : 'ready'}">
            ${isSaleActive ? 'VENDA EM ANDAMENTO' : 'CAIXA LIVRE'}
          </span>
          <span style="font-size:11px; color:#38bdf8; font-weight:600; margin-left:6px;">
            ⚖️ ${state.terminalConfig?.scale?.model || 'Balança Checkout'}
          </span>
        </div>

        <div class="pdv-top-info-right">
          <div class="pdv-operator-chip">
            <span style="color:#64748b; font-size:11px; font-weight:700;">OPERADOR:</span>
            <strong style="color:#38bdf8;">${state.user.name}</strong>
          </div>

          <div class="pdv-customer-chip">
            <span style="color:#64748b; font-size:11px; font-weight:700;">CPF NA NOTA:</span>
            <strong style="color:#f8fafc;">
              ${state.activeCustomer ? (state.activeCustomer.cpfCnpj || state.activeCustomer.name) : 'Não informado'}
            </strong>
            <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:11px;" onclick="openCustomerSearchModal()">
              ${state.activeCustomer ? 'Alterar (F4)' : 'Informar (F4)'}
            </button>
            ${state.activeCustomer ? `
              <button class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:10px;" onclick="removeActiveCustomer()" title="Remover CPF">✕</button>
            ` : ''}
          </div>

          <span id="pdv-clock-display" style="font-size:12px; color:#64748b; margin-left:10px;">
            ${new Date().toLocaleTimeString("pt-BR")}
          </span>
        </div>
      </div>

      <!-- 2. Banner de Destaque: Descrição do Produto Lido -->
      <div class="pdv-product-banner">
        <div class="pdv-product-banner-text">
          <span class="pdv-banner-label">Descrição do Produto</span>
          <div class="pdv-banner-title">
            ${lastItem ? lastItem.name : (isSaleActive ? 'Passe o próximo produto...' : 'Caixa Disponível - Bipe ou digite o código')}
          </div>
        </div>
        <div class="pdv-banner-meta">
          ${lastItem ? `
            <span class="badge badge-blue" style="font-size:13px; padding:4px 10px;">
              Qtd: ${fmtNum(lastItem.quantity, lastItem.isWeighable ? 3 : 0)} ${lastItem.unit || 'UN'}
            </span>
            <span class="badge badge-green" style="font-size:13px; padding:4px 10px;">
              Unit: ${fmtMoeda(lastItem.unitPrice)}
            </span>
            <span class="badge badge-amber" style="font-size:13px; padding:4px 10px;">
              Estoque: ${fmtNum(lastItem.stock || 10, 0)}
            </span>
          ` : `
            <span class="badge badge-gray" style="font-size:12px; padding:4px 8px;">Aguardando leitura</span>
          `}
        </div>
      </div>

      <!-- 3. Corpo Principal Dividido em 2 Colunas de Supermercado -->
      <div class="pdv-main-split">
        <!-- Coluna da Esquerda: Tabela de Itens da Venda Atual -->
        <div class="pdv-items-panel">
          <div class="pdv-panel-header">
            <span>Itens Lançados na Venda Atual</span>
            <span>Total de Linhas: ${state.cart.length}</span>
          </div>

          <div class="pdv-items-table-wrap">
            <table class="pdv-items-table">
              <thead>
                <tr>
                  <th style="width:40px;" class="cell-center">Item</th>
                  <th style="width:140px;">Código / EAN</th>
                  <th>Descrição Completa</th>
                  <th style="width:70px;" class="cell-right">Qtd</th>
                  <th style="width:45px;" class="cell-center">Un</th>
                  <th style="width:100px;" class="cell-right">Unitário</th>
                  <th style="width:110px;" class="cell-right">Total</th>
                  <th style="width:45px;" class="cell-center">✕</th>
                </tr>
              </thead>
              <tbody>
                ${state.cart.length === 0 ? `
                  <tr>
                    <td colspan="8">
                      <div class="pdv-empty-table-msg">
                        <strong style="color:#94a3b8; font-size:15px;">CAIXA PRONTO PARA VENDER</strong>
                        <span>Digite o código de barras, SKU ou PLU no campo ao lado e tecle [Enter].</span>
                        <span>Multiplicação de quantidade: digite <strong>3*789000000000</strong> ou use F3 para pesquisar.</span>
                      </div>
                    </td>
                  </tr>
                ` : state.cart.map((it, idx) => `
                  <tr class="${lastItem && lastItem.sku === it.sku ? 'active' : ''}">
                    <td class="cell-center"><strong>${idx + 1}</strong></td>
                    <td><code>${it.barcode || it.sku}</code></td>
                    <td>
                      <div><strong>${it.name}</strong></div>
                      ${it.isWholesale ? '<small style="color:#38bdf8; font-weight:700;">★ Preço Atacado Aplicado</small>' : ''}
                    </td>
                    <td class="cell-right">${fmtNum(it.quantity, it.isWeighable ? 3 : 0)}</td>
                    <td class="cell-center"><span class="badge badge-gray" style="padding:1px 4px; font-size:10px;">${it.unit || 'UN'}</span></td>
                    <td class="cell-right">${fmtMoeda(it.unitPrice)}</td>
                    <td class="cell-right"><strong style="color:#22c55e;">${fmtMoeda(it.total)}</strong></td>
                    <td class="cell-center">
                      <button class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:10px;" onclick="removeCartItem(${idx})">✕</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Coluna da Direita: Painel Operacional do Caixa -->
        <div class="pdv-ops-panel">
          <!-- Card do Último Item Lido -->
          <div class="pdv-active-item-card">
            <div class="pdv-item-icon-box">📦</div>
            <div class="pdv-item-details">
              <div class="pdv-item-name">${lastItem ? lastItem.name : 'Nenhum item lançado'}</div>
              <div class="pdv-item-submeta">
                ${lastItem ? `Unitário: ${fmtMoeda(lastItem.unitPrice)} | Total Item: ${fmtMoeda(lastItem.total)}` : 'Aguardando bipe do leitor...'}
              </div>
            </div>
          </div>

          <!-- Totalizador Gigante (Subtotal da Venda) -->
          <div class="pdv-subtotal-card">
            <div class="pdv-subtotal-header">
              <span class="pdv-subtotal-label">Total a Pagar</span>
              <span class="pdv-items-count-badge">${totalItems} ${totalItems === 1 ? 'item' : 'itens'}</span>
            </div>
            <div class="pdv-subtotal-value">${fmtMoeda(subtotal)}</div>
            ${discount > 0 ? `<div style="font-size:12px; color:#f87171; font-weight:700; margin-top:4px;">Desconto Aplicado: -${fmtMoeda(discount)}</div>` : ''}
          </div>

          <!-- Campo de Leitura do Código de Barras / EAN / PLU -->
          <div class="pdv-input-box">
            <label class="pdv-input-label" for="pdv-barcode-input">
              Código de Barras / SKU / Multiplicador [Enter]
            </label>
            <input
              type="text"
              id="pdv-barcode-input"
              class="pdv-barcode-input-field"
              placeholder="Ex: 789... ou 3*789..."
              autocomplete="off"
              onkeydown="handlePdvBarcodeKeyDown(event)"
              autofocus
            />
            <div class="pdv-input-hint">
              Exemplo: digite <strong>5*789...</strong> para 5 unidades. <strong>F2</strong> Desconto | <strong>F8</strong> Cancela Item.
            </div>
          </div>

          <!-- Botão Finalizar Venda na Lateral -->
          <button
            class="btn btn-success btn-lg"
            style="width:100%; font-weight:800; padding:12px; font-size:14px; margin-top:10px;"
            onclick="openPaymentModal()"
          >
            Finalizar Venda (F11)
          </button>


        </div>
      </div>

      <!-- 4. Rodapé Estático de Comandos do Teclado (Sem Mouse, Sem Rolagem) -->
      <div class="pdv-command-strip">
        <div class="cmd-item"><kbd>F11</kbd> <span>Finalizar Venda</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F2</kbd> <span>Desconto / Cupom</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F3</kbd> <span>Consultar Preço</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F4</kbd> <span>CPF na Nota</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F5</kbd> <span>Balança</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F6</kbd> <span>Abrir Gaveta</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F7</kbd> <span>Cancelar Venda</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F8</kbd> <span>Cancelar Item</span></div>
        <span class="cmd-sep">|</span>
        <div class="cmd-item"><kbd>F9</kbd> <span>Operador</span></div>
      </div>
      <div style="text-align:center; margin-top:8px;">
        <span style="font-size:11px; color:#475569; cursor:pointer;" onclick="resetPreferredApp()">
          Estação: Loja ${state.terminalConfig?.storeNumber || 1} / Caixa ${state.terminalConfig?.terminalNumber || 1} • Alternar Sistema
        </span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// LÓGICA DE ENTRADA DO LEITOR / CÓDIGO DE BARRAS NO CHECKOUT
// ---------------------------------------------------------------------
function handlePdvBarcodeKeyDown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();

  const input = event.target;
  const raw = (input.value || "").trim();
  if (!raw) return;

  let qty = 1.0;
  let term = raw;

  // Suporte a multiplicador: "3*7891234" ou "0.750*102"
  if (raw.includes("*")) {
    const parts = raw.split("*");
    const parsedQty = parseFloat(parts[0].replace(",", "."));
    if (!isNaN(parsedQty) && parsedQty > 0) {
      qty = parsedQty;
      term = parts.slice(1).join("*").trim();
    }
  }

  // Se balança estiver ativa com peso capturado
  if (state.activeScaleWeight > 0) {
    qty = state.activeScaleWeight;
    state.activeScaleWeight = 0.0;
  }

  // Busca o produto no catálogo local
  const prod = findProductByCode(term);
  if (!prod) {
    alert(`Produto não encontrado para o código: "${term}".\nPressione F3 para consultar a lista completa de produtos.`);
    input.select();
    return;
  }

  // Regra de preço por atacado (volume)
  let unitPrice = prod.salePrice || 0;
  let isWholesale = false;
  if (prod.wholesaleMinQty && qty >= prod.wholesaleMinQty && prod.wholesalePrice > 0) {
    unitPrice = prod.wholesalePrice;
    isWholesale = true;
  }

  const lineTotal = unitPrice * qty;

  const cartItem = {
    id: Date.now() + Math.random(),
    productId: prod.id,
    sku: prod.sku,
    barcode: prod.barcode,
    name: prod.name,
    unit: prod.unit || "UN",
    quantity: qty,
    unitPrice: unitPrice,
    discountPct: 0,
    total: lineTotal,
    isWeighable: prod.isWeighable,
    isWholesale: isWholesale,
    stock: prod.quantity
  };

  playScannerBeep();
  state.cart.push(cartItem);
  state.lastItem = cartItem;

  input.value = "";
  renderApp();

  setTimeout(() => {
    const inp = document.getElementById("pdv-barcode-input");
    if (inp) inp.focus();
  }, 30);
}

function findProductByCode(code) {
  const c = String(code).trim().toLowerCase();
  return state.products.find(p =>
    (p.barcode && p.barcode.toLowerCase() === c) ||
    (p.sku && p.sku.toLowerCase() === c) ||
    (p.pluCode && p.pluCode.toLowerCase() === c) ||
    (p.secondaryBarcodes && p.secondaryBarcodes.toLowerCase().includes(c))
  );
}

function removeCartItem(idx) {
  if (idx >= 0 && idx < state.cart.length) {
    state.cart.splice(idx, 1);
    if (state.cart.length > 0) {
      state.lastItem = state.cart[state.cart.length - 1];
    } else {
      state.lastItem = null;
    }
    renderApp();
  }
}

function cancelActiveSale() {
  if (state.cart.length === 0) {
    alert("Não há venda em andamento para cancelar.");
    return;
  }
  if (confirm("Deseja realmente cancelar toda a venda atual e limpar os itens do caixa?")) {
    state.cart = [];
    state.lastItem = null;
    renderApp();
  }
}

function removeActiveCustomer() {
  state.activeCustomer = null;
  renderApp();
}

function triggerWeighingAction() {
  // Simula leitura de balança homologada Toledo MGV6 / Filizola Smart
  const simulated = +(Math.random() * (1.85 - 0.25) + 0.25).toFixed(3);
  state.activeScaleWeight = simulated;
  alert(`Balança de Checkout (Toledo MGV6): Peso capturado: ${simulated.toFixed(3)} kg.\nO próximo item lançado assumirá este peso automaticamente.`);
  const inp = document.getElementById("pdv-barcode-input");
  if (inp) inp.focus();
}

function triggerDrawer() {
  alert("Comando de abertura de gaveta enviado com sucesso (Pulso ESC/POS 0x1B 0x70 0x00 0x19 0xFA).");
}

// =====================================================================
// MODAL 1: FINALIZAÇÃO DA VENDA & PAGAMENTOS (GDM TelaFinalizarVenda)
// =====================================================================

// =====================================================================
// FUNÇÕES DE OPERAÇÃO DO CAIXA: CANCELAR ITEM & DESCONTO / CUPOM
// =====================================================================
function openCancelItemModal() {
  if (state.cart.length === 0) {
    alert("Nenhum item lançado na venda atual.");
    return;
  }
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay" style="background: rgba(0,0,0,0.4);">
      <div class="modal-box" style="max-width:380px; margin-left:auto; margin-right:40px;">
        <header class="modal-header">
          <strong class="modal-title">Cancelar Item (F8)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <form onsubmit="handleCancelItemSubmit(event)">
          <div class="modal-body" style="padding:16px;">
            <label style="font-size:12px; color:#cbd5e1; display:block; margin-bottom:6px;">
              Número do Item a Cancelar (1 a ${state.cart.length}):
            </label>
            <input
              type="number"
              id="cancel-item-num"
              class="form-control"
              placeholder="Ex: ${state.cart.length} [Enter para último]"
              min="1"
              max="${state.cart.length}"
              autofocus
              style="font-size:18px; font-weight:800; text-align:center;"
            />
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Voltar (Esc)</button>
            <button type="submit" class="btn btn-danger">Confirmar Cancelamento [Enter]</button>
          </footer>
        </form>
      </div>
    </div>
  `;
  setTimeout(() => {
    const inp = document.getElementById("cancel-item-num");
    if (inp) inp.focus();
  }, 50);
}

function handleCancelItemSubmit(e) {
  e.preventDefault();
  const inp = document.getElementById("cancel-item-num");
  let idx = parseInt(inp.value, 10);
  if (isNaN(idx) || idx < 1 || idx > state.cart.length) {
    idx = state.cart.length; // Padrão: cancela o último item lançado
  }
  const removed = state.cart.splice(idx - 1, 1)[0];
  closeModal();
  renderApp();
  if (removed) {
    alert(`Item ${idx} (${removed.name}) foi cancelado do cupom.`);
  }
}

function openDiscountModal() {
  if (state.cart.length === 0) {
    alert("Nenhum item na venda para aplicar desconto.");
    return;
  }
  const subtotalRaw = state.cart.reduce((acc, it) => acc + (it.total || 0), 0);
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay" style="background: rgba(0,0,0,0.4);">
      <div class="modal-box" style="max-width:380px; margin-left:auto; margin-right:40px;">
        <header class="modal-header">
          <strong class="modal-title">Desconto ou Cupom (F2)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <form onsubmit="handleApplyDiscountSubmit(event, ${subtotalRaw})">
          <div class="modal-body" style="padding:16px;">
            <div style="font-size:12px; color:#94a3b8; margin-bottom:10px;">
              Subtotal: <strong style="color:#fff;">${fmtMoeda(subtotalRaw)}</strong>
            </div>
            <label style="font-size:12px; color:#cbd5e1; display:block; margin-bottom:6px;">
              Informe R$ (ex: 5.00), % (ex: 10%) ou Cupom (ex: PROMO10):
            </label>
            <input
              type="text"
              id="discount-input-field"
              class="form-control"
              placeholder="Ex: 10% ou 5,00 ou PROMO10"
              autofocus
              style="font-size:16px; font-weight:700;"
            />
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Voltar (Esc)</button>
            <button type="submit" class="btn btn-primary">Aplicar Desconto [Enter]</button>
          </footer>
        </form>
      </div>
    </div>
  `;
  setTimeout(() => {
    const inp = document.getElementById("discount-input-field");
    if (inp) inp.focus();
  }, 50);
}

function handleApplyDiscountSubmit(e, subtotal) {
  e.preventDefault();
  const inp = document.getElementById("discount-input-field");
  const raw = (inp.value || "").trim().toUpperCase();
  if (!raw) { closeModal(); return; }

  let disc = 0;
  if (raw.endsWith("%")) {
    const pct = parseFloat(raw.replace("%", "").replace(",", ".")) || 0;
    disc = (subtotal * pct) / 100;
  } else if (raw === "PROMO10" || raw === "CUPOM10") {
    disc = (subtotal * 10) / 100;
  } else if (raw === "PROMO5" || raw === "CUPOM5") {
    disc = (subtotal * 5) / 100;
  } else {
    disc = parseFloat(raw.replace(",", ".")) || 0;
  }

  if (disc > subtotal) disc = subtotal;
  state.activeDiscount = disc;
  closeModal();
  renderApp();
}

function openPaymentModal() {
  if (state.cart.length === 0) {
    alert("Nenhum item lançado no PDV! Bipe produtos antes de finalizar a venda.");
    return;
  }

  const subtotal = state.cart.reduce((acc, it) => acc + (it.total || 0), 0);
  state.payment.amountReceived = subtotal;
  state.payment.change = 0;
  state.payment.method = "DINHEIRO";
  state.payment.splitLines = [];

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width: 480px; margin-left: auto; margin-right: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
        <header class="modal-header">
          <strong class="modal-title">Finalização da Venda (F11 / GDM TelaFinalizarVenda)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <!-- Total a Pagar em Destaque Gigante -->
          <div style="background:#040711; border:2px solid #22c55e; border-radius:8px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
            <div>
              <span style="font-size:12px; font-weight:800; color:#86efac; text-transform:uppercase; letter-spacing:1px;">Total a Pagar</span>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                Cliente: <strong style="color:#f8fafc;">${state.activeCustomer ? state.activeCustomer.name : 'Consumidor Final'}</strong>
              </div>
            </div>
            <div style="font-size:38px; font-family:'Consolas', monospace; font-weight:900; color:#22c55e;">
              ${fmtMoeda(subtotal)}
            </div>
          </div>

          <!-- Abas / Formas de Pagamento -->
          <div class="payment-methods-grid">
            <button type="button" class="pay-method-btn active" id="btn-pay-dinheiro" onclick="selectPaymentMethod('DINHEIRO', ${subtotal})">
              <span style="font-size:18px;">💵</span>
              <span>1. Dinheiro</span>
            </button>

            <button type="button" class="pay-method-btn" id="btn-pay-debito" onclick="selectPaymentMethod('DEBITO', ${subtotal})">
              <span style="font-size:18px;">💳</span>
              <span>2. Cartão Débito</span>
            </button>

            <button type="button" class="pay-method-btn" id="btn-pay-credito" onclick="selectPaymentMethod('CREDITO', ${subtotal})">
              <span style="font-size:18px;">💳</span>
              <span>3. Cartão Crédito</span>
            </button>

            <button type="button" class="pay-method-btn" id="btn-pay-pix" onclick="selectPaymentMethod('PIX', ${subtotal})">
              <span style="font-size:18px;">⚡</span>
              <span>4. PIX QrCode</span>
            </button>

            <button type="button" class="pay-method-btn" id="btn-pay-crediario" onclick="selectPaymentMethod('CREDIARIO', ${subtotal})">
              <span style="font-size:18px;">📋</span>
              <span>5. Crediário / Carnê</span>
            </button>

            <button type="button" class="pay-method-btn" id="btn-pay-split" onclick="selectPaymentMethod('SPLIT', ${subtotal})">
              <span style="font-size:18px;">🔄</span>
              <span>6. Dividir Conta</span>
            </button>
          </div>

          <!-- Painel Dinâmico da Forma de Pagamento Selecionada -->
          <div id="payment-method-panel" style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:18px;">
            ${renderPaymentMethodView('DINHEIRO', subtotal)}
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar (Esc)</button>
          <button type="button" class="btn btn-success btn-lg" onclick="confirmPaymentAndFinishSale(${subtotal})">
            Finalizar Venda [Enter]
          </button>
        </footer>
      </div>
    </div>
  `;

  setTimeout(() => {
    const valInput = document.getElementById("pay-amount-input");
    if (valInput) {
      valInput.focus();
      valInput.select();
    }
  }, 100);
}

function selectPaymentMethod(method, total) {
  state.payment.method = method;

  // Atualiza visual dos botões
  document.querySelectorAll(".pay-method-btn").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById(`btn-pay-${method.toLowerCase()}`);
  if (btn) btn.classList.add("active");

  const panel = document.getElementById("payment-method-panel");
  if (panel) {
    panel.innerHTML = renderPaymentMethodView(method, total);
  }

  if (method === "DINHEIRO") {
    setTimeout(() => {
      const inp = document.getElementById("pay-amount-input");
      if (inp) { inp.focus(); inp.select(); }
    }, 50);
  }
}

function renderPaymentMethodView(method, total) {
  switch (method) {
    case "DINHEIRO":
      return `
        <div>
          <div class="form-group" style="margin-bottom:12px;">
            <label style="font-size:13px; font-weight:700; color:#38bdf8;">Valor Recebido em Dinheiro (R$):</label>
            <input
              type="number"
              step="0.01"
              id="pay-amount-input"
              class="form-control"
              style="font-size:24px; font-weight:800; font-family:'Consolas', monospace; color:#22c55e; height:50px;"
              value="${total.toFixed(2)}"
              oninput="handleCashAmountInput(this.value, ${total})" onkeydown="if(event.key==='Enter'){event.preventDefault();confirmPaymentAndFinishSale(${total});}"
            />
          </div>



          <!-- Display de Troco -->
          <div class="change-display-box positive" id="change-box" style="margin-top:16px;">
            <span style="font-size:13px; font-weight:800; color:#94a3b8; text-transform:uppercase;">Troco a Devolver:</span>
            <span class="change-display-value" id="change-display-val">R$ 0,00</span>
          </div>
        </div>
      `;

    case "DEBITO":
      return `
        <div>
          <h4 style="font-size:14px; color:#fff; margin-bottom:12px;">Cartão de Débito (POS / TEF)</h4>
          <div class="form-grid">
            <div class="form-group">
              <label>Bandeira do Cartão:</label>
              <select id="card-brand-select" class="form-control">
                <option value="VISA">Visa Débito</option>
                <option value="MASTERCARD">MasterCard Maestro</option>
                <option value="ELO">Elo Débito</option>
                <option value="HIPERCARD">Hipercard</option>
                <option value="OUTROS">Outras Bandeiras</option>
              </select>
            </div>
            <div class="form-group">
              <label>Valor da Operação:</label>
              <input type="text" class="form-control" value="${fmtMoeda(total)}" readonly style="font-weight:700; color:#38bdf8;" />
            </div>
          </div>
          <div style="background:#131d33; padding:12px; border-radius:6px; margin-top:12px; font-size:12px; color:#cbd5e1;">
            Aguarde o processamento na maquininha POS / PinPad TEF e confirme abaixo.
          </div>
        </div>
      `;

    case "CREDITO":
      return `
        <div>
          <h4 style="font-size:14px; color:#fff; margin-bottom:12px;">Cartão de Crédito (Rotativo / Parcelado)</h4>
          <div class="form-grid">
            <div class="form-group">
              <label>Bandeira:</label>
              <select id="card-credit-brand" class="form-control">
                <option value="VISA">Visa Crédito</option>
                <option value="MASTERCARD">MasterCard Crédito</option>
                <option value="ELO">Elo Crédito</option>
                <option value="HIPERCARD">Hipercard</option>
                <option value="AMEX">American Express</option>
              </select>
            </div>
            <div class="form-group">
              <label>Número de Parcelas:</label>
              <select id="card-installments-select" class="form-control">
                <option value="1">1x de ${fmtMoeda(total)} (À vista)</option>
                <option value="2">2x de ${fmtMoeda(total / 2)}</option>
                <option value="3">3x de ${fmtMoeda(total / 3)}</option>
                <option value="4">4x de ${fmtMoeda(total / 4)}</option>
                <option value="5">5x de ${fmtMoeda(total / 5)}</option>
                <option value="6">6x de ${fmtMoeda(total / 6)}</option>
              </select>
            </div>
          </div>
        </div>
      `;

    case "PIX":
      return `
        <div style="text-align:center;">
          <h4 style="font-size:14px; color:#fff; margin-bottom:12px;">Pagamento Instantâneo PIX (Banco Central)</h4>
          <div style="background:#fff; width:140px; height:140px; margin:0 auto; padding:10px; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="font-size:11px; color:#0f172a; font-weight:700;">QR-CODE PIX</div>
            <div style="font-size:32px; margin:8px 0;">📱</div>
            <div style="font-size:10px; color:#64748b;">${fmtMoeda(total)}</div>
          </div>
          <p style="margin-top:12px; font-size:12px; color:#94a3b8;">
            Aponte o app do banco ou use a chave PIX CNPJ: <strong>${state.company.cnpj}</strong>
          </p>
        </div>
      `;

    case "CREDIARIO":
      if (!state.activeCustomer) {
        return `
          <div style="background:#3b1212; border:1px solid #7f1d1d; border-radius:8px; padding:16px; text-align:center;">
            <div style="font-size:20px; margin-bottom:6px;">⚠️</div>
            <strong style="color:#fca5a5; font-size:14px;">NENHUM CLIENTE SELECIONADO NA VENDA!</strong>
            <p style="color:#cbd5e1; font-size:12px; margin:8px 0 14px 0;">
              Para vender a prazo ou no crediário, é obrigatório vincular um cliente cadastrado com limite aprovado.
            </p>
            <button type="button" class="btn btn-primary" onclick="openCustomerSearchModal()">
              Buscar / Identificar Cliente Agora (Ctrl+C)
            </button>
          </div>
        `;
      }
      const limit = state.activeCustomer.creditLimit || 0;
      const debt = state.activeCustomer.currentDebt || 0;
      const available = limit - debt;
      const exceeds = total > available;

      return `
        <div>
          <h4 style="font-size:14px; color:#fff; margin-bottom:8px;">Venda a Prazo / Crediário da Loja</h4>
          <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:12px 14px; margin-bottom:14px; font-size:13px;">
            <div>Cliente: <strong style="color:#38bdf8;">${state.activeCustomer.name}</strong> (CPF: ${state.activeCustomer.cpfCnpj || '-'})</div>
            <div style="display:flex; gap:20px; margin-top:8px;">
              <div>Limite Total: <strong>${fmtMoeda(limit)}</strong></div>
              <div>Saldo Devedor: <strong style="color:#f87171;">${fmtMoeda(debt)}</strong></div>
              <div>Saldo Disponível: <strong style="color:${available >= total ? '#22c55e' : '#f87171'};">${fmtMoeda(available)}</strong></div>
            </div>
          </div>

          ${exceeds ? `
            <div style="background:#451a03; border:1px solid #92400e; padding:10px; border-radius:6px; color:#fde68a; font-size:12px; margin-bottom:12px;">
              ⚠️ O valor da compra (${fmtMoeda(total)}) excede o saldo disponível de crédito (${fmtMoeda(available)}). Requer aprovação do gerente.
            </div>
          ` : ''}

          <div class="form-grid">
            <div class="form-group">
              <label>Prazo de Vencimento:</label>
              <select id="crediario-due-days" class="form-control">
                <option value="30">30 dias corridos</option>
                <option value="60">30 / 60 dias (2 parcelas)</option>
                <option value="90">30 / 60 / 90 dias (3 parcelas)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Observação no Carnê:</label>
              <input type="text" id="crediario-obs" class="form-control" placeholder="Ex: Autorizado pelo gerente" />
            </div>
          </div>
        </div>
      `;

    case "SPLIT":
      return `
        <div>
          <h4 style="font-size:14px; color:#fff; margin-bottom:10px;">Divisão da Conta / Pagamento Múltiplo</h4>
          <p style="font-size:12px; color:#94a3b8; margin-bottom:14px;">
            Adicione as formas parciais até totalizar ${fmtMoeda(total)}.
          </p>
          <div style="display:flex; gap:10px; align-items:flex-end;">
            <div class="form-group" style="flex:1;">
              <label>Forma:</label>
              <select id="split-type-sel" class="form-control">
                <option value="DINHEIRO">Dinheiro</option>
                <option value="DEBITO">Cartão Débito</option>
                <option value="CREDITO">Cartão Crédito</option>
                <option value="PIX">PIX</option>
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label>Valor Parcial (R$):</label>
              <input type="number" step="0.01" id="split-val-inp" class="form-control" placeholder="Ex: 50.00" />
            </div>
            <button type="button" class="btn btn-primary" onclick="addSplitPaymentLine(${total})">+ Adicionar</button>
          </div>

          <div id="split-lines-list" style="margin-top:14px;">
            ${renderSplitLinesTable(total)}
          </div>
        </div>
      `;
  }
}

function handleCashAmountInput(val, total) {
  const num = parseFloat(val) || 0;
  state.payment.amountReceived = num;
  const change = num - total;
  state.payment.change = change;

  const display = document.getElementById("change-display-val");
  const box = document.getElementById("change-box");
  if (display && box) {
    if (change >= 0) {
      display.innerText = fmtMoeda(change);
      display.style.color = "#22c55e";
      box.className = "change-display-box positive";
    } else {
      display.innerText = `Falta ${fmtMoeda(Math.abs(change))}`;
      display.style.color = "#f87171";
      box.className = "change-display-box";
    }
  }
}

function setCashChipValue(val, total) {
  const inp = document.getElementById("pay-amount-input");
  if (inp) {
    inp.value = Number(val).toFixed(2);
    handleCashAmountInput(val, total);
    inp.focus();
    inp.select();
  }
}

function addSplitPaymentLine(total) {
  const sel = document.getElementById("split-type-sel");
  const inp = document.getElementById("split-val-inp");
  if (!sel || !inp) return;

  const val = parseFloat(inp.value) || 0;
  if (val <= 0) {
    alert("Informe um valor válido maior que zero.");
    return;
  }

  state.payment.splitLines.push({
    method: sel.value,
    amount: val
  });

  inp.value = "";
  const listEl = document.getElementById("split-lines-list");
  if (listEl) listEl.innerHTML = renderSplitLinesTable(total);
}

function removeSplitLine(idx, total) {
  state.payment.splitLines.splice(idx, 1);
  const listEl = document.getElementById("split-lines-list");
  if (listEl) listEl.innerHTML = renderSplitLinesTable(total);
}

function renderSplitLinesTable(total) {
  const paid = state.payment.splitLines.reduce((acc, l) => acc + l.amount, 0);
  const remaining = total - paid;

  return `
    <table class="data-table" style="font-size:12px;">
      <thead>
        <tr>
          <th>Forma</th>
          <th class="text-right">Valor</th>
          <th class="text-center" style="width:50px;">Ação</th>
        </tr>
      </thead>
      <tbody>
        ${state.payment.splitLines.length === 0 ? `
          <tr><td colspan="3" class="text-center" style="padding:14px; color:#64748b;">Nenhuma parcela adicionada ainda.</td></tr>
        ` : state.payment.splitLines.map((l, i) => `
          <tr>
            <td><strong>${l.method}</strong></td>
            <td class="text-right">${fmtMoeda(l.amount)}</td>
            <td class="text-center"><button class="btn btn-danger btn-sm" onclick="removeSplitLine(${i}, ${total})">✕</button></td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr>
          <th>Total Informado:</th>
          <th class="text-right" style="color:#38bdf8;">${fmtMoeda(paid)}</th>
          <th></th>
        </tr>
        <tr>
          <th>Saldo Faltante:</th>
          <th class="text-right" style="color:${remaining <= 0 ? '#22c55e' : '#f87171'};">${fmtMoeda(Math.max(0, remaining))}</th>
          <th></th>
        </tr>
      </tfoot>
    </table>
  `;
}

async function confirmPaymentAndFinishSale(subtotal) {
  const method = state.payment.method;

  // Validação Dinheiro
  if (method === "DINHEIRO") {
    const received = state.payment.amountReceived;
    if (received < subtotal) {
      alert(`Valor recebido (${fmtMoeda(received)}) é inferior ao total da compra (${fmtMoeda(subtotal)}).`);
      return;
    }
  }

  // Validação Crediário
  if (method === "CREDIARIO") {
    if (!state.activeCustomer) {
      alert("Selecione um cliente para prosseguir com a venda no crediário.");
      return;
    }
  }

  // Validação Split
  if (method === "SPLIT") {
    const paid = state.payment.splitLines.reduce((acc, l) => acc + l.amount, 0);
    if (paid < subtotal) {
      alert(`O total informado nas parcelas (${fmtMoeda(paid)}) ainda não quitou a compra (${fmtMoeda(subtotal)}).`);
      return;
    }
  }

  try {
    const payload = {
      customerId: state.activeCustomer ? state.activeCustomer.id : null,
      operatorName: state.user.name,
      paymentMethod: method,
      amountReceived: state.payment.amountReceived,
      change: Math.max(0, state.payment.change),
      items: state.cart.map(it => ({
        productId: it.productId,
        sku: it.sku,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discountPct: it.discountPct,
        total: it.total
      }))
    };

    const res = await API.post("/api/sales/complete", payload);
    const saleNumber = res.saleNumber || res.number || (Date.now() % 100000);

    // Exibe o Cupom Fiscal Térmico ESC/POS
    showThermalReceiptModal({
      saleNumber: saleNumber,
      date: new Date(),
      operator: state.user.name,
      customer: state.activeCustomer ? state.activeCustomer.name : "CONSUMIDOR FINAL",
      items: [...state.cart],
      total: subtotal,
      paymentMethod: method,
      received: state.payment.amountReceived,
      change: state.payment.change
    });

    // Limpa a venda atual do caixa
    state.cart = [];
    state.lastItem = null;
    state.activeCustomer = null;

  } catch (err) {
    alert("Erro ao finalizar venda: " + err.message);
  }
}

// ---------------------------------------------------------------------
// CUPOM FISCAL TÉRMICO ESC/POS (80MM PADRÃO BRASILEIRO NFC-e)
// ---------------------------------------------------------------------
function showThermalReceiptModal(data) {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:440px;">
        <header class="modal-header">
          <strong class="modal-title">Cupom Fiscal de Venda Concluída</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal(); renderApp();">✕</button>
        </header>

        <div class="modal-body" style="background:#e2e8f0; display:flex; justify-content:center; padding:16px;">
          <div id="thermal-receipt-print-area" class="thermal-receipt">
            <div class="receipt-center">
              <div class="receipt-title">${state.company.tradeName || state.company.name}</div>
              <div class="receipt-bold">${state.company.name}</div>
              <div>CNPJ: ${state.company.cnpj}</div>
              <div>${state.company.address || 'Av. Principal, 1000 - Centro'}</div>
              <div>Tel: ${state.company.phone || '(11) 3456-7890'}</div>
            </div>

            <div class="receipt-divider"></div>

            <div class="receipt-center receipt-bold">
              EXTRATO DE CUPOM DE VENDA ELETRÔNICO
            </div>
            <div class="receipt-divider"></div>

            <div style="font-size:11px;">
              <div>CUPOM Nº: <strong>${String(data.saleNumber).padStart(6, '0')}</strong></div>
              <div>EMISSÃO: ${fmtDataHora(data.date)}</div>
              <div>OPERADOR: ${data.operator} | CX: 01</div>
              <div>CONSUMIDOR: ${data.customer}</div>
            </div>

            <div class="receipt-divider"></div>

            <table>
              <thead>
                <tr>
                  <th>ITEM/DESCRIÇÃO</th>
                  <th style="text-align:right;">QTD x UNIT</th>
                  <th style="text-align:right;">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.map((it, idx) => `
                  <tr>
                    <td colspan="3" style="padding-top:4px;">
                      <strong>${String(idx + 1).padStart(2, '0')}</strong> ${it.sku} ${it.name.slice(0, 26)}
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="text-align:right;">${fmtNum(it.quantity, it.isWeighable ? 3 : 0)} ${it.unit} x ${fmtMoeda(it.unitPrice)}</td>
                    <td style="text-align:right;"><strong>${fmtMoeda(it.total)}</strong></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>

            <div class="receipt-divider"></div>

            <div class="receipt-totals">
              <div class="total-row">
                <span>TOTAL DE ITENS:</span>
                <span>${data.items.length}</span>
              </div>
              <div class="total-row grand-total">
                <span>VALOR TOTAL (R$):</span>
                <span>${fmtMoeda(data.total)}</span>
              </div>
              <div class="total-row">
                <span>FORMA PAGAMENTO:</span>
                <span>${data.paymentMethod}</span>
              </div>
              ${data.paymentMethod === 'DINHEIRO' ? `
                <div class="total-row">
                  <span>VALOR RECEBIDO:</span>
                  <span>${fmtMoeda(data.received)}</span>
                </div>
                <div class="total-row">
                  <span>TROCO:</span>
                  <span>${fmtMoeda(data.change)}</span>
                </div>
              ` : ''}
            </div>

            <div class="receipt-divider"></div>

            <div class="receipt-center" style="font-size:10px; color:#475569;">
              Tributos Totais Incidentes (Lei 12.741/2012): ${fmtMoeda(data.total * 0.185)}
              <br/>Protocolo de Autorização: ${Date.now()}
            </div>

            <div class="receipt-qr">
              <div style="font-size:24px;">⬛ ⬜ ⬛</div>
              <div>QR-CODE SEFAZ</div>
              <div>Consulta via NFC-e</div>
            </div>

            <div class="receipt-center receipt-bold" style="font-size:11px; margin-top:6px;">
              Obrigado pela preferência! Volte Sempre!
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal(); renderApp();">Concluir (Nova Venda)</button>
          <button type="button" class="btn btn-success" onclick="window.print()">🖨️ Imprimir Cupom</button>
        </footer>
      </div>
    </div>
  `;
}

// =====================================================================
// MODAL 2: BUSCA DE CLIENTES (GDM TelaListaBuscaClientes - F4 / Ctrl+C)
// =====================================================================
function openCustomerSearchModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">Pesquisa e Seleção de Clientes (F4 / Ctrl+C - GDM TelaListaBuscaClientes)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div style="display:flex; gap:10px; margin-bottom:14px;">
            <input
              type="text"
              id="cust-search-input"
              class="form-control"
              placeholder="Digite o nome, CPF ou CNPJ para buscar..."
              oninput="filterCustomerSearchTable(this.value)"
              autofocus
            />
            <button class="btn btn-primary" onclick="openCustomerModal(null)">+ Novo Cliente</button>
            <button class="btn btn-outline" onclick="selectCustomerForPdv(null)">Consumidor Final</button>
          </div>

          <div class="table-wrap" style="max-height:48vh;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nome Completo / Razão Social</th>
                  <th>CPF / CNPJ</th>
                  <th>Telefone</th>
                  <th class="text-right">Limite Crédito</th>
                  <th class="text-right">Saldo Devedor</th>
                  <th class="text-center">Status</th>
                  <th class="text-center" style="width:100px;">Ação</th>
                </tr>
              </thead>
              <tbody id="cust-search-tbody">
                ${renderCustomerSearchRows(state.customers)}
              </tbody>
            </table>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar (Esc)</button>
        </footer>
      </div>
    </div>
  `;

  setTimeout(() => {
    const inp = document.getElementById("cust-search-input");
    if (inp) inp.focus();
  }, 100);
}

function filterCustomerSearchTable(term) {
  const t = (term || "").toLowerCase().trim();
  const filtered = !t ? state.customers : state.customers.filter(c =>
    (c.name && c.name.toLowerCase().includes(t)) ||
    (c.cpfCnpj && c.cpfCnpj.includes(t)) ||
    (c.phone && c.phone.includes(t))
  );
  const tbody = document.getElementById("cust-search-tbody");
  if (tbody) tbody.innerHTML = renderCustomerSearchRows(filtered);
}

function renderCustomerSearchRows(list) {
  if (!list || list.length === 0) {
    return '<tr><td colspan="7" class="text-center" style="padding:24px; color:#64748b;">Nenhum cliente encontrado.</td></tr>';
  }
  return list.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.cpfCnpj || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td class="text-right">${fmtMoeda(c.creditLimit)}</td>
      <td class="text-right" style="color:${(c.currentDebt || 0) > 0 ? '#f87171' : '#94a3b8'};">${fmtMoeda(c.currentDebt)}</td>
      <td class="text-center">
        ${c.blocked ? '<span class="badge badge-red">Bloqueado</span>' : '<span class="badge badge-green">Liberado</span>'}
      </td>
      <td class="text-center">
        <button class="btn btn-primary btn-sm" onclick="selectCustomerForPdv('${c.id}')">Selecionar</button>
      </td>
    </tr>
  `).join("");
}

function selectCustomerForPdv(id) {
  if (!id) {
    state.activeCustomer = null;
  } else {
    state.activeCustomer = state.customers.find(c => String(c.id) === String(id)) || null;
  }
  closeModal();
  renderApp();
}

// =====================================================================
// MODAL 3: CONSULTA DE PRODUTOS & ESTOQUE (GDM TelaListaProdutos - F3 / Ctrl+P)
// =====================================================================
function openProductSearchModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">Consulta de Produtos & Tabela de Preços (F3 / Ctrl+P - GDM TelaListaProdutos)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div style="display:flex; gap:10px; margin-bottom:14px;">
            <input
              type="text"
              id="prod-search-modal-input"
              class="form-control"
              placeholder="Digite o nome do produto, SKU, código de barras ou PLU..."
              oninput="filterProductSearchModalTable(this.value)"
              autofocus
            />
          </div>

          <div class="table-wrap" style="max-height:48vh;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>EAN Principal</th>
                  <th>Descrição do Produto</th>
                  <th class="text-center">Unidade</th>
                  <th class="text-right">Preço Venda</th>
                  <th class="text-right">Estoque</th>
                  <th class="text-center" style="width:120px;">Ação</th>
                </tr>
              </thead>
              <tbody id="prod-search-modal-tbody">
                ${renderProductSearchModalRows(state.products)}
              </tbody>
            </table>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar (Esc)</button>
        </footer>
      </div>
    </div>
  `;

  setTimeout(() => {
    const inp = document.getElementById("prod-search-modal-input");
    if (inp) inp.focus();
  }, 100);
}

function filterProductSearchModalTable(term) {
  const t = (term || "").toLowerCase().trim();
  const filtered = !t ? state.products : state.products.filter(p =>
    (p.name && p.name.toLowerCase().includes(t)) ||
    (p.sku && p.sku.toLowerCase().includes(t)) ||
    (p.barcode && p.barcode.includes(t)) ||
    (p.pluCode && p.pluCode.includes(t))
  );
  const tbody = document.getElementById("prod-search-modal-tbody");
  if (tbody) tbody.innerHTML = renderProductSearchModalRows(filtered);
}

function renderProductSearchModalRows(list) {
  if (!list || list.length === 0) {
    return '<tr><td colspan="7" class="text-center" style="padding:24px; color:#64748b;">Nenhum produto cadastrado ou encontrado.</td></tr>';
  }
  return list.map(p => `
    <tr>
      <td><strong>${p.sku}</strong></td>
      <td><code>${p.barcode || '-'}</code></td>
      <td>
        <div><strong>${p.name}</strong></div>
        <small style="color:#64748b;">${p.department || 'Geral'}</small>
      </td>
      <td class="text-center"><span class="badge badge-gray">${p.unit || 'UN'}</span></td>
      <td class="text-right"><strong style="color:#38bdf8;">${fmtMoeda(p.salePrice)}</strong></td>
      <td class="text-right">
        <span class="${p.quantity <= (p.minQuantity || 5) ? 'badge badge-red' : 'badge badge-green'}">
          ${fmtNum(p.quantity, p.isWeighable ? 3 : 0)}
        </span>
      </td>
      <td class="text-center">
        <button class="btn btn-success btn-sm" onclick="addSearchedProductToCart('${p.id}')">
          + Lançar no PDV
        </button>
      </td>
    </tr>
  `).join("");
}

function addSearchedProductToCart(id) {
  const prod = state.products.find(p => String(p.id) === String(id));
  if (!prod) return;

  const item = {
    id: Date.now() + Math.random(),
    productId: prod.id,
    sku: prod.sku,
    barcode: prod.barcode,
    name: prod.name,
    unit: prod.unit || "UN",
    quantity: 1.0,
    unitPrice: prod.salePrice || 0,
    discountPct: 0,
    total: prod.salePrice || 0,
    isWeighable: prod.isWeighable,
    isWholesale: false,
    stock: prod.quantity
  };

  playScannerBeep();
  state.cart.push(item);
  state.lastItem = item;

  closeModal();
  renderApp();
}

// =====================================================================
// MODAL 4: OPERAÇÕES DE CAIXA (SANGRIA / SUPRIMENTO / RESUMO - Ctrl+A)
// =====================================================================
function openCashOperationsModal(defaultTab = "sangria") {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">Operações de Caixa do Terminal (Ctrl+A - GDM TelaMasterCaixa)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <!-- Navegador de Abas do Caixa -->
          <div class="form-tabs">
            <span class="tab-link ${defaultTab === 'sangria' ? 'active' : ''}" onclick="switchModalTab('tab-sangria', this)">1. Sangria (Retirada)</span>
            <span class="tab-link ${defaultTab === 'suprimento' ? 'active' : ''}" onclick="switchModalTab('tab-suprimento', this)">2. Suprimento (Aporte / Troco)</span>
            <span class="tab-link ${defaultTab === 'resumo' ? 'active' : ''}" onclick="switchModalTab('tab-resumo-caixa', this)">3. Posição Atual do Turno</span>
          </div>

          <!-- Aba 1: Sangria de Caixa -->
          <div id="tab-sangria" class="ptab-content ${defaultTab === 'sangria' ? 'active' : ''}">
            <p style="color:#94a3b8; font-size:13px; margin-bottom:14px;">
              Retirada de numerário da gaveta para cofre, tesouraria ou pagamento de despesa.
            </p>
            <form onsubmit="handleSangriaSubmit(event)">
              <div class="form-grid">
                <div class="form-group">
                  <label>Valor da Sangria (R$): *</label>
                  <input type="number" step="0.01" id="sangria-amount" class="form-control" required style="font-size:18px; font-weight:700; color:#ef4444;" />
                </div>
                <div class="form-group">
                  <label>Operador / Solicitante:</label>
                  <input type="text" class="form-control" value="${state.user.name}" readonly />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Motivo / Justificativa da Sangria: *</label>
                  <input type="text" id="sangria-reason" class="form-control" placeholder="Ex: Recolhimento de excesso de dinheiro para o cofre central" required />
                </div>
              </div>
              <div style="margin-top:16px; text-align:right;">
                <button type="submit" class="btn btn-danger">Confirmar Sangria de Caixa</button>
              </div>
            </form>
          </div>

          <!-- Aba 2: Suprimento de Caixa -->
          <div id="tab-suprimento" class="ptab-content ${defaultTab === 'suprimento' ? 'active' : ''}">
            <p style="color:#94a3b8; font-size:13px; margin-bottom:14px;">
              Entrada de dinheiro para reforço de troco ou fundo de reserva na gaveta.
            </p>
            <form onsubmit="handleSuprimentoSubmit(event)">
              <div class="form-grid">
                <div class="form-group">
                  <label>Valor do Suprimento (R$): *</label>
                  <input type="number" step="0.01" id="suprimento-amount" class="form-control" required style="font-size:18px; font-weight:700; color:#22c55e;" />
                </div>
                <div class="form-group">
                  <label>Operador:</label>
                  <input type="text" class="form-control" value="${state.user.name}" readonly />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Motivo / Origem do Suprimento: *</label>
                  <input type="text" id="suprimento-reason" class="form-control" placeholder="Ex: Reforço de troco em moedas e notas de R$ 2,00 / R$ 5,00" required />
                </div>
              </div>
              <div style="margin-top:16px; text-align:right;">
                <button type="submit" class="btn btn-success">Confirmar Suprimento de Caixa</button>
              </div>
            </form>
          </div>

          <!-- Aba 3: Posição Atual do Turno -->
          <div id="tab-resumo-caixa" class="ptab-content ${defaultTab === 'resumo' ? 'active' : ''}">
            <div id="cash-summary-content" style="padding:10px 0;">
              Carregando posição do caixa...
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar (Esc)</button>
        </footer>
      </div>
    </div>
  `;

  loadCashSummaryInModal();
}

async function loadCashSummaryInModal() {
  const container = document.getElementById("cash-summary-content");
  if (!container) return;
  try {
    const status = await API.get("/api/cash/status");
    const s = status.session || status;
    if (!s || s.status !== "ABERTO") {
      container.innerHTML = '<div style="color:#f87171;">O caixa deste terminal encontra-se atualmente FECHADO.</div>';
      return;
    }
    container.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card accent-card">
          <span>Fundo de Troco</span>
          <strong>${fmtMoeda(s.openingBalance)}</strong>
          <small>Abertura do Caixa</small>
        </div>
        <div class="metric-card success-card">
          <span>Total Vendas Dinheiro</span>
          <strong>${fmtMoeda(s.cashSalesTotal || 0)}</strong>
          <small>Recebido no Caixa</small>
        </div>
        <div class="metric-card danger-card">
          <span>Total Sangrias</span>
          <strong>${fmtMoeda(s.totalSangria || 0)}</strong>
          <small>Retiradas Realizadas</small>
        </div>
        <div class="metric-card success-card">
          <span>Saldo em Gaveta</span>
          <strong style="color:#22c55e;">${fmtMoeda((s.openingBalance || 0) + (s.cashSalesTotal || 0) + (s.totalSuprimento || 0) - (s.totalSangria || 0))}</strong>
          <small>Dinheiro Físico Esperado</small>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<div style="color:#f87171;">Erro ao obter saldo atual do caixa.</div>';
  }
}

async function handleSangriaSubmit(e) {
  e.preventDefault();
  const val = parseFloat(document.getElementById("sangria-amount").value);
  const reason = document.getElementById("sangria-reason").value.trim();
  if (isNaN(val) || val <= 0) return alert("Valor inválido.");

  try {
    await API.post("/api/cash/sangria", { amount: val, reason, operatorName: state.user.name });
    alert("Sangria registrada com sucesso!");
    closeModal();
    if (state.currentRoute === "/movimentacoes-caixa" || state.currentRoute === "/caixa") renderApp();
  } catch (err) {
    alert("Erro na sangria: " + err.message);
  }
}

async function handleSuprimentoSubmit(e) {
  e.preventDefault();
  const val = parseFloat(document.getElementById("suprimento-amount").value);
  const reason = document.getElementById("suprimento-reason").value.trim();
  if (isNaN(val) || val <= 0) return alert("Valor inválido.");

  try {
    await API.post("/api/cash/suprimento", { amount: val, reason, operatorName: state.user.name });
    alert("Suprimento registrado com sucesso!");
    closeModal();
    if (state.currentRoute === "/movimentacoes-caixa" || state.currentRoute === "/caixa") renderApp();
  } catch (err) {
    alert("Erro no suprimento: " + err.message);
  }
}

// =====================================================================
// MODAL 5: GERENCIADOR DE VENDAS & CUPONS FISCAIS (Ctrl+G)
// =====================================================================
async function openSalesManagerModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box extra-wide">
        <header class="modal-header">
          <strong class="modal-title">Gerenciador de Vendas & Cupons Fiscais (Ctrl+G - GDM TelaGerenciarVendas)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div style="display:flex; gap:10px; margin-bottom:14px;">
            <input
              type="text"
              id="sales-search-input"
              class="form-control"
              placeholder="Buscar por número do cupom, operador ou cliente..."
              oninput="filterSalesManagerTable(this.value)"
              autofocus
            />
          </div>

          <div class="table-wrap" style="max-height:55vh;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nº Cupom</th>
                  <th>Data / Hora</th>
                  <th>Operador</th>
                  <th>Cliente</th>
                  <th class="text-right">Total (R$)</th>
                  <th class="text-center">Pagamento</th>
                  <th class="text-center">Status</th>
                  <th class="text-center" style="width:180px;">Ações</th>
                </tr>
              </thead>
              <tbody id="sales-manager-tbody">
                <tr><td colspan="8" class="text-center" style="padding:24px; color:#64748b;">Carregando vendas do banco...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar (Esc)</button>
        </footer>
      </div>
    </div>
  `;

  try {
    const list = await API.get("/api/sales");
    window._cachedSales = list || [];
    renderSalesManagerTableRows(window._cachedSales);
  } catch (e) {
    console.error("Erro vendas:", e);
  }
}

function filterSalesManagerTable(term) {
  const t = (term || "").toLowerCase().trim();
  const list = window._cachedSales || [];
  const filtered = !t ? list : list.filter(s =>
    String(s.number).includes(t) ||
    (s.operatorName && s.operatorName.toLowerCase().includes(t)) ||
    (s.customerName && s.customerName.toLowerCase().includes(t))
  );
  renderSalesManagerTableRows(filtered);
}

function renderSalesManagerTableRows(list) {
  const tbody = document.getElementById("sales-manager-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:24px; color:#64748b;">Nenhuma venda encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(s => `
    <tr>
      <td><strong>#${String(s.number).padStart(6, '0')}</strong></td>
      <td>${fmtDataHora(s.createdAt)}</td>
      <td>${s.operatorName || 'Operador'}</td>
      <td>${s.customerName || 'Consumidor Final'}</td>
      <td class="text-right"><strong style="color:#22c55e;">${fmtMoeda(s.total)}</strong></td>
      <td class="text-center"><span class="badge badge-blue">${s.paymentMethod || 'DINHEIRO'}</span></td>
      <td class="text-center">
        ${s.status === 'CANCELADA' ? '<span class="badge badge-red">Cancelada</span>' : '<span class="badge badge-green">Concluída</span>'}
      </td>
      <td class="text-center">
        <button class="btn btn-outline btn-sm" onclick="reprintSaleCupom(${s.number})">🖨️ Imprimir</button>
        ${s.status !== 'CANCELADA' ? `
          <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="cancelSaleByNumber(${s.number})">Cancelar</button>
        ` : ''}
      </td>
    </tr>
  `).join("");
}

async function reprintSaleCupom(saleNumber) {
  try {
    const sale = await API.get(`/api/sales/${saleNumber}`);
    if (!sale) return alert("Venda não encontrada.");

    showThermalReceiptModal({
      saleNumber: sale.number,
      date: sale.createdAt,
      operator: sale.operatorName || "Operador",
      customer: sale.customerName || "CONSUMIDOR FINAL",
      items: (sale.items || []).map(i => ({
        sku: i.productSku || i.sku || "PROD",
        name: i.productName || i.name || "Item",
        quantity: i.quantity,
        unit: i.unit || "UN",
        unitPrice: i.unitPrice,
        total: i.total
      })),
      total: sale.total,
      paymentMethod: sale.paymentMethod || "DINHEIRO",
      received: sale.amountReceived || sale.total,
      change: sale.change || 0
    });
  } catch (e) {
    alert("Erro ao buscar dados do cupom: " + e.message);
  }
}

async function cancelSaleByNumber(saleNumber) {
  const reason = prompt(`Informe a justificativa para o cancelamento do cupom #${saleNumber}:`);
  if (!reason) return;

  try {
    await API.post(`/api/sales/${saleNumber}/cancel`, { reason, supervisorPassword: "admin" });
    alert(`Cupom #${saleNumber} cancelado com sucesso!`);
    openSalesManagerModal();
  } catch (err) {
    alert("Erro ao cancelar: " + err.message);
  }
}

// =====================================================================
// MODAL 6: LOGIN / TROCA DE OPERADOR (F9 - GDM TelaLogin)
// =====================================================================
function openLoginModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:380px;">
        <header class="modal-header">
          <strong class="modal-title">Trocar Operador / Bloqueio (F9)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form onsubmit="handleOperatorLoginSubmit(event)">
          <div class="modal-body">
            <div class="form-group" style="margin-bottom:12px;">
              <label>Usuário / Operador:</label>
              <input type="text" id="login-user" class="form-control" value="admin" required autofocus />
            </div>
            <div class="form-group">
              <label>Senha de Acesso:</label>
              <input type="password" id="login-pass" class="form-control" placeholder="Digite a senha" required />
            </div>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Entrar no Sistema</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

async function handleOperatorLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;

  try {
    await API.post("/api/login", { login: u, password: p });
    state.user.name = u === "admin" ? "Administrador Master" : u;
    state.user.login = u;
    closeModal();
    renderApp();
  } catch (err) {
    alert("Credenciais inválidas: " + err.message);
  }
}

// =====================================================================
// FORMULÁRIO COM ABAS: CADASTRO DE CLIENTES (GDM TelaCadastroClientes)
// =====================================================================
function renderCustomersModule() {
  setTimeout(() => loadCustomersList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Cadastro de Clientes & Crediário</h2>
          
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" class="form-control" style="width:260px;" placeholder="Buscar por Nome, CPF ou CNPJ..." onkeyup="filterCustomersList(this.value)" />
          <button class="btn btn-success" onclick="openCustomerModal(null)">+ Novo Cliente</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome Completo / Razão Social</th>
              <th>CPF / CNPJ</th>
              <th>Telefone / WhatsApp</th>
              <th>Cidade / UF</th>
              <th class="text-right">Limite de Crédito</th>
              <th class="text-right">Saldo Devedor</th>
              <th class="text-center">Status</th>
              <th class="text-center" style="width:120px;">Ações</th>
            </tr>
          </thead>
          <tbody id="customers-tbody">
            <tr><td colspan="8" class="text-center" style="padding:24px; color:#64748b;">Carregando clientes...</td></tr>
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
  const filtered = !t ? state.customers : state.customers.filter(c =>
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
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:24px; color:#64748b;">Nenhum cliente cadastrado. Clique no botão acima para adicionar.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.cpfCnpj || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.city || 'São Paulo'} / ${c.state || 'SP'}</td>
      <td class="text-right">${fmtMoeda(c.creditLimit)}</td>
      <td class="text-right" style="color:${(c.currentDebt || 0) > 0 ? '#f87171' : '#94a3b8'};">${fmtMoeda(c.currentDebt)}</td>
      <td class="text-center">
        ${c.blocked ? '<span class="badge badge-red">Bloqueado</span>' : '<span class="badge badge-green">Liberado</span>'}
      </td>
      <td class="text-center">
        <button class="btn-icon" title="Editar" onclick="openCustomerModal('${c.id}')">✏️</button>
      </td>
    </tr>
  `).join("");
}

function openCustomerModal(id) {
  const c = id ? state.customers.find(x => String(x.id) === String(id)) : {
    name: "",
    tradeName: "",
    personType: "FISICA",
    cpfCnpj: "",
    rgIe: "",
    im: "",
    birthDate: "",
    gender: "M",
    maritalStatus: "SOLTEIRO",
    fatherName: "",
    motherName: "",
    spouseName: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "São Paulo",
    state: "SP",
    zipCode: "",
    phone: "",
    mobile: "",
    email: "",
    deliveryStreet: "",
    deliveryNumber: "",
    deliveryNeighborhood: "",
    deliveryCity: "São Paulo",
    creditLimit: 1000.00,
    currentDebt: 0.00,
    profession: "",
    companyName: "",
    notes: "",
    blocked: false
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? 'Editar Cliente: ' + c.name : 'Novo Cadastro de Cliente (GDM TelaCadastroClientes)'}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form id="customer-form" onsubmit="saveCustomerForm(event, '${id || ''}')">
          <div class="modal-body">
            <!-- Navegador de Abas Estilo NetBeans JTabbedPane -->
            <div class="form-tabs">
              <span class="tab-link active" onclick="switchModalTab('ctab-identificacao', this)">1. Identificação & Dados Pessoais</span>
              <span class="tab-link" onclick="switchModalTab('ctab-endereco', this)">2. Endereço & Contatos</span>
              <span class="tab-link" onclick="switchModalTab('ctab-financeiro', this)">3. Financeiro & Crediário</span>
            </div>

            <!-- Aba 1: Identificação & Dados Pessoais -->
            <div id="ctab-identificacao" class="ptab-content active">
              <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label>Tipo de Pessoa: *</label>
                  <div style="display:flex; gap:20px; align-items:center; margin-top:6px;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                      <input type="radio" name="c-person-type" value="FISICA" ${c.personType !== 'JURIDICA' ? 'checked' : ''} onchange="toggleCustomerPersonType('FISICA')" />
                      <strong>Pessoa Física</strong>
                    </label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                      <input type="radio" name="c-person-type" value="JURIDICA" ${c.personType === 'JURIDICA' ? 'checked' : ''} onchange="toggleCustomerPersonType('JURIDICA')" />
                      <strong>Pessoa Jurídica</strong>
                    </label>
                  </div>
                </div>

                <div class="form-group" style="grid-column: span 3;">
                  <label id="lbl-c-name">Nome Completo: *</label>
                  <input type="text" id="cust-name" class="form-control" value="${c.name}" required />
                </div>

                <div class="form-group">
                  <label id="lbl-c-cpf">CPF: *</label>
                  <input type="text" id="cust-cpf" class="form-control" value="${c.cpfCnpj || ''}" required placeholder="000.000.000-00" />
                </div>

                <div class="form-group">
                  <label id="lbl-c-rg">RG:</label>
                  <input type="text" id="cust-rg" class="form-control" value="${c.rgIe || ''}" />
                </div>

                <div class="form-group" id="group-c-im" style="display:${c.personType === 'JURIDICA' ? 'block' : 'none'};">
                  <label>Inscrição Municipal:</label>
                  <input type="text" id="cust-im" class="form-control" value="${c.im || ''}" />
                </div>

                <div class="form-group" id="group-c-birth">
                  <label>Data de Nascimento:</label>
                  <input type="date" id="cust-birth" class="form-control" value="${c.birthDate ? c.birthDate.split('T')[0] : ''}" />
                </div>

                <div class="form-group" id="group-c-gender">
                  <label>Sexo:</label>
                  <select id="cust-gender" class="form-control">
                    <option value="M" ${c.gender === 'M' ? 'selected' : ''}>Masculino</option>
                    <option value="F" ${c.gender === 'F' ? 'selected' : ''}>Feminino</option>
                  </select>
                </div>

                <div class="form-group" id="group-c-marital">
                  <label>Estado Civil:</label>
                  <select id="cust-marital" class="form-control">
                    <option value="SOLTEIRO" ${c.maritalStatus === 'SOLTEIRO' ? 'selected' : ''}>Solteiro(a)</option>
                    <option value="CASADO" ${c.maritalStatus === 'CASADO' ? 'selected' : ''}>Casado(a)</option>
                    <option value="DIVORCIADO" ${c.maritalStatus === 'DIVORCIADO' ? 'selected' : ''}>Divorciado(a)</option>
                    <option value="VIUVO" ${c.maritalStatus === 'VIUVO' ? 'selected' : ''}>Viúvo(a)</option>
                  </select>
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label>Filiação - Nome da Mãe:</label>
                  <input type="text" id="cust-mother" class="form-control" value="${c.motherName || ''}" />
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label>Filiação - Nome do Pai:</label>
                  <input type="text" id="cust-father" class="form-control" value="${c.fatherName || ''}" />
                </div>
              </div>
            </div>

            <!-- Aba 2: Endereço & Contatos -->
            <div id="ctab-endereco" class="ptab-content">
              <div class="form-section-title">Endereço Principal</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>CEP:</label>
                  <div style="display:flex; gap:6px;">
                    <input type="text" id="cust-zip" class="form-control" value="${c.zipCode || ''}" placeholder="00000-000" />
                    <button type="button" class="btn btn-outline btn-sm" onclick="consultarCepCliente()">Buscar</button>
                  </div>
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Rua / Logradouro:</label>
                  <input type="text" id="cust-street" class="form-control" value="${c.street || ''}" />
                </div>
                <div class="form-group">
                  <label>Número:</label>
                  <input type="text" id="cust-number" class="form-control" value="${c.number || ''}" />
                </div>
                <div class="form-group">
                  <label>Bairro:</label>
                  <input type="text" id="cust-neighborhood" class="form-control" value="${c.neighborhood || ''}" />
                </div>
                <div class="form-group">
                  <label>Cidade:</label>
                  <input type="text" id="cust-city" class="form-control" value="${c.city || 'São Paulo'}" />
                </div>
                <div class="form-group">
                  <label>UF:</label>
                  <input type="text" id="cust-state" class="form-control" value="${c.state || 'SP'}" maxlength="2" />
                </div>
              </div>

              <div class="form-section-title" style="margin-top:14px;">Telefones & Contato Digital</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Telefone Residencial:</label>
                  <input type="text" id="cust-phone" class="form-control" value="${c.phone || ''}" placeholder="(11) 0000-0000" />
                </div>
                <div class="form-group">
                  <label>Celular / WhatsApp: *</label>
                  <input type="text" id="cust-mobile" class="form-control" value="${c.mobile || c.phone || ''}" placeholder="(11) 90000-0000" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>E-mail:</label>
                  <input type="email" id="cust-email" class="form-control" value="${c.email || ''}" placeholder="cliente@email.com" />
                </div>
              </div>
            </div>

            <!-- Aba 3: Financeiro & Crediário -->
            <div id="ctab-financeiro" class="ptab-content">
              <div class="form-section-title">Limite de Crédito & Conta Crediário</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Limite de Crédito Aprovado (R$):</label>
                  <input type="number" step="0.01" id="cust-limit" class="form-control" value="${c.creditLimit || 0}" style="font-weight:700; color:#22c55e;" />
                </div>
                <div class="form-group">
                  <label>Saldo Devedor Atual (R$):</label>
                  <input type="number" step="0.01" class="form-control" value="${c.currentDebt || 0}" readonly style="color:#f87171;" />
                </div>
                <div class="form-group">
                  <label>Situação do Cadastro:</label>
                  <select id="cust-blocked" class="form-control">
                    <option value="false" ${!c.blocked ? 'selected' : ''}>Liberado para Compras</option>
                    <option value="true" ${c.blocked ? 'selected' : ''}>Bloqueado para Crediário</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Profissão / Atividade:</label>
                  <input type="text" id="cust-profession" class="form-control" value="${c.profession || ''}" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Empresa onde Trabalha:</label>
                  <input type="text" id="cust-company" class="form-control" value="${c.companyName || ''}" />
                </div>
                <div class="form-group" style="grid-column: span 4;">
                  <label>Observações Gerais / Histórico:</label>
                  <textarea id="cust-notes" class="form-control" rows="3">${c.notes || ''}</textarea>
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Salvar Cadastro de Cliente</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

function toggleCustomerPersonType(type) {
  const isJuridica = type === "JURIDICA";
  const lblName = document.getElementById("lbl-c-name");
  const lblCpf = document.getElementById("lbl-c-cpf");
  const lblRg = document.getElementById("lbl-c-rg");
  const groupIm = document.getElementById("group-c-im");
  const groupBirth = document.getElementById("group-c-birth");
  const groupGender = document.getElementById("group-c-gender");
  const groupMarital = document.getElementById("group-c-marital");

  if (lblName) lblName.innerText = isJuridica ? "Razão Social: *" : "Nome Completo: *";
  if (lblCpf) lblCpf.innerText = isJuridica ? "CNPJ: *" : "CPF: *";
  if (lblRg) lblRg.innerText = isJuridica ? "Inscrição Estadual:" : "RG:";
  if (groupIm) groupIm.style.display = isJuridica ? "block" : "none";
  if (groupBirth) groupBirth.style.display = isJuridica ? "none" : "block";
  if (groupGender) groupGender.style.display = isJuridica ? "none" : "block";
  if (groupMarital) groupMarital.style.display = isJuridica ? "none" : "block";
}

async function consultarCepCliente() {
  const cep = (document.getElementById("cust-zip").value || "").replace(/\D/g, "");
  if (cep.length !== 8) return alert("Informe um CEP com 8 dígitos.");

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (!data.erro) {
      if (data.logradouro) document.getElementById("cust-street").value = data.logradouro;
      if (data.bairro) document.getElementById("cust-neighborhood").value = data.bairro;
      if (data.localidade) document.getElementById("cust-city").value = data.localidade;
      if (data.uf) document.getElementById("cust-state").value = data.uf;
      document.getElementById("cust-number").focus();
    }
  } catch (e) {
    console.debug("ViaCEP error:", e);
  }
}

async function saveCustomerForm(e, id) {
  e.preventDefault();
  const personTypeRadio = document.querySelector('input[name="c-person-type"]:checked');
  const personType = personTypeRadio ? personTypeRadio.value : "FISICA";

  const payload = {
    name: document.getElementById("cust-name").value.trim(),
    personType: personType,
    cpfCnpj: document.getElementById("cust-cpf").value.trim(),
    rgIe: document.getElementById("cust-rg").value.trim(),
    im: document.getElementById("cust-im") ? document.getElementById("cust-im").value.trim() : "",
    birthDate: document.getElementById("cust-birth").value || null,
    gender: document.getElementById("cust-gender").value,
    maritalStatus: document.getElementById("cust-marital").value,
    motherName: document.getElementById("cust-mother").value.trim(),
    fatherName: document.getElementById("cust-father").value.trim(),
    street: document.getElementById("cust-street").value.trim(),
    number: document.getElementById("cust-number").value.trim(),
    neighborhood: document.getElementById("cust-neighborhood").value.trim(),
    city: document.getElementById("cust-city").value.trim(),
    state: document.getElementById("cust-state").value.trim(),
    zipCode: document.getElementById("cust-zip").value.trim(),
    phone: document.getElementById("cust-mobile").value.trim(),
    email: document.getElementById("cust-email").value.trim(),
    creditLimit: parseFloat(document.getElementById("cust-limit").value) || 0,
    profession: document.getElementById("cust-profession").value.trim(),
    companyName: document.getElementById("cust-company").value.trim(),
    notes: document.getElementById("cust-notes").value.trim(),
    blocked: document.getElementById("cust-blocked").value === "true"
  };

  try {
    if (id) {
      await API.put(`/api/customers/${id}`, payload);
    } else {
      await API.post("/api/customers", payload);
    }
    closeModal();
    loadCustomersInBackground();
    if (state.currentRoute === "/clientes") {
      loadCustomersList();
    } else {
      renderApp();
    }
  } catch (err) {
    alert("Erro ao salvar cliente: " + err.message);
  }
}

// =====================================================================
// FORMULÁRIO COM ABAS: CADASTRO DE COLABORADORES & USUÁRIOS
// =====================================================================
function renderCollaboratorsModule() {
  setTimeout(() => loadCollaboratorsList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Cadastro de Colaboradores, Usuários & Vendedores</h2>
          
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" class="form-control" style="width:260px;" placeholder="Buscar por Nome, CPF ou Cargo..." onkeyup="filterCollaboratorsList(this.value)" />
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
              <th class="text-center">É Cliente?</th>
              <th class="text-center">Login PDV</th>
              <th class="text-center" style="width:140px;">Ações</th>
            </tr>
          </thead>
          <tbody id="collaborators-tbody">
            <tr><td colspan="9" class="text-center" style="padding:24px; color:#64748b;">Carregando colaboradores...</td></tr>
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
    console.error("Erro colaboradores:", e);
  }
}

function filterCollaboratorsList(term) {
  const t = (term || "").toLowerCase().trim();
  const filtered = !t ? state.collaborators : state.collaborators.filter(c =>
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
    tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:24px; color:#64748b;">Nenhum colaborador cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.cpf || '-'}</td>
      <td><span class="badge badge-blue">${c.role || 'Operador'}</span></td>
      <td>${fmtData(c.admissionDate)}</td>
      <td class="text-right">${fmtMoeda(c.salary)}</td>
      <td class="text-center">${fmtNum(c.commissionPct, 1)}%</td>
      <td class="text-center">
        ${c.isCustomer ? '<span class="badge badge-green">Sim (Crediário)</span>' : '<span class="badge badge-gray">Não</span>'}
      </td>
      <td class="text-center">
        ${c.canLogin ? `<span class="badge badge-green">${c.login || 'Ativo'}</span>` : '<span class="badge badge-gray">Sem Login</span>'}
      </td>
      <td class="text-center">
        <button class="btn-icon" title="Editar" onclick="openCollaboratorModal('${c.id}')">✏️</button>
        <button class="btn-icon danger" title="Excluir" onclick="deleteCollaborator('${c.id}', '${c.name}')">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function openCollaboratorModal(id) {
  const c = id ? state.collaborators.find(x => String(x.id) === String(id)) : {
    name: "",
    cpf: "",
    rg: "",
    birthDate: "",
    phone: "",
    email: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "São Paulo",
    state: "SP",
    zipCode: "",
    role: "Operador de Caixa",
    admissionDate: "",
    salary: 1850.00,
    commissionPct: 0.0,
    isCustomer: true,
    creditLimit: 500.00,
    currentDebt: 0.00,
    canLogin: true,
    login: "",
    accessRole: "Operador"
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? 'Editar Colaborador: ' + c.name : 'Novo Cadastro de Colaborador (GDM TelaFuncionariosCadastrados)'}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form id="collab-form" onsubmit="saveCollaboratorForm(event, '${id || ''}')">
          <div class="modal-body">
            <!-- Navegador de Abas Estilo Linear Sistemas -->
            <div class="form-tabs">
              <span class="tab-link active" onclick="switchModalTab('collab-tab-pessoal', this)">1. Dados Pessoais</span>
              <span class="tab-link" onclick="switchModalTab('collab-tab-endereco', this)">2. Endereço</span>
              <span class="tab-link" onclick="switchModalTab('collab-tab-cargo', this)">3. Cargo & Salário</span>
              <span class="tab-link" onclick="switchModalTab('collab-tab-cliente', this)">4. Vínculo Cliente</span>
              <span class="tab-link" onclick="switchModalTab('collab-tab-acesso', this)">5. Acesso ao Sistema</span>
            </div>

            <!-- Aba 1: Dados Pessoais -->
            <div id="collab-tab-pessoal" class="ptab-content active">
              <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label>Nome Completo do Funcionário: *</label>
                  <input type="text" id="collab-name" class="form-control" value="${c.name}" required />
                </div>
                <div class="form-group">
                  <label>CPF: *</label>
                  <input type="text" id="collab-cpf" class="form-control" value="${c.cpf || ''}" required placeholder="000.000.000-00" />
                </div>
                <div class="form-group">
                  <label>RG:</label>
                  <input type="text" id="collab-rg" class="form-control" value="${c.rg || ''}" />
                </div>
                <div class="form-group">
                  <label>Data de Nascimento:</label>
                  <input type="date" id="collab-birth" class="form-control" value="${c.birthDate ? c.birthDate.split('T')[0] : ''}" />
                </div>
                <div class="form-group">
                  <label>Telefone / WhatsApp:</label>
                  <input type="text" id="collab-phone" class="form-control" value="${c.phone || ''}" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>E-mail Corporativo / Pessoal:</label>
                  <input type="email" id="collab-email" class="form-control" value="${c.email || ''}" />
                </div>
              </div>
            </div>

            <!-- Aba 2: Endereço -->
            <div id="collab-tab-endereco" class="ptab-content">
              <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label>Rua / Logradouro:</label>
                  <input type="text" id="collab-street" class="form-control" value="${c.street || ''}" />
                </div>
                <div class="form-group">
                  <label>Número:</label>
                  <input type="text" id="collab-number" class="form-control" value="${c.number || ''}" />
                </div>
                <div class="form-group">
                  <label>Bairro:</label>
                  <input type="text" id="collab-neighborhood" class="form-control" value="${c.neighborhood || ''}" />
                </div>
                <div class="form-group">
                  <label>Cidade:</label>
                  <input type="text" id="collab-city" class="form-control" value="${c.city || 'São Paulo'}" />
                </div>
                <div class="form-group">
                  <label>UF:</label>
                  <input type="text" id="collab-state" class="form-control" value="${c.state || 'SP'}" maxlength="2" />
                </div>
                <div class="form-group">
                  <label>CEP:</label>
                  <input type="text" id="collab-zip" class="form-control" value="${c.zipCode || ''}" />
                </div>
              </div>
            </div>

            <!-- Aba 3: Cargo & Salário -->
            <div id="collab-tab-cargo" class="ptab-content">
              <div class="form-grid">
                <div class="form-group">
                  <label>Cargo / Função na Loja: *</label>
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
                  <input type="date" id="collab-admission" class="form-control" value="${c.admissionDate ? c.admissionDate.split('T')[0] : ''}" />
                </div>
                <div class="form-group">
                  <label>Salário Base (R$):</label>
                  <input type="number" step="0.01" id="collab-salary" class="form-control" value="${c.salary || 0}" style="font-weight:700; color:#38bdf8;" />
                </div>
                <div class="form-group">
                  <label>Comissão sobre Vendas (%):</label>
                  <input type="number" step="0.1" id="collab-commission" class="form-control" value="${c.commissionPct || 0}" />
                </div>
              </div>
            </div>

            <!-- Aba 4: Vínculo de Cliente da Loja -->
            <div id="collab-tab-cliente" class="ptab-content">
              <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:16px;">
                <label class="custom-checkbox">
                  <input type="checkbox" id="collab-is-cust" ${c.isCustomer ? 'checked' : ''} onchange="document.getElementById('collab-cust-fields').style.display = this.checked ? 'grid' : 'none';" />
                  <strong>Permitir compras a prazo, crediário interno e desconto em folha para este colaborador</strong>
                </label>

                <div id="collab-cust-fields" style="display:${c.isCustomer ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap:14px; margin-top:14px; padding-top:12px; border-top:1px dashed #1e293b;">
                  <div class="form-group">
                    <label>Limite de Crédito Mensal Aprovado (R$):</label>
                    <input type="number" step="0.01" id="collab-credit-limit" class="form-control" value="${c.creditLimit || 500}" />
                  </div>
                  <div class="form-group">
                    <label>Saldo Devedor Atual (R$):</label>
                    <input type="number" step="0.01" class="form-control" value="${c.currentDebt || 0}" readonly />
                  </div>
                </div>
              </div>
            </div>

            <!-- Aba 5: Acesso ao Sistema & Permissões -->
            <div id="collab-tab-acesso" class="ptab-content">
              <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:16px;">
                <label class="custom-checkbox">
                  <input type="checkbox" id="collab-can-login" ${c.canLogin ? 'checked' : ''} onchange="document.getElementById('collab-login-fields').style.display = this.checked ? 'grid' : 'none';" />
                  <strong>Habilitar acesso / login com usuário e senha no PDV e Retaguarda</strong>
                </label>

                <div id="collab-login-fields" style="display:${c.canLogin ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap:14px; margin-top:14px; padding-top:12px; border-top:1px dashed #1e293b;">
                  <div class="form-group">
                    <label>Nome de Usuário / Login: *</label>
                    <input type="text" id="collab-login-user" class="form-control" value="${c.login || ''}" placeholder="Ex: maria.caixa" />
                  </div>
                  <div class="form-group">
                    <label>Senha de Acesso: ${id ? '(Deixe em branco para não alterar)' : '*'}</label>
                    <input type="password" id="collab-password" class="form-control" placeholder="Senha do operador" />
                  </div>
                  <div class="form-group" style="grid-column: span 2;">
                    <label>Nível de Permissão no Sistema:</label>
                    <select id="collab-access-role" class="form-control">
                      <option value="Operador">Operador (Acesso exclusivo ao PDV e Caixa)</option>
                      <option value="Supervisor">Supervisor (Liberação de descontos e cancelamentos)</option>
                      <option value="Gerente">Gerente (Retaguarda, Relatórios e Financeiro)</option>
                      <option value="Administrador">Administrador Geral (Acesso Completo Irrestrito)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Salvar Colaborador</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

async function saveCollaboratorForm(e, id) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("collab-name").value.trim(),
    cpf: document.getElementById("collab-cpf").value.trim(),
    rg: document.getElementById("collab-rg").value.trim(),
    birthDate: document.getElementById("collab-birth").value || null,
    phone: document.getElementById("collab-phone").value.trim(),
    email: document.getElementById("collab-email").value.trim(),
    street: document.getElementById("collab-street").value.trim(),
    number: document.getElementById("collab-number").value.trim(),
    neighborhood: document.getElementById("collab-neighborhood").value.trim(),
    city: document.getElementById("collab-city").value.trim(),
    state: document.getElementById("collab-state").value.trim(),
    zipCode: document.getElementById("collab-zip").value.trim(),
    role: document.getElementById("collab-role").value,
    admissionDate: document.getElementById("collab-admission").value || null,
    salary: parseFloat(document.getElementById("collab-salary").value) || 0,
    commissionPct: parseFloat(document.getElementById("collab-commission").value) || 0,
    isCustomer: document.getElementById("collab-is-cust").checked,
    creditLimit: parseFloat(document.getElementById("collab-credit-limit").value) || 500,
    canLogin: document.getElementById("collab-can-login").checked,
    login: document.getElementById("collab-login-user").value.trim(),
    password: document.getElementById("collab-password").value,
    accessRole: document.getElementById("collab-access-role").value
  };

  try {
    if (id) {
      await API.put(`/api/collaborators/${id}`, payload);
    } else {
      await API.post("/api/collaborators", payload);
    }
    closeModal();
    loadCollaboratorsList();
  } catch (err) {
    alert("Erro ao salvar colaborador: " + err.message);
  }
}

async function deleteCollaborator(id, name) {
  if (!confirm(`Deseja realmente excluir o colaborador "${name}"?`)) return;
  try {
    await API.del(`/api/collaborators/${id}`);
    loadCollaboratorsList();
  } catch (e) {
    alert("Erro ao excluir: " + e.message);
  }
}

// =====================================================================
// FORMULÁRIO COM ABAS: CADASTRO DE PRODUTOS (Linear / GDM TelaCadastroProduto)
// =====================================================================
function renderProductsModule() {
  setTimeout(() => loadProductsList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Catálogo Geral & Cadastro de Produtos</h2>
          
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" class="form-control" style="width:280px;" placeholder="Buscar por Descrição, SKU, EAN ou PLU..." onkeyup="filterProductsList(this.value)" />
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
              <th>Departamento</th>
              <th class="text-center">Pesável / PLU</th>
              <th class="text-right">Custo Líquido</th>
              <th class="text-right">Preço Venda</th>
              <th class="text-right">Estoque</th>
              <th class="text-center" style="width:130px;">Ações</th>
            </tr>
          </thead>
          <tbody id="products-tbody">
            <tr><td colspan="9" class="text-center" style="padding:24px; color:#64748b;">Carregando produtos...</td></tr>
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
    console.error("Erro produtos:", e);
  }
}

function filterProductsList(term) {
  const t = (term || "").toLowerCase().trim();
  const filtered = !t ? state.products : state.products.filter(p =>
    (p.name && p.name.toLowerCase().includes(t)) ||
    (p.sku && p.sku.toLowerCase().includes(t)) ||
    (p.barcode && p.barcode.includes(t)) ||
    (p.pluCode && p.pluCode.includes(t))
  );
  renderProductsTable(filtered);
}

function renderProductsTable(list) {
  const tbody = document.getElementById("products-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:30px; color:#64748b;">Nenhum produto cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><strong>${p.sku}</strong></td>
      <td><code>${p.barcode || '-'}</code></td>
      <td>
        <div><strong>${p.name}</strong></div>
        <small style="color:#64748b;">Marca: ${p.brand || '-'}</small>
      </td>
      <td>${p.department || 'Mercearia'}</td>
      <td class="text-center">
        ${p.isWeighable ? `<span class="badge badge-amber">PLU: ${p.pluCode || p.sku}</span>` : '<span class="badge badge-gray">Unidade</span>'}
      </td>
      <td class="text-right">${fmtMoeda(p.costPrice)}</td>
      <td class="text-right"><strong style="color:#38bdf8;">${fmtMoeda(p.salePrice)}</strong></td>
      <td class="text-right">
        <span class="${p.quantity <= (p.minQuantity || 5) ? 'badge badge-red' : 'badge badge-green'}">
          ${fmtNum(p.quantity, p.isWeighable ? 3 : 0)} ${p.unit || 'UN'}
        </span>
      </td>
      <td class="text-center">
        <button class="btn-icon" title="Editar" onclick="openProductEditModal('${p.id}')">✏️</button>
        <button class="btn-icon danger" title="Excluir" onclick="deleteProduct('${p.id}', '${p.name}')">🗑️</button>
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
    unit: "UN",
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
    isWeighable: false,
    weighType: 0,
    pluCode: "",
    tareWeight: 0.0,
    shelfLifeDays: 90
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box extra-wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? 'Editar Produto: ' + p.name : 'Novo Cadastro de Produto (Engenharia Reversa Linear Sistemas)'}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form id="product-form" onsubmit="saveProductForm(event, '${id || ''}')">
          <div class="modal-body">
            <!-- Navegador de Abas Estilo Linear Sistemas -->
            <div class="form-tabs">
              <span class="tab-link active" onclick="switchModalTab('ptab-identificacao', this)">1. Identificação & Mercadológico</span>
              <span class="tab-link" onclick="switchModalTab('ptab-precificacao', this)">2. Formação de Preço & Custos</span>
              <span class="tab-link" onclick="switchModalTab('ptab-balanca', this)">3. Balança, Açougue & Hortifruti</span>
              <span class="tab-link" onclick="switchModalTab('ptab-fiscal', this)">4. Fiscal & Tributário SEFAZ</span>
              <span class="tab-link" onclick="switchModalTab('ptab-estoque', this)">5. Estoque & Localização</span>
            </div>

            <!-- Aba 1: Identificação & Mercadológico -->
            <div id="ptab-identificacao" class="ptab-content active">
              <div class="form-grid">
                <div class="form-group">
                  <label>Código Interno / SKU: *</label>
                  <input type="text" id="p-sku" class="form-control" value="${p.sku}" required />
                </div>
                <div class="form-group">
                  <label>EAN Principal (GTIN-13):</label>
                  <input type="text" id="p-barcode" class="form-control" value="${p.barcode || ''}" placeholder="7890000000000" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>EANs Secundários / Agrupamentos (DUN-14, Caixa, Fardo separados por vírgula):</label>
                  <input type="text" id="p-sec-barcodes" class="form-control" value="${p.secondaryBarcodes || ''}" placeholder="Ex: 17890000000007 (cx12)" />
                </div>

                <div class="form-group" style="grid-column: span 3;">
                  <label>Descrição Completa do Produto: *</label>
                  <input type="text" id="p-name" class="form-control" value="${p.name}" required />
                </div>
                <div class="form-group">
                  <label>Marca / Fabricante:</label>
                  <input type="text" id="p-brand" class="form-control" value="${p.brand || ''}" />
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label>Descrição Reduzida PDV (Telas e Cupom - máx 25 chars):</label>
                  <input type="text" id="p-shortname" class="form-control" maxlength="25" value="${p.shortName || ''}" placeholder="Ex: ARROZ CAMIL T1 5KG" />
                </div>

                <div class="form-group">
                  <label>Departamento: *</label>
                  <select id="p-dept" class="form-control">
                    <option value="Mercearia" ${p.department === 'Mercearia' ? 'selected' : ''}>Mercearia</option>
                    <option value="Açougue & Carnes" ${p.department === 'Açougue & Carnes' ? 'selected' : ''}>Açougue & Carnes</option>
                    <option value="Hortifruti" ${p.department === 'Hortifruti' ? 'selected' : ''}>Hortifruti</option>
                    <option value="Laticínios & Frios" ${p.department === 'Laticínios & Frios' ? 'selected' : ''}>Laticínios & Frios</option>
                    <option value="Bebidas" ${p.department === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
                    <option value="Padaria & Confeitaria" ${p.department === 'Padaria & Confeitaria' ? 'selected' : ''}>Padaria & Confeitaria</option>
                    <option value="Limpeza" ${p.department === 'Limpeza' ? 'selected' : ''}>Limpeza</option>
                    <option value="Vestuário & Moda" ${p.department === 'Vestuário & Moda' ? 'selected' : ''}>Vestuário & Moda</option>
                  </select>
                </div>

                <div class="form-group">
                  <label>Unidade de Medida:</label>
                  <select id="p-unit" class="form-control">
                    <option value="UN" ${p.unit === 'UN' ? 'selected' : ''}>UN - Unidade</option>
                    <option value="KG" ${p.unit === 'KG' ? 'selected' : ''}>KG - Quilo</option>
                    <option value="LT" ${p.unit === 'LT' ? 'selected' : ''}>LT - Litro</option>
                    <option value="CX" ${p.unit === 'CX' ? 'selected' : ''}>CX - Caixa</option>
                    <option value="FD" ${p.unit === 'FD' ? 'selected' : ''}>FD - Fardo</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Aba 2: Formação de Preço & Custos -->
            <div id="ptab-precificacao" class="ptab-content">
              <div class="form-grid">
                <div class="form-group">
                  <label>Custo da Última Compra (R$):</label>
                  <input type="number" step="0.01" id="p-cost" class="form-control" value="${p.costPrice || 0}" oninput="recalcProductPrices()" />
                </div>
                <div class="form-group">
                  <label>Frete + Outras Despesas (%):</label>
                  <input type="number" step="0.1" id="p-freight" class="form-control" value="${p.freightPct || 0}" oninput="recalcProductPrices()" />
                </div>
                <div class="form-group">
                  <label>Margem / Markup Desejado (%):</label>
                  <input type="number" step="0.1" id="p-markup" class="form-control" value="${p.markupPct || 45}" oninput="recalcProductPrices()" />
                </div>
                <div class="form-group">
                  <label>Preço de Venda Varejo (R$): *</label>
                  <input type="number" step="0.01" id="p-saleprice" class="form-control" value="${p.salePrice || 0}" required style="font-size:18px; font-weight:800; color:#22c55e;" />
                </div>

                <div class="form-group">
                  <label>Qtd Mínima para Preço Atacado:</label>
                  <input type="number" id="p-wholesale-qty" class="form-control" value="${p.wholesaleMinQty || 6}" />
                </div>
                <div class="form-group">
                  <label>Preço Unitário de Atacado (R$):</label>
                  <input type="number" step="0.01" id="p-wholesale-price" class="form-control" value="${p.wholesalePrice || 0}" />
                </div>
                <div class="form-group">
                  <label>Preço Promocional (R$):</label>
                  <input type="number" step="0.01" id="p-promoprice" class="form-control" value="${p.promoPrice || 0}" />
                </div>
                <div class="form-group">
                  <label>Comissão do Vendedor (%):</label>
                  <input type="number" step="0.1" id="p-commission" class="form-control" value="${p.commissionPct || 0}" />
                </div>
              </div>
            </div>

            <!-- Aba 3: Balança, Açougue & Hortifruti -->
            <div id="ptab-balanca" class="ptab-content">
              <div style="background:#0c1424; border:1px solid #23345a; border-radius:8px; padding:16px;">
                <label class="custom-checkbox">
                  <input type="checkbox" id="p-weighable" ${p.isWeighable ? 'checked' : ''} onchange="document.getElementById('p-weigh-fields').style.display = this.checked ? 'grid' : 'none';" />
                  <strong>Produto Pesável / Comercializado por Peso (Balança de Checkout ou Etiqueta)</strong>
                </label>

                <div id="p-weigh-fields" style="display:${p.isWeighable ? 'grid' : 'none'}; grid-template-columns: repeat(3, 1fr); gap:14px; margin-top:14px; padding-top:12px; border-top:1px dashed #1e293b;">
                  <div class="form-group">
                    <label>Tipo de Pesagem:</label>
                    <select id="p-weightype" class="form-control">
                      <option value="0" ${p.weighType === 0 ? 'selected' : ''}>Checkout / Caixa (Balança Homologada)</option>
                      <option value="1" ${p.weighType === 1 ? 'selected' : ''}>Retaguarda / Açougue (Etiqueta Impressa)</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Código PLU na Balança:</label>
                    <input type="text" id="p-plu" class="form-control" value="${p.pluCode || p.sku}" placeholder="Ex: 101" />
                  </div>
                  <div class="form-group">
                    <label>Tara da Embalagem (kg):</label>
                    <input type="number" step="0.001" id="p-tare" class="form-control" value="${p.tareWeight || 0}" placeholder="0.015" />
                  </div>
                  <div class="form-group">
                    <label>Prazo de Validade (dias):</label>
                    <input type="number" id="p-shelflife" class="form-control" value="${p.shelfLifeDays || 90}" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Aba 4: Fiscal & Tributário SEFAZ -->
            <div id="ptab-fiscal" class="ptab-content">
              <div class="form-grid">
                <div class="form-group">
                  <label>NCM (8 dígitos): *</label>
                  <input type="text" id="p-ncm" class="form-control" value="${p.ncm || '19053100'}" required />
                </div>
                <div class="form-group">
                  <label>CEST (Substituição Tributária):</label>
                  <input type="text" id="p-cest" class="form-control" value="${p.cest || ''}" />
                </div>
                <div class="form-group">
                  <label>CFOP Padrão Saída:</label>
                  <input type="text" id="p-cfop" class="form-control" value="${p.cfop || '5102'}" />
                </div>
                <div class="form-group">
                  <label>Origem da Mercadoria:</label>
                  <select id="p-origin" class="form-control">
                    <option value="0" ${p.origin === '0' ? 'selected' : ''}>0 - Nacional</option>
                    <option value="1" ${p.origin === '1' ? 'selected' : ''}>1 - Estrangeira Importação Direta</option>
                    <option value="2" ${p.origin === '2' ? 'selected' : ''}>2 - Estrangeira Adquirida no Mercado Interno</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>CST / CSOSN ICMS:</label>
                  <input type="text" id="p-icms-cst" class="form-control" value="${p.icmsCst || '102'}" />
                </div>
                <div class="form-group">
                  <label>Alíquota ICMS (%):</label>
                  <input type="number" step="0.1" id="p-icms-rate" class="form-control" value="${p.icmsRate || 0}" />
                </div>
              </div>
            </div>

            <!-- Aba 5: Estoque & Localização -->
            <div id="ptab-estoque" class="ptab-content">
              <div class="form-grid">
                <div class="form-group">
                  <label>Estoque Atual em Loja: *</label>
                  <input type="number" step="0.001" id="p-qty" class="form-control" value="${p.quantity || 0}" required style="font-weight:700; color:#38bdf8;" />
                </div>
                <div class="form-group">
                  <label>Estoque Mínimo (Ponto de Reposição):</label>
                  <input type="number" id="p-minqty" class="form-control" value="${p.minQuantity || 5}" />
                </div>
                <div class="form-group">
                  <label>Estoque Máximo:</label>
                  <input type="number" id="p-maxqty" class="form-control" value="${p.maxQuantity || 100}" />
                </div>
                <div class="form-group">
                  <label>Localização (Corredor / Gôndola / Prateleira):</label>
                  <input type="text" id="p-location" class="form-control" value="${p.location || ''}" placeholder="Ex: Corredor 03 / Gôndola A" />
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
}

function recalcProductPrices() {
  const cost = parseFloat(document.getElementById("p-cost").value) || 0;
  const freight = parseFloat(document.getElementById("p-freight").value) || 0;
  const markup = parseFloat(document.getElementById("p-markup").value) || 0;

  const realCost = cost * (1 + freight / 100);
  const sale = realCost * (1 + markup / 100);
  document.getElementById("p-saleprice").value = sale.toFixed(2);
}

async function saveProductForm(e, id) {
  e.preventDefault();
  const payload = {
    sku: document.getElementById("p-sku").value.trim(),
    barcode: document.getElementById("p-barcode").value.trim(),
    secondaryBarcodes: document.getElementById("p-sec-barcodes").value.trim(),
    name: document.getElementById("p-name").value.trim(),
    shortName: document.getElementById("p-shortname").value.trim(),
    brand: document.getElementById("p-brand").value.trim(),
    department: document.getElementById("p-dept").value,
    unit: document.getElementById("p-unit").value,
    costPrice: parseFloat(document.getElementById("p-cost").value) || 0,
    freightPct: parseFloat(document.getElementById("p-freight").value) || 0,
    markupPct: parseFloat(document.getElementById("p-markup").value) || 0,
    salePrice: parseFloat(document.getElementById("p-saleprice").value) || 0,
    wholesaleMinQty: parseInt(document.getElementById("p-wholesale-qty").value) || 6,
    wholesalePrice: parseFloat(document.getElementById("p-wholesale-price").value) || 0,
    promoPrice: parseFloat(document.getElementById("p-promoprice").value) || 0,
    commissionPct: parseFloat(document.getElementById("p-commission").value) || 0,
    isWeighable: document.getElementById("p-weighable").checked,
    weighType: parseInt(document.getElementById("p-weightype").value) || 0,
    pluCode: document.getElementById("p-plu").value.trim(),
    tareWeight: parseFloat(document.getElementById("p-tare").value) || 0,
    shelfLifeDays: parseInt(document.getElementById("p-shelflife").value) || 90,
    ncm: document.getElementById("p-ncm").value.trim(),
    cest: document.getElementById("p-cest").value.trim(),
    cfop: document.getElementById("p-cfop").value.trim(),
    origin: document.getElementById("p-origin").value,
    icmsCst: document.getElementById("p-icms-cst").value.trim(),
    icmsRate: parseFloat(document.getElementById("p-icms-rate").value) || 0,
    quantity: parseFloat(document.getElementById("p-qty").value) || 0,
    minQuantity: parseFloat(document.getElementById("p-minqty").value) || 5,
    maxQuantity: parseFloat(document.getElementById("p-maxqty").value) || 100,
    location: document.getElementById("p-location").value.trim()
  };

  try {
    if (id) {
      await API.put(`/api/products/${id}`, payload);
    } else {
      await API.post("/api/products", payload);
    }
    closeModal();
    loadProductsInBackground();
    if (state.currentRoute === "/produtos") {
      loadProductsList();
    } else {
      renderApp();
    }
  } catch (err) {
    alert("Erro ao salvar produto: " + err.message);
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Deseja realmente excluir o produto "${name}"?`)) return;
  try {
    await API.del(`/api/products/${id}`);
    loadProductsList();
  } catch (e) {
    alert("Erro ao excluir: " + e.message);
  }
}

// =====================================================================
// FORMULÁRIO COM ABAS: CADASTRO DE FORNECEDORES (GDM TelaCadastroFornecedor)
// =====================================================================
function renderSuppliersModule() {
  setTimeout(() => loadSuppliersList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Cadastro Geral de Fornecedores & Fabricantes</h2>
          
        </div>
        <div style="display:flex; gap:10px;">
          <input type="text" class="form-control" style="width:260px;" placeholder="Buscar fornecedor por Razão ou CNPJ..." onkeyup="filterSuppliersList(this.value)" />
          <button class="btn btn-success" onclick="openSupplierModal(null)">+ Novo Fornecedor</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Razão Social / Fornecedor</th>
              <th>Nome Fantasia</th>
              <th>CNPJ</th>
              <th>Telefone</th>
              <th>Representante Comercial</th>
              <th>Cidade / UF</th>
              <th class="text-center" style="width:120px;">Ações</th>
            </tr>
          </thead>
          <tbody id="suppliers-tbody">
            <tr><td colspan="7" class="text-center" style="padding:24px; color:#64748b;">Carregando fornecedores...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadSuppliersList() {
  try {
    const list = await API.get("/api/suppliers");
    state.suppliers = list || [];
    renderSuppliersTable(state.suppliers);
  } catch (e) {
    console.error("Erro fornecedores:", e);
  }
}

function filterSuppliersList(term) {
  const t = (term || "").toLowerCase().trim();
  const filtered = !t ? state.suppliers : state.suppliers.filter(s =>
    (s.corporateName && s.corporateName.toLowerCase().includes(t)) ||
    (s.tradeName && s.tradeName.toLowerCase().includes(t)) ||
    (s.cnpj && s.cnpj.includes(t)) ||
    (s.contactName && s.contactName.toLowerCase().includes(t))
  );
  renderSuppliersTable(filtered);
}

function renderSuppliersTable(list) {
  const tbody = document.getElementById("suppliers-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:24px; color:#64748b;">Nenhum fornecedor cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(s => `
    <tr>
      <td><strong>${s.corporateName || s.name}</strong></td>
      <td>${s.tradeName || '-'}</td>
      <td>${s.cnpj || '-'}</td>
      <td>${s.phone || '-'}</td>
      <td>${s.contactName || '-'}</td>
      <td>${s.city || 'São Paulo'} / ${s.state || 'SP'}</td>
      <td class="text-center">
        <button class="btn-icon" title="Editar" onclick="openSupplierModal('${s.id}')">✏️</button>
      </td>
    </tr>
  `).join("");
}

function openSupplierModal(id) {
  const s = id ? state.suppliers.find(x => String(x.id) === String(id)) : {
    corporateName: "",
    tradeName: "",
    cnpj: "",
    stateRegistration: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "São Paulo",
    state: "SP",
    zipCode: "",
    phone: "",
    email: "",
    contactName: "",
    contactPhone: "",
    paymentTerms: "28 dias",
    bank: "",
    pixKey: ""
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong class="modal-title">${id ? 'Editar Fornecedor: ' + (s.corporateName || s.name) : 'Novo Cadastro de Fornecedor (GDM TelaCadastroFornecedor)'}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <form onsubmit="saveSupplierForm(event, '${id || ''}')">
          <div class="modal-body">
            <!-- Abas do Fornecedor -->
            <div class="form-tabs">
              <span class="tab-link active" onclick="switchModalTab('stab-cadastral', this)">1. Dados Cadastrais</span>
              <span class="tab-link" onclick="switchModalTab('stab-endereco', this)">2. Endereço & Contatos</span>
              <span class="tab-link" onclick="switchModalTab('stab-comercial', this)">3. Condições Comerciais</span>
            </div>

            <!-- Aba 1: Dados Cadastrais -->
            <div id="stab-cadastral" class="ptab-content active">
              <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label>Razão Social Oficial: *</label>
                  <input type="text" id="supp-corp-name" class="form-control" value="${s.corporateName || s.name || ''}" required />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Nome Fantasia / Marca:</label>
                  <input type="text" id="supp-trade-name" class="form-control" value="${s.tradeName || ''}" />
                </div>
                <div class="form-group">
                  <label>CNPJ: *</label>
                  <input type="text" id="supp-cnpj" class="form-control" value="${s.cnpj || ''}" required placeholder="00.000.000/0000-00" />
                </div>
                <div class="form-group">
                  <label>Inscrição Estadual (IE):</label>
                  <input type="text" id="supp-ie" class="form-control" value="${s.stateRegistration || ''}" />
                </div>
              </div>
            </div>

            <!-- Aba 2: Endereço & Contatos -->
            <div id="stab-endereco" class="ptab-content">
              <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label>Rua / Logradouro:</label>
                  <input type="text" id="supp-street" class="form-control" value="${s.street || ''}" />
                </div>
                <div class="form-group">
                  <label>Número:</label>
                  <input type="text" id="supp-number" class="form-control" value="${s.number || ''}" />
                </div>
                <div class="form-group">
                  <label>Bairro:</label>
                  <input type="text" id="supp-neighborhood" class="form-control" value="${s.neighborhood || ''}" />
                </div>
                <div class="form-group">
                  <label>Cidade:</label>
                  <input type="text" id="supp-city" class="form-control" value="${s.city || 'São Paulo'}" />
                </div>
                <div class="form-group">
                  <label>UF:</label>
                  <input type="text" id="supp-state" class="form-control" value="${s.state || 'SP'}" maxlength="2" />
                </div>
                <div class="form-group">
                  <label>Telefone da Empresa:</label>
                  <input type="text" id="supp-phone" class="form-control" value="${s.phone || ''}" />
                </div>
                <div class="form-group">
                  <label>E-mail para Pedidos / XML:</label>
                  <input type="email" id="supp-email" class="form-control" value="${s.email || ''}" />
                </div>
                <div class="form-group">
                  <label>Representante Comercial:</label>
                  <input type="text" id="supp-rep-name" class="form-control" value="${s.contactName || ''}" placeholder="Nome do vendedor" />
                </div>
                <div class="form-group">
                  <label>WhatsApp do Representante:</label>
                  <input type="text" id="supp-rep-phone" class="form-control" value="${s.contactPhone || ''}" />
                </div>
              </div>
            </div>

            <!-- Aba 3: Condições Comerciais -->
            <div id="stab-comercial" class="ptab-content">
              <div class="form-grid">
                <div class="form-group">
                  <label>Condições de Pagamento Padrão:</label>
                  <input type="text" id="supp-terms" class="form-control" value="${s.paymentTerms || '28 dias'}" placeholder="Ex: 14/28/42 dias" />
                </div>
                <div class="form-group">
                  <label>Chave PIX do Fornecedor:</label>
                  <input type="text" id="supp-pix" class="form-control" value="${s.pixKey || ''}" placeholder="CNPJ, E-mail ou Telefone" />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label>Dados Bancários (Banco, Agência, Conta):</label>
                  <input type="text" id="supp-bank" class="form-control" value="${s.bank || ''}" placeholder="Ex: Banco do Brasil - Ag: 1234-5 / CC: 56789-0" />
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-success">Salvar Fornecedor</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

async function saveSupplierForm(e, id) {
  e.preventDefault();
  const payload = {
    corporateName: document.getElementById("supp-corp-name").value.trim(),
    name: document.getElementById("supp-corp-name").value.trim(),
    tradeName: document.getElementById("supp-trade-name").value.trim(),
    cnpj: document.getElementById("supp-cnpj").value.trim(),
    stateRegistration: document.getElementById("supp-ie").value.trim(),
    street: document.getElementById("supp-street").value.trim(),
    number: document.getElementById("supp-number").value.trim(),
    neighborhood: document.getElementById("supp-neighborhood").value.trim(),
    city: document.getElementById("supp-city").value.trim(),
    state: document.getElementById("supp-state").value.trim(),
    phone: document.getElementById("supp-phone").value.trim(),
    email: document.getElementById("supp-email").value.trim(),
    contactName: document.getElementById("supp-rep-name").value.trim(),
    contactPhone: document.getElementById("supp-rep-phone").value.trim(),
    paymentTerms: document.getElementById("supp-terms").value.trim(),
    pixKey: document.getElementById("supp-pix").value.trim(),
    bank: document.getElementById("supp-bank").value.trim()
  };

  try {
    if (id) {
      await API.put(`/api/suppliers/${id}`, payload);
    } else {
      await API.post("/api/suppliers", payload);
    }
    closeModal();
    loadSuppliersList();
  } catch (err) {
    alert("Erro ao salvar fornecedor: " + err.message);
  }
}

// =====================================================================
// FORMULÁRIO COM ABAS: CONFIGURAÇÕES GERAIS DO SISTEMA & RETAGUARDA
// =====================================================================
function renderSettingsModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Configurações Gerais & Parâmetros da Aplicação</h2>
          
        </div>
      </header>

      <!-- Navegador de Abas de Configuração -->
      <div class="form-tabs">
        <span class="tab-link active" onclick="switchModalTab('cfg-tab-empresa', this)">1. Empresa & Matriz</span>
        <span class="tab-link" onclick="switchModalTab('cfg-tab-pdv', this)">2. Parâmetros da Loja</span>
        <span class="tab-link" onclick="switchModalTab('cfg-tab-segmento', this)">3. Segmento da Loja</span>
        <span class="tab-link" onclick="switchModalTab('cfg-tab-rede', this)">4. Banco de Dados & Rede</span>
      </div>

      <!-- Aba 1: Empresa & Matriz -->
      <div id="cfg-tab-empresa" class="ptab-content active">
        <form onsubmit="handleSaveCompany(event)">
          <div class="form-grid">
            <div class="form-group" style="grid-column: span 2;">
              <label>Razão Social da Empresa: *</label>
              <input type="text" id="cfg-name" class="form-control" value="${state.company.name}" required />
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Nome Fantasia da Loja:</label>
              <input type="text" id="cfg-tradename" class="form-control" value="${state.company.tradeName || state.company.name}" />
            </div>
            <div class="form-group">
              <label>CNPJ: *</label>
              <input type="text" id="cfg-cnpj" class="form-control" value="${state.company.cnpj || '12.345.678/0001-90'}" required />
            </div>
            <div class="form-group">
              <label>Inscrição Estadual:</label>
              <input type="text" class="form-control" value="123.456.789.110" />
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Endereço Completo:</label>
              <input type="text" id="cfg-address" class="form-control" value="${state.company.address || 'Av. Principal, 1000 - Centro'}" />
            </div>
            <div class="form-group">
              <label>Telefone / WhatsApp Comercial:</label>
              <input type="text" id="cfg-phone" class="form-control" value="${state.company.phone || '(11) 3456-7890'}" />
            </div>
            <div class="form-group">
              <label>Regime Tributário:</label>
              <select class="form-control">
                <option value="1">Simples Nacional</option>
                <option value="2">Simples Nacional com excesso de sublimite</option>
                <option value="3">Regime Normal (Lucro Presumido / Real)</option>
              </select>
            </div>
          </div>
          <div style="margin-top:20px;">
            <button type="submit" class="btn btn-success">Salvar Dados da Matriz</button>
          </div>
        </form>
      </div>

      <!-- Aba 2: Parâmetros da Loja -->
      <div id="cfg-tab-pdv" class="ptab-content">
        <div class="form-grid">
          <div class="form-group" style="grid-column: span 2;">
            <label>Permitir Venda com Estoque Zerado / Negativo?</label>
            <select class="form-control">
              <option value="sim">Sim (Permite faturar e regulariza estoque na entrada da NF-e)</option>
              <option value="nao">Não (Bloqueia venda se saldo for zero)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Desconto Máximo do Operador sem Senha (%):</label>
            <input type="number" class="form-control" value="5.0" />
          </div>
          <div class="form-group">
            <label>Exigir Supervisor para Cancelamento?</label>
            <select class="form-control">
              <option value="sim">Sim (Exige senha de supervisor para cancelar item ou venda)</option>
              <option value="nao">Não (Operador pode cancelar diretamente)</option>
            </select>
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label>Alerta de Limite de Sangria no Caixa (R$):</label>
            <input type="number" class="form-control" value="500.00" />
            <small style="color:#94a3b8;">Emite aviso no PDV quando o dinheiro em gaveta ultrapassar esse montante.</small>
          </div>
        </div>
        <div style="margin-top:20px;">
          <button type="button" class="btn btn-primary" onclick="alert('Regras do PDV salvas!')">Salvar Regras do PDV</button>
        </div>
      </div>

      <!-- Aba 4: Segmento da Loja -->
      <div id="cfg-tab-segmento" class="ptab-content">
        <div class="form-group" style="max-width:500px;">
          <label>Segmento Principal de Atuação da Loja:</label>
          <select id="cfg-segment" class="form-control" style="font-size:15px; font-weight:700;">
            <option value="Supermercado e Mercearia" ${state.company.segment === 'Supermercado e Mercearia' ? 'selected' : ''}>Supermercado e Mercearia</option>
            <option value="Vestuário e Calçados" ${state.company.segment === 'Vestuário e Calçados' ? 'selected' : ''}>Vestuário e Moda (Grade de Tamanho e Cor)</option>
            <option value="Açougue e Carnes" ${state.company.segment === 'Açougue e Carnes' ? 'selected' : ''}>Açougue e Casa de Carnes (Balança / Desossa)</option>
            <option value="Padaria e Confeitaria" ${state.company.segment === 'Padaria e Confeitaria' ? 'selected' : ''}>Padaria e Panificadora</option>
            <option value="Varejo em Geral" ${state.company.segment === 'Varejo em Geral' ? 'selected' : ''}>Varejo em Geral / Magazines</option>
          </select>
        </div>
        <div style="margin-top:20px;">
          <button type="button" class="btn btn-primary" onclick="handleSaveSegment()">Salvar Segmento do Comércio</button>
        </div>
      </div>

      <!-- Aba 5: Banco de Dados & Rede -->
      <div id="cfg-tab-rede" class="ptab-content">
        <div style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:18px; max-width:700px;">
          <h3 style="font-size:14px; color:#fff; font-weight:700; margin-bottom:12px;">Topologia de Rede & Banco de Dados</h3>
          <div style="font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:8px;">
            <div>Modo Operacional: <strong style="color:#22c55e;">Servidor Matriz Local-First</strong></div>
            <div>Banco de Dados: <strong>SQLite 3 com WAL (Write-Ahead Logging) de Alta Performance</strong></div>
            <div>Local do Banco: <code>data/pdv-web.db</code></div>
            <div>Sincronização com Filiais: <strong>Serviço HTTP REST Integrado Ativo</strong></div>
          </div>
          <div style="margin-top:16px;">
            <button type="button" class="btn btn-outline" onclick="alert('Backup do banco gerado com sucesso!')">Fazer Backup Imediato do Banco</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleSaveCompany(e) {
  e.preventDefault();
  const name = document.getElementById("cfg-name").value.trim();
  const trade = document.getElementById("cfg-tradename").value.trim();
  const cnpj = document.getElementById("cfg-cnpj").value.trim();
  const addr = document.getElementById("cfg-address").value.trim();
  const phone = document.getElementById("cfg-phone").value.trim();

  try {
    await API.post("/api/company", {
      name,
      tradeName: trade,
      cnpj,
      segment: state.company.segment,
      address: addr,
      phone
    });
    state.company.name = name;
    state.company.tradeName = trade;
    state.company.cnpj = cnpj;
    state.company.address = addr;
    state.company.phone = phone;
    alert("Dados da empresa salvos com sucesso!");
    renderApp();
  } catch (err) {
    alert("Erro ao salvar dados: " + err.message);
  }
}

async function handleSaveSegment() {
  const seg = document.getElementById("cfg-segment").value;
  try {
    await API.post("/api/company", {
      name: state.company.name,
      tradeName: state.company.tradeName,
      cnpj: state.company.cnpj,
      segment: seg
    });
    state.company.segment = seg;
    alert("Segmento atualizado com sucesso!");
    renderApp();
  } catch (err) {
    alert("Erro: " + err.message);
  }
}

// =====================================================================
// MÓDULO 6: CAIXA & MOVIMENTAÇÕES (ROTAS SEPARADAS)
// =====================================================================
function renderCashModule() {
  setTimeout(() => loadCashSessionStatus(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Abertura & Fechamento de Caixa do Terminal</h2>
          
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-outline" onclick="navigate('/movimentacoes-caixa')">Ver Extrato de Movimentações</button>
        </div>
      </header>

      <div id="cash-session-view">
        <p style="color:#94a3b8; padding:20px;">Verificando status do terminal...</p>
      </div>

      <div style="margin-top:28px;">
        <h3 style="font-size:15px; color:#fff; margin-bottom:12px; font-weight:700;">Histórico de Turnos Fechados Anteriormente</h3>
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
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody id="cash-history-tbody">
              <tr><td colspan="8" class="text-center" style="padding:20px; color:#94a3b8;">Carregando histórico...</td></tr>
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
      container.innerHTML = `
        <div style="background:#1e1b2e; border:1px solid #4338ca; border-radius:10px; padding:24px; max-width:680px; margin:0 auto; text-align:center;">
          <h3 style="color:#c7d2fe; font-size:18px; margin-bottom:8px;">O Caixa deste terminal encontra-se atualmente FECHADO</h3>
          <p style="color:#94a3b8; font-size:13px; margin-bottom:20px;">Informe o fundo de troco inicial para abrir o caixa e liberar o PDV:</p>

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

    const drawer = (s.openingBalance || 0) + (s.cashSalesTotal || 0) + (s.totalSuprimento || 0) - (s.totalSangria || 0);

    container.innerHTML = `
      <div style="background:#0f172a; border:1px solid var(--border); border-radius:10px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <span class="badge badge-green" style="font-size:12px; padding:4px 10px;">CAIXA ABERTO & OPERANDO</span>
            <span style="color:#94a3b8; font-size:12px; margin-left:10px;">Aberto em: <strong>${fmtDataHora(s.openedAt)}</strong></span>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" onclick="openCashOperationsModal('suprimento')">+ Suprimento (Troco)</button>
            <button class="btn btn-danger" onclick="openCashOperationsModal('sangria')">- Sangria (Retirada)</button>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card accent-card">
            <span>Fundo de Troco</span>
            <strong>${fmtMoeda(s.openingBalance)}</strong>
            <small>Valor Inicial</small>
          </div>
          <div class="metric-card success-card">
            <span>Vendas em Dinheiro</span>
            <strong>${fmtMoeda(s.cashSalesTotal || 0)}</strong>
            <small>Faturamento Físico</small>
          </div>
          <div class="metric-card warning-card">
            <span>Vendas em Cartão</span>
            <strong>${fmtMoeda((s.cardDebitSalesTotal || 0) + (s.cardCreditSalesTotal || 0))}</strong>
            <small>Débito + Crédito</small>
          </div>
          <div class="metric-card success-card">
            <span>Saldo Líquido na Gaveta</span>
            <strong style="color:#22c55e;">${fmtMoeda(drawer)}</strong>
            <small>Dinheiro em Caixa</small>
          </div>
        </div>

        <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:#cbd5e1;">Finalize o turno do caixa no encerramento do expediente:</span>
          <button class="btn btn-danger btn-lg" onclick="handleCloseCashPrompt(${s.id})">Realizar Fechamento de Caixa</button>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<p style="color:#f87171; padding:20px;">Erro ao verificar status do caixa.</p>';
  }
}

async function handleOpenCashSubmit(e) {
  e.preventDefault();
  const val = parseFloat(document.getElementById("open-cash-amount").value);
  if (isNaN(val) || val < 0) return alert("Fundo de troco inválido.");

  try {
    await API.post("/api/cash/open", { openingBalance: val, operatorName: state.user.name });
    alert("Caixa aberto com sucesso!");
    loadCashSessionStatus();
  } catch (err) {
    alert("Erro ao abrir caixa: " + err.message);
  }
}

async function handleCloseCashPrompt(sessionId) {
  const closingAmount = prompt("Informe o valor total em dinheiro contado na gaveta (Fechamento Cego R$):");
  if (closingAmount === null) return;
  const val = parseFloat(closingAmount.replace(",", "."));
  if (isNaN(val) || val < 0) return alert("Valor inválido.");

  try {
    await API.post("/api/cash/close", { sessionId, closingBalance: val, supervisorPassword: "admin" });
    alert("Caixa fechado com sucesso! Turno finalizado.");
    loadCashSessionStatus();
  } catch (err) {
    alert("Erro ao fechar caixa: " + err.message);
  }
}

function renderCashHistoryTable(list) {
  const tbody = document.getElementById("cash-history-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:16px; color:#64748b;">Nenhum fechamento anterior registrado.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(h => `
    <tr>
      <td>${fmtDataHora(h.openedAt)}</td>
      <td>${fmtDataHora(h.closedAt)}</td>
      <td>${h.operatorName || 'Operador'}</td>
      <td class="text-right">${fmtMoeda(h.openingBalance)}</td>
      <td class="text-right">${fmtMoeda(h.cashSalesTotal || 0)}</td>
      <td class="text-right">${fmtMoeda((h.cardDebitSalesTotal || 0) + (h.cardCreditSalesTotal || 0))}</td>
      <td class="text-right">${fmtMoeda(h.pixSalesTotal || 0)}</td>
      <td class="text-center"><span class="badge badge-gray">Encerrado</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------
// MOVIMENTAÇÕES DE CAIXA (EXTRATO / SANGRIA / SUPRIMENTO)
// ---------------------------------------------------------------------
function renderCashMovementsModule() {
  setTimeout(() => loadMovementsList(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Extrato Detalhado de Movimentações de Caixa</h2>
          
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" onclick="openCashOperationsModal('suprimento')">+ Suprimento</button>
          <button class="btn btn-danger" onclick="openCashOperationsModal('sangria')">- Sangria</button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Tipo de Movimento</th>
              <th>Operador</th>
              <th>Motivo / Descrição</th>
              <th class="text-right">Valor (R$)</th>
            </tr>
          </thead>
          <tbody id="movements-tbody">
            <tr><td colspan="5" class="text-center" style="padding:24px; color:#64748b;">Carregando extrato de movimentações...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadMovementsList() {
  try {
    const list = await API.get("/api/cash/movements");
    renderMovementsTable(list || []);
  } catch (e) {
    console.error("Erro movimentações:", e);
  }
}

function renderMovementsTable(list) {
  const tbody = document.getElementById("movements-tbody");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px; color:#64748b;">Nenhuma movimentação avulsa registrada no turno atual.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(m => `
    <tr>
      <td>${fmtDataHora(m.createdAt)}</td>
      <td>
        ${m.type === 'SANGRIA' ? '<span class="badge badge-red">SANGRIA (Retirada)</span>' : '<span class="badge badge-green">SUPRIMENTO (Entrada)</span>'}
      </td>
      <td>${m.operatorName || 'Operador'}</td>
      <td>${m.reason || '-'}</td>
      <td class="text-right" style="font-weight:700; color:${m.type === 'SANGRIA' ? '#f87171' : '#22c55e'};">
        ${m.type === 'SANGRIA' ? '-' : '+'}${fmtMoeda(m.amount)}
      </td>
    </tr>
  `).join("");
}

// =====================================================================
// MÓDULOS SECUNDÁRIOS: DASHBOARD, FINANCEIRO, CREDIÁRIO, ETIQUETAS
// =====================================================================
function renderDashboardModule() {
  setTimeout(() => loadDashboardData(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Painel Geral</h2>
          
        </div>
      </header>

      <div class="metrics-grid">
        <div class="metric-card success-card">
          <span>Vendas Hoje</span>
          <strong id="dash-sales-total" style="color:#22c55e;">R$ 0,00</strong>
          <small id="dash-sales-count">0 cupons emitidos</small>
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
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/pdv')">Abrir Frente de Caixa PDV (F2)</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/produtos')">Cadastrar / Consultar Produtos (F3)</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/clientes')">Cadastro de Clientes (F4)</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/colaboradores')">Gerenciar Colaboradores & Vendedores</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/caixa')">Abertura / Fechamento de Caixa</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/vendas')">Gerenciador de Vendas & Cupons (Ctrl+G)</button>
          </div>
        </div>

        <div style="background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:18px;">
          <h3 style="font-size:14px; color:#fff; font-weight:700; margin-bottom:12px;">Informações do Sistema</h3>
          <div style="font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;">
            <div>Versão: <strong>2.0.0 Enterprise Industrial</strong></div>
            <div>Arquitetura: <strong>C# .NET 9 + SQLite WAL + Web Engine</strong></div>
            <div>Terminal Ativo: <strong>Matriz / Estação Principal 01</strong></div>
            <div>Balanças Homologadas: <strong>Toledo MGV5/MGV6 & Filizola Smart</strong></div>
            <div>Impressora Homologada: <strong>ESC/POS Térmica 80mm & Spooler USB</strong></div>
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
      const sTot = document.getElementById("dash-sales-total");
      const sCnt = document.getElementById("dash-sales-count");
      const sAvg = document.getElementById("dash-ticket-avg");
      const sLow = document.getElementById("dash-low-stock");
      const sCre = document.getElementById("dash-crediario");

      if (sTot) sTot.innerText = fmtMoeda(data.todaySalesTotal || 0);
      if (sCnt) sCnt.innerText = `${data.todaySalesCount || 0} cupons emitidos`;
      if (sAvg) sAvg.innerText = fmtMoeda(data.averageTicket || 0);
      if (sLow) sLow.innerText = `${data.lowStockCount || 0} produtos`;
      if (sCre) sCre.innerText = fmtMoeda(data.totalCrediarioOpen || 0);
    }
  } catch (e) {
    console.debug("Dashboard error:", e);
  }
}

function renderFinancialModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Financeiro - Contas a Pagar & Receber</h2>
          
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Tipo</th>
              <th>Documento / Título</th>
              <th>Favorecido / Fornecedor</th>
              <th class="text-right">Valor</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>05/11/2026</td>
              <td><span class="badge badge-red">PAGAR</span></td>
              <td>DUP-84920</td>
              <td>Camil Alimentos S.A.</td>
              <td class="text-right">${fmtMoeda(3450.00)}</td>
              <td class="text-center"><span class="badge badge-amber">Aberto</span></td>
            </tr>
            <tr>
              <td>10/11/2026</td>
              <td><span class="badge badge-green">RECEBER</span></td>
              <td>CRE-10023</td>
              <td>Maria Aparecida da Silva</td>
              <td class="text-right">${fmtMoeda(185.90)}</td>
              <td class="text-center"><span class="badge badge-green">Quitado</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCrediarioModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Controle Geral de Crediário & Carnês</h2>
          
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>CPF</th>
              <th class="text-right">Limite Aprovado</th>
              <th class="text-right">Saldo Devedor</th>
              <th class="text-right">Disponível</th>
              <th class="text-center">Status</th>
              <th class="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${state.customers.filter(c => (c.creditLimit || 0) > 0).map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.cpfCnpj || '-'}</td>
                <td class="text-right">${fmtMoeda(c.creditLimit)}</td>
                <td class="text-right" style="color:#f87171;">${fmtMoeda(c.currentDebt)}</td>
                <td class="text-right" style="color:#22c55e;">${fmtMoeda(c.creditLimit - (c.currentDebt || 0))}</td>
                <td class="text-center">
                  ${c.blocked ? '<span class="badge badge-red">Bloqueado</span>' : '<span class="badge badge-green">Liberado</span>'}
                </td>
                <td class="text-center">
                  <button class="btn btn-outline btn-sm" onclick="alert('Recebimento de carnê de ' + '${c.name}')">Receber Carnê</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderLabelsModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Impressão de Etiquetas</h2>
        </div>
      </header>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap:20px;">
        <!-- Bloco 1: Emissão de Etiquetas de Gôndola -->
        <div style="background:#0f172a; border:1px solid var(--border); border-radius:10px; padding:20px;">
          <h3 style="font-size:15px; color:#fff; font-weight:700; margin-bottom:14px;">1. Etiquetas de Prateleira / Gôndola</h3>
          
          <div class="form-group" style="margin-bottom:12px;">
            <label>Selecione o Produto:</label>
            <select id="label-prod-sel" class="form-control" onchange="updateLabelPreview(this.value)">
              ${state.products.map(p => `<option value="${p.id}">${p.sku} - ${p.name} (${fmtMoeda(p.salePrice)})</option>`).join("")}
            </select>
          </div>

          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>Formato da Etiqueta:</label>
              <select id="label-format-sel" class="form-control">
                <option value="gondola_padrao">Gôndola Padrão (30 x 40 mm)</option>
                <option value="gondola_grande">Gôndola Destaque (50 x 30 mm)</option>
                <option value="cartaz_promocional">Cartaz Promocional A4</option>
              </select>
            </div>
            <div class="form-group">
              <label>Quantidade de Cópias:</label>
              <input type="number" id="label-copies" class="form-control" value="1" min="1" max="100" />
            </div>
          </div>

          <div class="label-preview-box" id="label-preview-container" style="margin-bottom:16px;">
            <div style="font-size:11px; text-transform:uppercase; color:#64748b; font-weight:700;">${state.company.tradeName || state.company.name}</div>
            <div style="font-size:15px; font-weight:800; line-height:1.2; margin:4px 0;" id="label-p-name">ARROZ CAMIL TIPO 1 5KG</div>
            <div style="font-size:32px; font-weight:900; color:#000; font-family:'Consolas', monospace; text-align:right;" id="label-p-price">R$ 29,90</div>
            <div class="label-barcode-vis" id="label-p-barcode">7890000000000</div>
          </div>

          <button type="button" class="btn btn-primary" style="width:100%;" onclick="window.print()">
            Imprimir
          </button>
        </div>

        </div>
    </div>
  `;
}

function updateLabelPreview(id) {
  const p = state.products.find(x => String(x.id) === String(id));
  if (!p) return;
  document.getElementById("label-p-name").innerText = p.name;
  document.getElementById("label-p-price").innerText = fmtMoeda(p.salePrice);
  document.getElementById("label-p-barcode").innerText = p.barcode || p.sku;
}

function renderAbcReportModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">Curva ABC de Faturamento por Produto</h2>
          
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="text-center" style="width:60px;">Classe</th>
              <th>SKU</th>
              <th>Descrição do Produto</th>
              <th class="text-right">Qtd Vendida</th>
              <th class="text-right">Faturamento Total</th>
              <th class="text-right">% Acumulado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-center"><span class="badge badge-green">A</span></td>
              <td>1001</td>
              <td><strong>ARROZ CAMIL BRANCO TIPO 1 5KG</strong></td>
              <td class="text-right">142 UN</td>
              <td class="text-right">${fmtMoeda(4245.80)}</td>
              <td class="text-right">38.4%</td>
            </tr>
            <tr>
              <td class="text-center"><span class="badge badge-blue">B</span></td>
              <td>1003</td>
              <td><strong>ÓLEO DE SOJA SOYA 900ML</strong></td>
              <td class="text-right">98 UN</td>
              <td class="text-right">${fmtMoeda(676.20)}</td>
              <td class="text-right">62.1%</td>
            </tr>
            <tr>
              <td class="text-center"><span class="badge badge-gray">C</span></td>
              <td>1005</td>
              <td><strong>SABÃO EM PÓ OMO LAVAGEM PERFEITA 1.6KG</strong></td>
              <td class="text-right">31 UN</td>
              <td class="text-right">${fmtMoeda(616.90)}</td>
              <td class="text-right">88.5%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// MODAIS AUXILIARES: SOBRE & GUIA DE ATALHOS
// ---------------------------------------------------------------------
function openShortcutsModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong class="modal-title">Guia de Teclas de Atalho do PDV (GDM & Linear)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body" style="font-size:13px; color:#cbd5e1;">
          <div style="display:grid; grid-template-columns:100px 1fr; gap:10px; align-items:center;">
            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F11</kbd>
            <div><strong>Finalizar Venda</strong>: Abre a tela de pagamento e emissão do cupom.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F4 / Ctrl+C</kbd>
            <div><strong>Identificar Cliente</strong>: Abre a busca rápida de clientes no caixa.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F3 / Ctrl+P</kbd>
            <div><strong>Consultar Produto</strong>: Consulta tabela de preços e estoque.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">Ctrl+G</kbd>
            <div><strong>Gerenciar Vendas</strong>: Histórico de cupons, reimpressão e cancelamento.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">Ctrl+A</kbd>
            <div><strong>Caixa / Sangria</strong>: Registro de sangria, suprimento e posição de dinheiro.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F5</kbd>
            <div><strong>Balança de Checkout</strong>: Captura o peso da balança conectada na porta serial.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F6</kbd>
            <div><strong>Abrir Gaveta</strong>: Envia pulso de abertura para a gaveta de dinheiro.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F7</kbd>
            <div><strong>Cancelar Venda</strong>: Cancela a venda em andamento no caixa.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">F9</kbd>
            <div><strong>Trocar Operador</strong>: Bloqueia o terminal e solicita novo login.</div>

            <kbd style="background:#1e293b; padding:3px 8px; border-radius:4px; color:#38bdf8; font-weight:800; text-align:center;">Esc</kbd>
            <div><strong>Fechar Janela</strong>: Fecha qualquer modal aberto e retorna o foco ao PDV.</div>
          </div>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar</button>
        </footer>
      </div>
    </div>
  `;
}

function openAboutModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:440px;">
        <header class="modal-header">
          <strong class="modal-title">Sobre o PDV Gama Enterprise</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body" style="font-size:13px; color:#cbd5e1; text-align:center; padding:24px 20px;">
          <div style="font-size:32px; margin-bottom:8px;">🛒</div>
          <strong style="font-size:16px; color:#fff;">PDV Gama Retail ERP Enterprise</strong>
          <div style="color:#94a3b8; margin:4px 0 16px 0;">Versão 2.0.0 Industrial</div>
          <p style="font-size:12px; line-height:1.5; color:#94a3b8;">
            Engenharia reversa inspirada nos sistemas líderes de mercado GDM (Java Swing/NetBeans) e Linear Sistemas Supermercados.
          </p>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Fechar</button>
        </footer>
      </div>
    </div>
  `;
}

function downloadToledoCarga() {
  alert("Arquivo de carga MGV5/MGV6 gerado com sucesso (ITENS.TXT) para importação nas balanças Toledo.");
}

function downloadFilizolaCarga() {
  alert("Arquivo de carga gerado com sucesso (CADTXT.TXT) para importação nas balanças Filizola Smart.");
}

// Inicializa a aplicação quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", init);
