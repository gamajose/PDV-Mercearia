const root = document.querySelector('#app');
const api = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
  return data;
};

async function boot() {
  const state = await api('/api/state');
  if (!state.configured) return setupScreen();
  if (!state.authenticated) return loginScreen();
  return shellScreen(state.user);
}

function setupScreen() {
  root.innerHTML = `
    <main class="auth"><section class="card setup-card">
      <div class="logo">G</div><span class="tag">Primeiro acesso</span>
      <h1>Configure seu PDV</h1>
      <p>Nenhum dado foi criado. Cadastre sua empresa e o primeiro administrador.</p>
      <form id="setup-form" class="form-grid">
        <label>Nome da empresa<input name="companyName" required></label>
        <label>CPF/CNPJ opcional<input name="document"></label>
        <label>Segmento<select name="segment"><option>Mercearia</option><option>Supermercado</option><option>Hortifruti</option><option>Açougue</option><option>Padaria</option><option>Conveniência</option><option>Comércio geral</option></select></label>
        <label>Nome do administrador<input name="adminName" required></label>
        <label>Login<input name="login" required></label>
        <label>Senha<input name="password" type="password" minlength="8" required></label>
        <button class="primary full">Criar ambiente</button><div class="error full"></div>
      </form>
    </section></main>`;
  document.querySelector('#setup-form').addEventListener('submit', async event => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try { await api('/api/setup', { method: 'POST', body: JSON.stringify(body) }); await boot(); }
    catch (error) { document.querySelector('.error').textContent = error.message; }
  });
}

function loginScreen() {
  root.innerHTML = `
    <main class="auth"><section class="card login-card">
      <div class="logo">G</div><span class="tag">Acesso seguro</span>
      <h1>Entrar no PDV</h1><p>Use um usuário cadastrado no sistema.</p>
      <form id="login-form">
        <label>Login<input name="login" required autofocus></label>
        <label>Senha<input name="password" type="password" required></label>
        <button class="primary">Entrar</button><div class="error"></div>
      </form>
    </section></main>`;
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try { await api('/api/login', { method: 'POST', body: JSON.stringify(body) }); await boot(); }
    catch { document.querySelector('.error').textContent = 'Login ou senha inválidos.'; }
  });
}

function allowed(user, permission) {
  return user.role === 'Administrator' || user.permissions.includes(permission);
}

async function shellScreen(user) {
  const menu = [
    ['dashboard', '⌂', 'dashboard.view'], ['sales', '▣', 'sales.view'],
    ['products', '◇', 'products.view'], ['inventory', '▤', 'inventory.view'],
    ['purchases', '↓', 'purchases.view'], ['reports', '⌁', 'reports.view'],
    ['users', '♙', 'users.manage']
  ].filter(item => allowed(user, item[2]));
  root.innerHTML = `<div class="shell"><aside><div class="logo">G</div><nav>${menu.map(item => `<button data-page="${item[0]}" title="${item[0]}">${item[1]}</button>`).join('')}</nav><button id="logout">↪</button></aside><main><header><div><small id="company-name">PDV Gama</small><h1 id="title">Visão geral</h1></div><div class="user"><span>${user.name}</span><b>${user.name.slice(0,2).toUpperCase()}</b></div></header><section id="content"></section></main></div>`;
  document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => openPage(button.dataset.page, user));
  document.querySelector('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); loginScreen(); };
  await openPage('dashboard', user);
}

async function openPage(page, user) {
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const titles = { dashboard:'Visão geral', sales:'Vendas', products:'Produtos', inventory:'Estoque', purchases:'Compras', reports:'Relatórios', users:'Usuários e permissões' };
  document.querySelector('#title').textContent = titles[page];
  if (page === 'dashboard') return dashboardScreen();
  if (page === 'users') return usersScreen(user);
  document.querySelector('#content').innerHTML = `<div class="empty"><strong>＋</strong><h2>${titles[page]}</h2><p>Este módulo começa vazio e será preenchido apenas com dados cadastrados.</p></div>`;
}

async function dashboardScreen() {
  const data = await api('/api/dashboard');
  document.querySelector('#company-name').textContent = data.companyName;
  document.querySelector('#content').innerHTML = `<div class="metrics"><article><span>Vendas</span><strong>R$ ${Number(data.salesTotal).toFixed(2).replace('.', ',')}</strong><small>${data.sales} operações</small></article><article><span>Produtos</span><strong>${data.products}</strong><small>Cadastrados</small></article><article><span>Filiais</span><strong>${data.stores}</strong><small>Ativas</small></article><article><span>Pendências</span><strong>0</strong><small>Sincronização</small></article></div><div class="empty"><strong>⌁</strong><h2>Nenhum movimento ainda</h2><p>Os indicadores aparecerão quando houver operações reais.</p></div>`;
}

async function usersScreen(currentUser) {
  const users = await api('/api/users');
  document.querySelector('#content').innerHTML = `<div class="toolbar"><p>Controle quem pode acessar cada módulo.</p><button id="new-user" class="primary">＋ Novo usuário</button></div><div class="table"><div class="row head"><span>Nome</span><span>Login</span><span>Perfil</span></div>${users.map(user => `<div class="row"><span>${user.name}</span><span>${user.login}</span><span>${user.role === 'Administrator' ? 'Administrador' : 'Personalizado'}</span></div>`).join('')}</div><dialog id="user-dialog"><form id="user-form"><h2>Novo usuário</h2><label>Nome<input name="name" required></label><label>Login<input name="login" required></label><label>Senha<input name="password" type="password" minlength="8" required></label><h3>Permissões</h3><div class="permissions">${permissionOptions()}</div><div class="actions"><button type="button" id="cancel-user">Cancelar</button><button class="primary">Salvar</button></div><div class="error"></div></form></dialog>`;
  const dialog = document.querySelector('#user-dialog');
  document.querySelector('#new-user').onclick = () => dialog.showModal();
  document.querySelector('#cancel-user').onclick = () => dialog.close();
  document.querySelector('#user-form').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = { name: form.get('name'), login: form.get('login'), password: form.get('password'), role: 'Operator', permissions: form.getAll('permissions') };
    try { await api('/api/users', { method:'POST', body:JSON.stringify(body) }); dialog.close(); usersScreen(currentUser); }
    catch (error) { dialog.querySelector('.error').textContent = error.message; }
  };
}

function permissionOptions() {
  const items = [['dashboard.view','Painel'],['sales.view','Ver vendas'],['sales.create','Realizar vendas'],['products.view','Ver produtos'],['products.manage','Gerenciar produtos'],['inventory.view','Ver estoque'],['inventory.manage','Movimentar estoque'],['purchases.view','Ver compras'],['purchases.manage','Gerenciar compras'],['reports.view','Relatórios'],['company.manage','Empresa'],['stores.manage','Filiais'],['users.manage','Usuários e permissões']];
  return items.map(item => `<label><input type="checkbox" name="permissions" value="${item[0]}"><span>${item[1]}</span></label>`).join('');
}

boot().catch(loginScreen);
