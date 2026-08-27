/*************************************************************
 * app.js — lógica do cliente (SPA), hospedado como site estático
 * (ex.: GitHub Pages). Toda comunicação com o backend passa por
 * callServer(), que agora faz um fetch() para a API do Apps
 * Script (ver api-config.js) em vez de google.script.run — o
 * frontend não roda mais dentro do Google.
 *************************************************************/

// ---------------------------------------------------------------
// 0) INFRAESTRUTURA: chamadas ao backend, loading, toasts
// ---------------------------------------------------------------
const CHAVE_TOKEN = 'gt_token';
const CHAVE_USUARIO = 'gt_usuario';

function getToken() { return localStorage.getItem(CHAVE_TOKEN) || ''; }
function setSessao(token, usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}
function limparSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
}

/**
 * Chama uma função do backend via fetch (POST, Content-Type: text/plain —
 * evita o preflight CORS que o Apps Script não sabe responder). Se a sessão
 * tiver expirado, mostra a tela de login automaticamente.
 */
function callServer(fnName) {
  const args = Array.prototype.slice.call(arguments, 1);
  mostrarLoading(true);
  return fetch(window.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: fnName, args, token: getToken() })
  })
    .then(r => r.json())
    .then(resp => {
      mostrarLoading(false);
      if (resp.ok) return resp.data;
      if (resp.code === 'SESSAO_AUSENTE' || resp.code === 'SESSAO_INVALIDA' || resp.code === 'SESSAO_EXPIRADA') {
        limparSessao();
        mostrarTelaLogin('Sua sessão expirou. Entre novamente.');
      } else {
        toast(resp.error || 'Erro desconhecido.', 'erro');
      }
      throw new Error(resp.error || 'Erro na chamada ao servidor.');
    })
    .catch(err => {
      mostrarLoading(false);
      if (!(err && err.__tratado)) {
        // erro de rede (offline, URL errada em api-config.js, CORS, etc.)
        if (!/Erro na chamada ao servidor/.test(err.message || '')) toast('Não foi possível falar com o servidor. Confira api-config.js e sua conexão.', 'erro');
      }
      err.__tratado = true;
      throw err;
    });
}

let loadingCount = 0;
function mostrarLoading(show) {
  loadingCount += show ? 1 : -1;
  document.getElementById('loadingOverlay').style.display = loadingCount > 0 ? 'flex' : 'none';
}

function toast(msg, tipo) {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (tipo ? ' ' + tipo : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function abrirModal(id) { document.getElementById(id).classList.add('show'); }
function fecharModal(id) { document.getElementById(id).classList.remove('show'); }

function esc(s) { return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtData(d) { if (!d) return ''; const s = String(d).substring(0, 10); const p = s.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }

// ---------------------------------------------------------------
// 1) ESTADO GLOBAL
// ---------------------------------------------------------------
const ESTADO = {
  boot: null,
  filtro: {},
  viewAtual: 'dashboard',
  paginas: { colaboradores: 1, historico: 1, plano: 1 },
  charts: {},
  colaboradorEditando: null,
  planoEditando: null,
  celulaAtual: null,
  relatorioAtual: null
};

const TITULOS_VIEW = {
  dashboard: ['Dashboard', 'Visão geral da capacitação da fábrica'],
  executivo: ['Dashboard Executivo', 'Principais indicadores para gestão e diretoria'],
  colaboradores: ['Colaboradores', 'Cadastro e gestão da equipe'],
  matriz: ['Matriz de Versatilidade', 'Clique em uma célula para avaliar uma competência'],
  historico: ['Histórico', 'Todas as alterações de competência já registradas'],
  plano: ['Plano de Treinamento', 'Treinamentos planejados, em andamento e concluídos'],
  processos: ['Processos e Competências', 'Estrutura organizacional e mapa de competências'],
  relatorios: ['Relatórios', 'Exportação e impressão de relatórios gerenciais'],
  alertas: ['Alertas', 'Pendências e situações que precisam de atenção'],
  'painel-tv': ['Painel de Gestão Visual', 'Modo TV — capacitação em tempo real'],
  configuracoes: ['Configurações', 'Parâmetros gerais do sistema']
};

const VIEWS_SEM_FILTRO = ['colaboradores', 'processos', 'relatorios', 'alertas', 'painel-tv', 'configuracoes'];

// ---------------------------------------------------------------
// 2) INICIALIZAÇÃO E LOGIN
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  ligarEventosGlobais();
  ligarEventosLogin();
  if (getToken()) iniciarApp(); else mostrarTelaLogin();
});

function mostrarTelaLogin(mensagem) {
  document.getElementById('app').style.display = 'none';
  document.getElementById('telaLogin').style.display = 'flex';
  document.getElementById('loginErro').textContent = mensagem || '';
  document.getElementById('loginEmail').focus();
}

function ligarEventosLogin() {
  document.getElementById('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const senha = document.getElementById('loginSenha').value.trim();
    const btn = document.getElementById('btnEntrar');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      const resp = await callServer('fazerLogin', email, senha);
      setSessao(resp.token, resp.usuario);
      document.getElementById('telaLogin').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      await iniciarApp();
      if (resp.usuario.PRECISA_TROCAR_SENHA) abrirModalTrocarSenha();
    } catch (err) {
      document.getElementById('loginErro').textContent = 'E-mail ou senha inválidos.';
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    try { await callServer('encerrarSessao', getToken()); } catch (e) {}
    limparSessao();
    location.reload();
  });

  document.getElementById('btnTrocarSenha').addEventListener('click', abrirModalTrocarSenha);
  document.getElementById('btnSalvarSenha').addEventListener('click', async () => {
    try {
      await callServer('alterarSenha', val('senhaAtual'), val('senhaNova'));
      toast('Senha alterada com sucesso.', 'sucesso');
      fecharModal('modalSenha');
    } catch (e) {}
  });
}

function abrirModalTrocarSenha() {
  document.getElementById('senhaAtual').value = '';
  document.getElementById('senhaNova').value = '';
  abrirModal('modalSenha');
}

async function iniciarApp() {
  const boot = await callServer('getBootstrap');
  ESTADO.boot = boot;
  document.getElementById('avatarUsuario').textContent = (boot.usuario.NOME || '?').substring(0, 1).toUpperCase();
  document.getElementById('nomeUsuarioTopbar').textContent = boot.usuario.NOME || '';
  document.getElementById('perfilUsuarioTopbar').textContent = boot.usuario.PERFIL || '';
  document.getElementById('nomeEmpresaSidebar').textContent = (boot.config.find(c => c.CHAVE === 'EMPRESA_NOME') || {}).VALOR || 'Gestão de Treinamentos';
  document.title = ((boot.config.find(c => c.CHAVE === 'EMPRESA_NOME') || {}).VALOR || 'Gestão de Treinamentos') + ' — Matriz de Versatilidade';
  popularFiltros();
  await trocarView('dashboard');
}

function ligarEventosGlobais() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => trocarView(el.dataset.view));
  });
  document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('btnAplicarFiltros').addEventListener('click', aplicarFiltrosGlobais);
  document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltrosGlobais);
  document.getElementById('fSetor').addEventListener('change', onFiltroSetorChange);

  let buscaTimer;
  document.getElementById('inputBuscaGlobal').addEventListener('input', e => {
    clearTimeout(buscaTimer);
    const termo = e.target.value;
    buscaTimer = setTimeout(() => executarBuscaGlobal(termo), 300);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.busca-global')) document.getElementById('resultadosBusca').classList.remove('show');
  });

  document.getElementById('btnNovoColaborador').addEventListener('click', () => abrirModalColaborador(null));
  document.getElementById('btnSalvarColaborador').addEventListener('click', salvarColaboradorForm);
  document.getElementById('btnImportarColaboradores').addEventListener('click', () => abrirModal('modalImportar'));
  document.getElementById('btnPreviewImportar').addEventListener('click', preVisualizarImportacao);
  document.getElementById('btnConfirmarImportar').addEventListener('click', confirmarImportacao);
  document.getElementById('arquivoImportar').addEventListener('change', carregarArquivoImportar);

  document.getElementById('btnSalvarCelula').addEventListener('click', salvarCelula);
  document.getElementById('celValidadeTipo').addEventListener('change', e => {
    document.getElementById('campoValidadeData').style.display = e.target.value === 'Data específica' ? 'flex' : 'none';
  });

  document.getElementById('btnNovoSetor').addEventListener('click', () => abrirModalGenerico('setor', null));
  document.getElementById('btnNovaArea').addEventListener('click', () => abrirModalGenerico('area', null));
  document.getElementById('btnNovaFuncao').addEventListener('click', () => abrirModalGenerico('funcao', null));
  document.getElementById('btnNovoProcesso').addEventListener('click', () => abrirModalGenerico('processo', null));
  document.getElementById('btnNovoUsuario').addEventListener('click', () => abrirModalGenerico('usuario', null));
  document.getElementById('btnSalvarGenerico').addEventListener('click', salvarGenerico);

  document.getElementById('btnNovoPlano').addEventListener('click', () => abrirModalPlano(null));
  document.getElementById('btnSalvarPlano').addEventListener('click', salvarPlanoForm);

  document.getElementById('selectTipoRelatorio').addEventListener('change', () => {});
  document.getElementById('btnGerarRelatorio').addEventListener('click', gerarRelatorio);
  document.getElementById('btnExportarCSV').addEventListener('click', exportarCSV);
  document.getElementById('btnImprimirRelatorio').addEventListener('click', () => window.print());

  document.getElementById('btnSalvarConfigEmpresa').addEventListener('click', salvarConfigEmpresa);
  document.getElementById('btnSalvarLimites').addEventListener('click', salvarLimites);

  document.getElementById('btnTelaCheia').addEventListener('click', () => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
  });
  document.getElementById('btnSairTv').addEventListener('click', () => trocarView('dashboard'));
}

// ---------------------------------------------------------------
// 3) NAVEGAÇÃO / ROTEAMENTO
// ---------------------------------------------------------------
async function trocarView(view) {
  ESTADO.viewAtual = view;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('tituloViewTexto').textContent = TITULOS_VIEW[view][0];
  document.getElementById('subtituloViewTexto').textContent = TITULOS_VIEW[view][1];
  document.getElementById('barraFiltros').style.display = VIEWS_SEM_FILTRO.indexOf(view) > -1 ? 'none' : 'flex';
  document.getElementById('sidebar').classList.remove('open');

  if (view === 'dashboard') await renderDashboard();
  else if (view === 'executivo') await renderExecutivo();
  else if (view === 'colaboradores') await renderColaboradores(1);
  else if (view === 'matriz') await renderMatriz();
  else if (view === 'historico') await renderHistorico(1);
  else if (view === 'plano') await renderPlano(1);
  else if (view === 'processos') await renderProcessos();
  else if (view === 'relatorios') { /* aguarda clique em Gerar */ }
  else if (view === 'alertas') await renderAlertas();
  else if (view === 'painel-tv') await renderPainelTv();
  else if (view === 'configuracoes') await renderConfiguracoes();
}

// ---------------------------------------------------------------
// 4) FILTROS GLOBAIS (item 17)
// ---------------------------------------------------------------
function popularFiltros() {
  const e = ESTADO.boot.estrutura;
  preencherSelect('fSetor', e.setores, 'SETOR_ID', 'NOME');
  preencherSelect('fFuncao', e.funcoes, 'FUNCAO_ID', 'NOME');
  preencherSelect('fProcesso', e.processos, 'PROCESSO_ID', 'NOME');
  preencherSelect('fTurno', ESTADO.boot.turnos.map(t => ({ v: t, n: t })), 'v', 'n');
  preencherSelect('fStatus', ESTADO.boot.statusColaborador.map(s => ({ v: s, n: s })), 'v', 'n');
  preencherSelect('fNivel', e.niveis, 'NIVEL_ID', 'NOME');
  onFiltroSetorChange();
}

function preencherSelect(id, arr, campoValor, campoNome, manterPrimeira) {
  const sel = document.getElementById(id);
  const primeira = sel.options[0];
  sel.innerHTML = '';
  if (primeira) sel.appendChild(primeira);
  arr.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[campoValor]; opt.textContent = item[campoNome];
    sel.appendChild(opt);
  });
}

function onFiltroSetorChange() {
  const setorId = document.getElementById('fSetor').value;
  const areas = ESTADO.boot.estrutura.areas.filter(a => !setorId || a.SETOR_ID === setorId);
  preencherSelect('fArea', areas, 'AREA_ID', 'NOME');
}

function lerFiltrosGlobais() {
  return {
    setorId: document.getElementById('fSetor').value,
    areaId: document.getElementById('fArea').value,
    funcaoId: document.getElementById('fFuncao').value,
    turno: document.getElementById('fTurno').value,
    processoId: document.getElementById('fProcesso').value,
    nivel: document.getElementById('fNivel').value,
    status: document.getElementById('fStatus').value
  };
}

async function aplicarFiltrosGlobais() {
  ESTADO.filtro = lerFiltrosGlobais();
  await trocarView(ESTADO.viewAtual);
}

async function limparFiltrosGlobais() {
  ['fSetor', 'fArea', 'fFuncao', 'fTurno', 'fProcesso', 'fNivel', 'fStatus'].forEach(id => document.getElementById(id).value = '');
  ESTADO.filtro = {};
  await trocarView(ESTADO.viewAtual);
}

// ---------------------------------------------------------------
// 5) BUSCA GLOBAL (item 28)
// ---------------------------------------------------------------
async function executarBuscaGlobal(termo) {
  const box = document.getElementById('resultadosBusca');
  if (!termo || termo.trim().length < 2) { box.classList.remove('show'); return; }
  const r = await callServer('buscaGlobal', termo);
  let html = '';
  const grupos = [['colaboradores', 'Colaboradores', c => c.NOME + ' — ' + c.MATRICULA],
    ['processos', 'Processos', p => p.NOME], ['funcoes', 'Funções', f => f.NOME], ['setores', 'Setores', s => s.NOME]];
  grupos.forEach(([chave, titulo, fmt]) => {
    if (r[chave] && r[chave].length) {
      html += '<div class="grupo-titulo">' + titulo + '</div>';
      r[chave].forEach(item => { html += '<div class="item">' + esc(fmt(item)) + '</div>'; });
    }
  });
  box.innerHTML = html || '<div class="item">Nenhum resultado</div>';
  box.classList.add('show');
}

// ---------------------------------------------------------------
// 6) DASHBOARD GERENCIAL
// ---------------------------------------------------------------
function kpiCardHtml(valor, rotulo, cor, icone) {
  return '<div class="kpi-card ' + (cor || '') + '"><div class="ic">' + (icone || '') + '</div><div class="valor">' + valor + '</div><div class="rotulo">' + rotulo + '</div></div>';
}

async function renderDashboard() {
  const d = await callServer('getDashboardCompleto', ESTADO.filtro);
  const k = d.kpis, ka = d.kpisAdicionais;
  document.getElementById('kpisDashboard').innerHTML =
    kpiCardHtml(k.colaboradoresAtivos, 'Colaboradores ativos', '', '👥') +
    kpiCardHtml(k.processosCadastrados, 'Processos cadastrados', '', '⚙️') +
    kpiCardHtml(k.treinamentosRealizados, 'Treinamentos realizados', 'verde', '✅') +
    kpiCardHtml(k.treinamentosPendentes, 'Treinamentos pendentes', 'amarelo', '⏳') +
    kpiCardHtml(k.treinamentosAtrasados, 'Treinamentos atrasados', 'laranja', '⏱️') +
    kpiCardHtml(k.treinamentosVencidos, 'Treinamentos vencidos', 'vermelho', '❗') +
    kpiCardHtml(k.coberturaMedia + '%', 'Cobertura média de habilidades', 'verde', '📈') +
    kpiCardHtml(k.versatilidadeMedia + '%', 'Índice médio de versatilidade', 'roxo', '🧩') +
    kpiCardHtml(k.processosCriticos, 'Processos críticos', 'vermelho', '🔴') +
    kpiCardHtml(k.colaboradoresEmTreinamento, 'Colaboradores em treinamento', 'amarelo', '🎓') +
    kpiCardHtml(ka.pctColaboradoresTreinados + '%', 'Colaboradores treinados', '', '🏅') +
    kpiCardHtml(ka.pctMultifuncionais + '%', 'Colaboradores multifuncionais', 'roxo', '🔀');

  graficoBarras('chartNiveis', d.distribuicaoNiveis.map(n => n.nome), [{ label: 'Colaboradores', data: d.distribuicaoNiveis.map(n => n.total), backgroundColor: d.distribuicaoNiveis.map(n => n.cor) }]);
  graficoBarras('chartCoberturaSetor', d.coberturaPorSetor.map(s => s.setor), [{ label: 'Cobertura %', data: d.coberturaPorSetor.map(s => s.cobertura), backgroundColor: '#1a73e8' }]);
  graficoBarras('chartVersatFuncao', d.versatilidadePorFuncao.map(f => f.funcao), [{ label: 'Versatilidade %', data: d.versatilidadePorFuncao.map(f => f.versatilidadeMedia), backgroundColor: '#673ab7' }]);
  graficoLinhas('chartPlanejadoRealizado', d.planejadoXRealizado.map(p => p.mes), [
    { label: 'Planejados', data: d.planejadoXRealizado.map(p => p.planejados), borderColor: '#f4b400', backgroundColor: '#f4b400' },
    { label: 'Realizados', data: d.planejadoXRealizado.map(p => p.realizados), borderColor: '#0f9d58', backgroundColor: '#0f9d58' }
  ]);
  graficoBarras('chartVencidosSetor', d.vencidosPorSetor.map(v => v.setor), [{ label: 'Vencidos', data: d.vencidosPorSetor.map(v => v.total), backgroundColor: '#db4437' }]);
  graficoLinhas('chartEvolucao', d.evolucaoMensal.map(e => fmtData(e.DATA)), [
    { label: 'Cobertura média', data: d.evolucaoMensal.map(e => e.COBERTURA_MEDIA), borderColor: '#1a73e8', backgroundColor: '#1a73e8' },
    { label: 'Versatilidade média', data: d.evolucaoMensal.map(e => e.VERSATILIDADE_MEDIA), borderColor: '#0f9d58', backgroundColor: '#0f9d58' }
  ]);
  graficoBarrasH('chartTopMenorCobertura', d.topMenorCobertura.map(p => p.processo), [{ label: 'Cobertura %', data: d.topMenorCobertura.map(p => p.cobertura), backgroundColor: '#f29900' }]);
  graficoBarrasH('chartTopVersatilidade', d.topVersatilidade.map(c => c.nome), [{ label: 'Versatilidade %', data: d.topVersatilidade.map(c => c.indice), backgroundColor: '#0f9d58' }]);
  graficoBarras('chartInstrutores', d.instrutoresPorProcesso.map(p => p.processo), [{ label: 'Instrutores', data: d.instrutoresPorProcesso.map(p => p.instrutores), backgroundColor: '#673ab7' }]);

  document.getElementById('listaProcessosCriticos').innerHTML = d.processosCriticos.length
    ? '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Processo</th><th>Aptos</th><th>Cobertura</th><th>Situação</th></tr></thead><tbody>' +
      d.processosCriticos.map(p => '<tr><td>' + esc(p.processo) + '</td><td>' + p.aptos + '</td><td>' + p.cobertura + '%</td><td>' + p.emoji + ' ' + p.classificacao + '</td></tr>').join('') +
      '</tbody></table></div>'
    : '<div class="vazio">Nenhum processo crítico 🎉</div>';

  document.getElementById('listaRecomendacoes').innerHTML = d.recomendacoes.length
    ? d.recomendacoes.map(r => '<div class="recomendacao"><span class="prioridade-tag prioridade-' + r.prioridade + '">' + r.prioridade + '</span><span>' + esc(r.texto) + '</span></div>').join('')
    : '<div class="vazio">Nenhuma recomendação no momento</div>';
}

// ---------------------------------------------------------------
// 7) DASHBOARD EXECUTIVO
// ---------------------------------------------------------------
async function renderExecutivo() {
  const d = await callServer('getDashboardExecutivo', ESTADO.filtro);
  document.getElementById('kpisExecutivo').innerHTML =
    kpiCardHtml(d.coberturaGeral + '%', 'Cobertura geral', 'verde', '📈') +
    kpiCardHtml(d.versatilidadeMedia + '%', 'Versatilidade média', 'roxo', '🧩') +
    kpiCardHtml(d.treinamentosPendentes, 'Treinamentos pendentes', 'amarelo', '⏳') +
    kpiCardHtml(d.treinamentosVencidos, 'Treinamentos vencidos', 'vermelho', '❗') +
    kpiCardHtml(d.processosCriticos, 'Processos críticos', 'vermelho', '🔴') +
    kpiCardHtml(d.colaboradoresEmTreinamento, 'Em treinamento', 'amarelo', '🎓') +
    kpiCardHtml(d.processosSemBackup, 'Processos sem backup', 'laranja', '🛡️');

  graficoLinhas('chartTendenciaExecutivo', d.evolucao.map(e => fmtData(e.DATA)), [
    { label: 'Cobertura média', data: d.evolucao.map(e => e.COBERTURA_MEDIA), borderColor: '#1a73e8', backgroundColor: '#1a73e8' },
    { label: 'Versatilidade média', data: d.evolucao.map(e => e.VERSATILIDADE_MEDIA), borderColor: '#0f9d58', backgroundColor: '#0f9d58' }
  ]);
}

// ---------------------------------------------------------------
// 8) GRÁFICOS (Chart.js)
// ---------------------------------------------------------------
function destruirChart(id) { if (ESTADO.charts[id]) { ESTADO.charts[id].destroy(); delete ESTADO.charts[id]; } }

function graficoBarras(id, labels, datasets) {
  destruirChart(id);
  const ctx = document.getElementById(id);
  ESTADO.charts[id] = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: baseChartOptions() });
}
function graficoBarrasH(id, labels, datasets) {
  destruirChart(id);
  const ctx = document.getElementById(id);
  ESTADO.charts[id] = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: Object.assign(baseChartOptions(), { indexAxis: 'y' }) });
}
function graficoLinhas(id, labels, datasets) {
  destruirChart(id);
  const ctx = document.getElementById(id);
  ESTADO.charts[id] = new Chart(ctx, { type: 'line', data: { labels, datasets: datasets.map(d => Object.assign({ tension: .3, fill: false }, d)) }, options: baseChartOptions() });
}
function graficoDonut(id, labels, data, cores) {
  destruirChart(id);
  const ctx = document.getElementById(id);
  ESTADO.charts[id] = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: cores }] }, options: { plugins: { legend: { position: 'bottom' } } } });
}
function baseChartOptions() {
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' } }, scales: { y: { beginAtZero: true } } };
}

// ---------------------------------------------------------------
// 9) COLABORADORES
// ---------------------------------------------------------------
async function renderColaboradores(pagina) {
  ESTADO.paginas.colaboradores = pagina;
  const filtro = Object.assign({}, ESTADO.filtro, { pagina, porPagina: 50 });
  const r = await callServer('listarColaboradores', filtro);
  document.getElementById('totalColaboradoresLabel').textContent = '(' + r.total + ' encontrados)';
  const setores = indexPorId(ESTADO.boot.estrutura.setores, 'SETOR_ID');
  const funcoes = indexPorId(ESTADO.boot.estrutura.funcoes, 'FUNCAO_ID');

  const linhas = await Promise.all(r.dados.map(async c => {
    const badgeStatus = { 'Ativo': 'badge-adequado', 'Afastado': 'badge-atencao', 'Férias': 'badge-info', 'Transferido': 'badge-cinza', 'Desligado': 'badge-critico' }[c.STATUS] || 'badge-cinza';
    return '<tr>' +
      '<td>' + esc(c.MATRICULA) + '</td>' +
      '<td><a href="#" onclick="verFichaColaborador(\'' + c.COLABORADOR_ID + '\');return false;"><b>' + esc(c.NOME) + '</b></a></td>' +
      '<td>' + esc(setores[c.SETOR_ID] ? setores[c.SETOR_ID].NOME : '') + '</td>' +
      '<td>' + esc(funcoes[c.FUNCAO_ID] ? funcoes[c.FUNCAO_ID].NOME : '') + '</td>' +
      '<td>' + esc(c.TURNO) + '</td>' +
      '<td><span class="badge ' + badgeStatus + '">' + esc(c.STATUS) + '</span></td>' +
      '<td>—</td>' +
      '<td><button class="btn btn-sm" onclick="abrirModalColaboradorId(\'' + c.COLABORADOR_ID + '\')">Editar</button></td>' +
      '</tr>';
  }));
  document.querySelector('#tabelaColaboradores tbody').innerHTML = linhas.join('') || '<tr><td colspan="8"><div class="vazio">Nenhum colaborador encontrado</div></td></tr>';
  renderPaginacao('paginacaoColaboradores', r, p => renderColaboradores(p));
}

function indexPorId(arr, campo) { const m = {}; (arr || []).forEach(i => m[i[campo]] = i); return m; }

function renderPaginacao(elId, r, callback) {
  const totalPaginas = Math.max(1, Math.ceil(r.total / r.porPagina));
  const el = document.getElementById(elId);
  el.innerHTML = '';
  const info = document.createElement('span'); info.textContent = 'Página ' + r.pagina + ' de ' + totalPaginas;
  el.appendChild(info);
  const btnAnt = document.createElement('button'); btnAnt.className = 'btn btn-sm'; btnAnt.textContent = '← Anterior';
  btnAnt.disabled = r.pagina <= 1; btnAnt.onclick = () => callback(r.pagina - 1);
  const btnProx = document.createElement('button'); btnProx.className = 'btn btn-sm'; btnProx.textContent = 'Próxima →';
  btnProx.disabled = r.pagina >= totalPaginas; btnProx.onclick = () => callback(r.pagina + 1);
  el.appendChild(btnAnt); el.appendChild(btnProx);
}

function campoHtml(label, id, tipo, opcoes, valor, span2) {
  let input;
  if (tipo === 'select') {
    input = '<select id="' + id + '">' + (opcoes || []).map(o => '<option value="' + esc(o.v) + '"' + (String(o.v) === String(valor) ? ' selected' : '') + '>' + esc(o.n) + '</option>').join('') + '</select>';
  } else if (tipo === 'textarea') {
    input = '<textarea id="' + id + '">' + esc(valor || '') + '</textarea>';
  } else {
    input = '<input type="' + tipo + '" id="' + id + '" value="' + esc(valor === undefined || valor === null ? '' : valor) + '">';
  }
  return '<div class="campo' + (span2 ? ' span2' : '') + '"><label>' + label + '</label>' + input + '</div>';
}

function abrirModalColaboradorId(id) {
  const c = ESTADO.ultimoColaboradores ? ESTADO.ultimoColaboradores[id] : null;
  callServer('getColaborador', id).then(c2 => abrirModalColaborador(c2));
}

function abrirModalColaborador(c) {
  ESTADO.colaboradorEditando = c ? c.COLABORADOR_ID : null;
  document.getElementById('modalColaboradorTitulo').textContent = c ? 'Editar colaborador' : 'Novo colaborador';
  const e = ESTADO.boot.estrutura;
  const optSetores = e.setores.map(s => ({ v: s.SETOR_ID, n: s.NOME }));
  const optAreas = e.areas.filter(a => !c || a.SETOR_ID === c.SETOR_ID).map(a => ({ v: a.AREA_ID, n: a.NOME }));
  const optFuncoes = e.funcoes.map(f => ({ v: f.FUNCAO_ID, n: f.NOME }));
  const optTurnos = ESTADO.boot.turnos.map(t => ({ v: t, n: t }));
  const optStatus = ESTADO.boot.statusColaborador.map(s => ({ v: s, n: s }));
  const optLideres = ESTADO.boot.colaboradoresResumo.map(x => ({ v: x.COLABORADOR_ID, n: x.NOME }));
  optSetores.unshift({ v: '', n: 'Selecione...' }); optFuncoes.unshift({ v: '', n: 'Selecione...' }); optLideres.unshift({ v: '', n: '-' });

  document.getElementById('formColaborador').innerHTML =
    campoHtml('Matrícula', 'colMatricula', 'text', null, c && c.MATRICULA) +
    campoHtml('Nome completo', 'colNome', 'text', null, c && c.NOME) +
    campoHtml('CPF', 'colCpf', 'text', null, c && c.CPF) +
    campoHtml('Setor', 'colSetor', 'select', optSetores, c && c.SETOR_ID) +
    campoHtml('Área', 'colArea', 'select', optAreas, c && c.AREA_ID) +
    campoHtml('Função', 'colFuncao', 'select', optFuncoes, c && c.FUNCAO_ID) +
    campoHtml('Cargo', 'colCargo', 'text', null, c && c.CARGO) +
    campoHtml('Turno', 'colTurno', 'select', optTurnos, c && c.TURNO) +
    campoHtml('Líder', 'colLider', 'select', optLideres, c && c.LIDER_ID) +
    campoHtml('Data de admissão', 'colAdmissao', 'date', null, c && c.DATA_ADMISSAO) +
    campoHtml('Status', 'colStatus', 'select', optStatus, (c && c.STATUS) || 'Ativo') +
    campoHtml('Data de desligamento', 'colDesligamento', 'date', null, c && c.DATA_DESLIGAMENTO) +
    campoHtml('Observações', 'colObs', 'textarea', null, c && c.OBSERVACOES, true) +
    campoHtml('Foto (URL, opcional)', 'colFoto', 'text', null, c && c.FOTO_URL, true);

  document.getElementById('colSetor').addEventListener('change', function () {
    const areas = e.areas.filter(a => a.SETOR_ID === this.value).map(a => ({ v: a.AREA_ID, n: a.NOME }));
    preencherSelectEl(document.getElementById('colArea'), areas);
  });
  abrirModal('modalColaborador');
}
function preencherSelectEl(sel, opcoes) { sel.innerHTML = opcoes.map(o => '<option value="' + esc(o.v) + '">' + esc(o.n) + '</option>').join(''); }

async function salvarColaboradorForm() {
  const item = {
    COLABORADOR_ID: ESTADO.colaboradorEditando || '',
    MATRICULA: val('colMatricula'), NOME: val('colNome'), CPF: val('colCpf'),
    SETOR_ID: val('colSetor'), AREA_ID: val('colArea'), FUNCAO_ID: val('colFuncao'), CARGO: val('colCargo'),
    TURNO: val('colTurno'), LIDER_ID: val('colLider'), DATA_ADMISSAO: val('colAdmissao'),
    STATUS: val('colStatus'), DATA_DESLIGAMENTO: val('colDesligamento'), OBSERVACOES: val('colObs'), FOTO_URL: val('colFoto')
  };
  try {
    await callServer('salvarColaborador', item);
    toast('Colaborador salvo com sucesso.', 'sucesso');
    fecharModal('modalColaborador');
    ESTADO.boot.colaboradoresResumo = await callServer('listarColaboradoresResumo');
    renderColaboradores(ESTADO.paginas.colaboradores);
  } catch (e) { /* erro já mostrado via toast */ }
}
function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }

async function verFichaColaborador(id) {
  const f = await callServer('getFichaColaborador', id);
  document.getElementById('modalFichaTitulo').textContent = f.colaborador.NOME;
  const ind = f.indicadores, cl = f.classificacao;
  document.getElementById('modalFichaCorpo').innerHTML =
    '<div class="grid-2">' +
      '<div><p><b>Função:</b> ' + esc(f.funcao ? f.funcao.NOME : '') + '<br><b>Setor:</b> ' + esc(f.setor ? f.setor.NOME : '') +
      '<br><b>Área:</b> ' + esc(f.area ? f.area.NOME : '') + '<br><b>Líder:</b> ' + esc(f.lider ? f.lider.NOME : '-') + '<br><b>Turno:</b> ' + esc(f.colaborador.TURNO) + '</p></div>' +
      '<div>' + kpiCardHtml(ind.indice + '%', 'Índice de versatilidade — ' + cl.label, '', '🧩') + '</div>' +
    '</div>' +
    '<div class="grid-kpis" style="margin-top:10px;">' +
      kpiCardHtml(ind.processosTotal, 'Processos aplicáveis', '', '📋') +
      kpiCardHtml(ind.habilitado, 'Habilitado', 'verde', '◕') +
      kpiCardHtml(ind.experiente, 'Experiente', 'verde', '●') +
      kpiCardHtml(ind.instrutor, 'Instrutor', 'roxo', '★') +
      kpiCardHtml(ind.emTreinamento, 'Em treinamento', 'amarelo', '◔') +
      kpiCardHtml(ind.semTreinamento, 'Sem treinamento', '', '⚪') +
    '</div>' +
    '<h4 style="margin:14px 0 6px;">Processos</h4>' +
    '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Processo</th><th>Nível</th><th>Validade</th></tr></thead><tbody>' +
      f.processos.map(p => '<tr><td>' + esc(p.processo.NOME) + '</td><td>' + nivelBadge(p.nivel) + '</td><td>' + (p.validade ? fmtData(p.validade) + ' — ' + statusValidadeLabel(p.validade) : '-') + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<h4 style="margin:14px 0 6px;">Evolução da capacitação</h4><canvas id="chartFichaEvolucao" height="180"></canvas>';
  abrirModal('modalFicha');
  setTimeout(() => graficoLinhas('chartFichaEvolucao', f.evolucao.map(e => e.mes), [{ label: 'Pontuação acumulada', data: f.evolucao.map(e => e.pontuacao), borderColor: '#1a73e8', backgroundColor: '#1a73e8' }]), 50);
}

function statusValidadeLabel(dataStr) {
  // aproximação no cliente apenas para exibição; o cálculo oficial é sempre feito no backend
  const hoje = new Date(); const d = new Date(dataStr);
  const dias = Math.round((d - hoje) / 86400000);
  if (dias < 0) return 'Vencido'; if (dias <= 30) return 'Próximo do vencimento'; return 'Válido';
}

function nivelBadge(nivel) {
  const n = (ESTADO.boot.estrutura.niveis || []).find(x => Number(x.NIVEL_ID) === Number(nivel));
  if (!n) return nivel;
  return '<span class="badge" style="background:' + n.COR + '22;color:' + n.COR + ';">' + n.ICONE + ' ' + n.NOME + '</span>';
}

// ---------------------------------------------------------------
// 10) IMPORTAÇÃO DE COLABORADORES (item 36)
// ---------------------------------------------------------------
let LINHAS_IMPORTAR = [];
function carregarArquivoImportar(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('textoImportar').value = ev.target.result; };
  reader.readAsText(file);
}

function parseCsv_(texto) {
  const linhas = texto.trim().split(/\r?\n/).filter(Boolean);
  if (!linhas.length) return [];
  const sep = linhas[0].indexOf(';') > -1 ? ';' : ',';
  const cabecalho = linhas[0].split(sep).map(c => c.trim().toUpperCase());
  return linhas.slice(1).map(l => {
    const campos = l.split(sep);
    const obj = {};
    cabecalho.forEach((c, i) => obj[c] = (campos[i] || '').trim());
    return obj;
  });
}

function preVisualizarImportacao() {
  LINHAS_IMPORTAR = parseCsv_(document.getElementById('textoImportar').value);
  const box = document.getElementById('previewImportar');
  if (!LINHAS_IMPORTAR.length) { box.innerHTML = '<div class="vazio">Nenhuma linha reconhecida. Verifique o formato.</div>'; document.getElementById('btnConfirmarImportar').disabled = true; return; }
  box.innerHTML = '<p style="font-size:12px;color:var(--texto-suave);">' + LINHAS_IMPORTAR.length + ' linha(s) prontas para importar.</p>' +
    '<div class="tabela-wrap" style="max-height:220px;"><table class="tabela"><thead><tr>' +
    Object.keys(LINHAS_IMPORTAR[0]).map(k => '<th>' + esc(k) + '</th>').join('') + '</tr></thead><tbody>' +
    LINHAS_IMPORTAR.slice(0, 20).map(l => '<tr>' + Object.keys(LINHAS_IMPORTAR[0]).map(k => '<td>' + esc(l[k]) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
  document.getElementById('btnConfirmarImportar').disabled = false;
}

async function confirmarImportacao() {
  const relatorio = await callServer('importarColaboradores', LINHAS_IMPORTAR);
  toast(relatorio.importados + ' importado(s), ' + relatorio.duplicados + ' duplicado(s), ' + relatorio.erros.length + ' erro(s).', relatorio.erros.length ? 'erro' : 'sucesso');
  fecharModal('modalImportar');
  ESTADO.boot.estrutura = await callServer('getEstruturaCompleta');
  ESTADO.boot.colaboradoresResumo = await callServer('listarColaboradoresResumo');
  popularFiltros();
  renderColaboradores(1);
}

// ---------------------------------------------------------------
// 11) MATRIZ DE VERSATILIDADE (item 5)
// ---------------------------------------------------------------
async function renderMatriz() {
  const m = await callServer('getMatrizVersatilidade', ESTADO.filtro);
  ESTADO.matrizCache = m;
  const tabela = document.getElementById('tabelaMatriz');
  let thead = '<thead><tr><th class="col-fixa">Colaborador</th><th class="col-fixa2">Função</th>' +
    m.processos.map(p => '<th title="' + esc(p.NOME) + '">' + esc(p.NOME) + '</th>').join('') + '</tr></thead>';
  let tbody = '<tbody>' + m.colaboradores.map(c => {
    let linha = '<tr><td class="col-fixa nome-colab">' + esc(c.NOME) + '<small>' + esc(c.MATRICULA) + '</small></td>' +
      '<td class="col-fixa2 funcao-colab">' + esc(c.FUNCAO_NOME) + '</td>';
    m.processos.forEach(p => {
      const cel = m.celulas[c.COLABORADOR_ID] && m.celulas[c.COLABORADOR_ID][p.PROCESSO_ID];
      if (!cel) { linha += '<td></td>'; return; }
      const n = m.niveis.find(x => Number(x.NIVEL_ID) === cel.nivel) || m.niveis[0];
      linha += '<td><div class="celula-nivel" style="color:' + n.COR + '" onclick="abrirCelula(\'' + c.COLABORADOR_ID + '\',\'' + p.PROCESSO_ID + '\')" title="' + esc(n.NOME) + '">' + n.ICONE + '</div></td>';
    });
    linha += '</tr>';
    return linha;
  }).join('') + '</tbody>';
  tabela.innerHTML = thead + tbody;
  if (!m.colaboradores.length) tabela.innerHTML = '';
  if (!m.colaboradores.length) document.querySelector('.matriz-wrap').innerHTML = '<div class="vazio"><span class="ic">🧩</span>Nenhum colaborador para os filtros selecionados.</div><table class="matriz" id="tabelaMatriz"></table>';
}

async function abrirCelula(colaboradorId, processoId) {
  ESTADO.celulaAtual = { colaboradorId, processoId };
  const d = await callServer('getDetalheCelula', colaboradorId, processoId);
  document.getElementById('modalCelulaTitulo').textContent = d.colaborador.NOME;
  document.getElementById('modalCelulaSubtitulo').textContent = 'Processo: ' + d.processo.NOME;

  const niveis = ESTADO.boot.estrutura.niveis;
  const nivelAtual = Number(d.registro.NIVEL || 0);
  document.getElementById('seletorNiveisCelula').innerHTML = niveis.map(n =>
    '<div class="opcao-nivel' + (Number(n.NIVEL_ID) === nivelAtual ? ' selecionado' : '') + '" data-nivel="' + n.NIVEL_ID + '" style="border-color:' + (Number(n.NIVEL_ID) === nivelAtual ? n.COR : '') + '" onclick="selecionarNivelCelula(' + n.NIVEL_ID + ')"><span class="ic">' + n.ICONE + '</span>' + n.NOME + '</div>'
  ).join('');
  ESTADO.nivelSelecionado = nivelAtual;

  document.getElementById('celDataTreinamento').value = (d.registro.DATA_TREINAMENTO || '').substring(0, 10);
  document.getElementById('celDataAvaliacao').value = (d.registro.DATA_AVALIACAO || '').substring(0, 10);
  document.getElementById('celValidadeTipo').value = d.registro.VALIDADE_TIPO || 'Sem validade';
  document.getElementById('celValidadeData').value = (d.registro.VALIDADE_DATA || '').substring(0, 10);
  document.getElementById('campoValidadeData').style.display = document.getElementById('celValidadeTipo').value === 'Data específica' ? 'flex' : 'none';
  document.getElementById('celObservacao').value = d.registro.OBSERVACAO || '';

  const optInstrutores = [{ v: '', n: '-' }].concat(ESTADO.boot.colaboradoresResumo.map(c => ({ v: c.COLABORADOR_ID, n: c.NOME })));
  preencherSelectEl(document.getElementById('celInstrutor'), optInstrutores);
  document.getElementById('celInstrutor').value = d.registro.INSTRUTOR_ID || '';

  document.getElementById('timelineCelula').innerHTML = d.historico.length
    ? d.historico.map(h => '<li><span class="data">' + fmtData(h.DATA) + ' ' + (h.HORA || '') + ' — ' + esc(h.USUARIO) + '</span><div class="desc">Nível ' + h.NIVEL_ANTERIOR + ' → <b>Nível ' + h.NIVEL_NOVO + '</b>' + (h.OBSERVACAO ? ' — ' + esc(h.OBSERVACAO) : '') + '</div></li>').join('')
    : '<li><span class="data">Sem alterações registradas ainda</span></li>';

  abrirModal('modalCelula');
}

function selecionarNivelCelula(nivel) {
  ESTADO.nivelSelecionado = nivel;
  document.querySelectorAll('#seletorNiveisCelula .opcao-nivel').forEach(el => {
    const ativo = Number(el.dataset.nivel) === nivel;
    el.classList.toggle('selecionado', ativo);
  });
}

async function salvarCelula() {
  const { colaboradorId, processoId } = ESTADO.celulaAtual;
  const dados = {
    nivel: ESTADO.nivelSelecionado,
    dataTreinamento: val('celDataTreinamento'),
    instrutorId: val('celInstrutor'),
    dataAvaliacao: val('celDataAvaliacao'),
    validadeTipo: val('celValidadeTipo'),
    validadeData: val('celValidadeData'),
    observacao: val('celObservacao')
  };
  try {
    await callServer('atualizarNivelMatriz', colaboradorId, processoId, dados);
    toast('Avaliação registrada com sucesso.', 'sucesso');
    fecharModal('modalCelula');
    renderMatriz();
  } catch (e) {}
}

// ---------------------------------------------------------------
// 12) HISTÓRICO
// ---------------------------------------------------------------
async function renderHistorico(pagina) {
  ESTADO.paginas.historico = pagina;
  const filtro = Object.assign({}, ESTADO.filtro, { pagina, porPagina: 50 });
  const r = await callServer('listarHistorico', filtro);
  document.querySelector('#tabelaHistorico tbody').innerHTML = r.dados.map(h =>
    '<tr><td>' + fmtData(h.DATA) + ' ' + (h.HORA || '') + '</td><td>' + esc(h.COLABORADOR_NOME) + '</td><td>' + esc(h.PROCESSO_NOME) + '</td>' +
    '<td>' + nivelBadge(h.NIVEL_ANTERIOR) + '</td><td>' + nivelBadge(h.NIVEL_NOVO) + '</td><td>' + esc(h.INSTRUTOR_NOME) + '</td><td>' + esc(h.USUARIO) + '</td><td>' + esc(h.OBSERVACAO) + '</td></tr>'
  ).join('') || '<tr><td colspan="8"><div class="vazio">Nenhum registro encontrado</div></td></tr>';
  renderPaginacao('paginacaoHistorico', r, p => renderHistorico(p));
}

// ---------------------------------------------------------------
// 13) PLANO DE TREINAMENTO
// ---------------------------------------------------------------
async function renderPlano(pagina) {
  ESTADO.paginas.plano = pagina;
  const filtro = Object.assign({}, ESTADO.filtro, { pagina, porPagina: 50 });
  const r = await callServer('listarPlanoTreinamento', filtro);
  const badgeStatus = s => ({ 'Concluído': 'badge-adequado', 'Atrasado': 'badge-critico', 'Reprovado': 'badge-critico', 'Cancelado': 'badge-cinza' }[s] || 'badge-atencao');
  document.querySelector('#tabelaPlano tbody').innerHTML = r.dados.map(p =>
    '<tr><td>' + esc(p.COLABORADOR_NOME) + '</td><td>' + esc(p.SETOR_NOME) + '</td><td>' + esc(p.PROCESSO_NOME) + '</td><td>' + esc(p.TREINAMENTO) + '</td>' +
    '<td>' + esc(p.INSTRUTOR_NOME) + '</td><td>' + fmtData(p.DATA_PLANEJADA) + '</td><td>' + fmtData(p.DATA_REALIZADA) + '</td>' +
    '<td><span class="badge ' + badgeStatus(p.STATUS_EFETIVO) + '">' + esc(p.STATUS_EFETIVO) + '</span></td>' +
    '<td><button class="btn btn-sm" onclick="editarPlano(\'' + p.PLANO_ID + '\')">Editar</button></td></tr>'
  ).join('') || '<tr><td colspan="9"><div class="vazio">Nenhum treinamento encontrado</div></td></tr>';
  renderPaginacao('paginacaoPlano', r, p => renderPlano(p));
}

async function editarPlano(id) {
  const r = await callServer('listarPlanoTreinamento', { porPagina: 5000 });
  const item = r.dados.find(x => x.PLANO_ID === id);
  abrirModalPlano(item);
}

function abrirModalPlano(item) {
  ESTADO.planoEditando = item ? item.PLANO_ID : null;
  document.getElementById('modalPlanoTitulo').textContent = item ? 'Editar treinamento' : 'Novo treinamento planejado';
  const optColab = [{ v: '', n: 'Selecione...' }].concat(ESTADO.boot.colaboradoresResumo.map(c => ({ v: c.COLABORADOR_ID, n: c.NOME })));
  const optProc = [{ v: '', n: 'Selecione...' }].concat(ESTADO.boot.estrutura.processos.map(p => ({ v: p.PROCESSO_ID, n: p.NOME })));
  const optInstrutor = [{ v: '', n: '-' }].concat(ESTADO.boot.colaboradoresResumo.map(c => ({ v: c.COLABORADOR_ID, n: c.NOME })));
  const optStatus = ESTADO.boot.statusPlano.map(s => ({ v: s, n: s }));

  document.getElementById('formPlano').innerHTML =
    campoHtml('Colaborador', 'plnColaborador', 'select', optColab, item && item.COLABORADOR_ID) +
    campoHtml('Processo', 'plnProcesso', 'select', optProc, item && item.PROCESSO_ID) +
    campoHtml('Treinamento', 'plnTreinamento', 'text', null, item && item.TREINAMENTO, true) +
    campoHtml('Instrutor', 'plnInstrutor', 'select', optInstrutor, item && item.INSTRUTOR_ID) +
    campoHtml('Status', 'plnStatus', 'select', optStatus, (item && item.STATUS) || 'Planejado') +
    campoHtml('Data planejada', 'plnDataPlanejada', 'date', null, item && item.DATA_PLANEJADA) +
    campoHtml('Data realizada', 'plnDataRealizada', 'date', null, item && item.DATA_REALIZADA) +
    campoHtml('Resultado', 'plnResultado', 'text', null, item && item.RESULTADO) +
    campoHtml('Nível alcançado (se concluído)', 'plnNivel', 'number', null, item && item.NIVEL_ALCANCADO) +
    campoHtml('Observação', 'plnObs', 'textarea', null, item && item.OBSERVACAO, true);
  abrirModal('modalPlano');
}

async function salvarPlanoForm() {
  const item = {
    PLANO_ID: ESTADO.planoEditando || '', COLABORADOR_ID: val('plnColaborador'), PROCESSO_ID: val('plnProcesso'),
    TREINAMENTO: val('plnTreinamento'), INSTRUTOR_ID: val('plnInstrutor'), STATUS: val('plnStatus'),
    DATA_PLANEJADA: val('plnDataPlanejada'), DATA_REALIZADA: val('plnDataRealizada'), RESULTADO: val('plnResultado'),
    NIVEL_ALCANCADO: val('plnNivel'), OBSERVACAO: val('plnObs')
  };
  try {
    await callServer('salvarPlanoTreinamento', item);
    toast('Plano de treinamento salvo.', 'sucesso');
    fecharModal('modalPlano');
    renderPlano(ESTADO.paginas.plano);
  } catch (e) {}
}

// ---------------------------------------------------------------
// 14) PROCESSOS E COMPETÊNCIAS (cadastros + mapa + sucessão)
// ---------------------------------------------------------------
async function renderProcessos() {
  const e = ESTADO.boot.estrutura;
  document.getElementById('listaSetores').innerHTML = listaCrudHtml(e.setores, 'SETOR_ID', 'NOME', 'setor');
  document.getElementById('listaAreas').innerHTML = listaCrudHtml(e.areas, 'AREA_ID', 'NOME', 'area');
  document.getElementById('listaFuncoes').innerHTML = listaCrudHtml(e.funcoes, 'FUNCAO_ID', 'NOME', 'funcao');
  document.getElementById('listaProcessos').innerHTML = listaCrudHtml(e.processos, 'PROCESSO_ID', 'NOME', 'processo');

  const mapa = await callServer('getMapaCompetencias');
  document.getElementById('tabelaMapaCompetencias').innerHTML =
    '<thead><tr><th>Competência</th>' + mapa.setores.map(s => '<th>' + esc(s) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + mapa.linhas.map(l => '<tr><td>' + esc(l.competencia) + '</td>' + mapa.setores.map(s => '<td>' + (l[s] === null ? '-' : celulaMapa(l[s])) + '</td>').join('') + '</tr>').join('') + '</tbody>';

  const sucessao = await callServer('getMatrizSucessaoTodos', ESTADO.filtro);
  document.querySelector('#tabelaSucessao tbody').innerHTML = sucessao.map(s =>
    '<tr><td>' + esc(s.processo) + '</td><td>' + (s.titular ? esc(s.titular.nome) + ' — Nível ' + s.titular.nivel : '<i>Nenhum</i>') + '</td>' +
    '<td>' + (s.backups.length ? s.backups.map(b => esc(b.nome) + ' (N' + b.nivel + ')').join(', ') : '<i>Nenhum</i>') + '</td>' +
    '<td>' + s.emoji + ' ' + s.risco + '</td></tr>'
  ).join('');
}

function celulaMapa(pct) {
  let cor = '#0f9d58'; if (pct <= 30) cor = '#db4437'; else if (pct <= 60) cor = '#f29900';
  return '<span style="color:' + cor + ';font-weight:700;">' + pct + '%</span>';
}

function listaCrudHtml(itens, idCampo, nomeCampo, tipo) {
  if (!itens.length) return '<div class="vazio">Nenhum registro</div>';
  return '<div class="tabela-wrap"><table class="tabela"><tbody>' + itens.map(i =>
    '<tr><td>' + esc(i[nomeCampo]) + '</td><td style="width:90px;text-align:right;">' +
    '<button class="btn btn-sm" onclick="abrirModalGenerico(\'' + tipo + '\',\'' + i[idCampo] + '\')">Editar</button></td></tr>'
  ).join('') + '</tbody></table></div>';
}

const CONFIG_GENERICO = {
  setor: { titulo: 'Setor', salvar: 'salvarSetor', campos: [['NOME', 'Nome', 'text']] },
  area: { titulo: 'Área', salvar: 'salvarArea', campos: [['SETOR_ID', 'Setor', 'select-setor'], ['NOME', 'Nome', 'text']] },
  funcao: { titulo: 'Função', salvar: 'salvarFuncao', campos: [['SETOR_ID', 'Setor', 'select-setor'], ['NOME', 'Nome', 'text']] },
  processo: { titulo: 'Processo / Competência', salvar: 'salvarProcesso', campos: [['FUNCAO_ID', 'Função', 'select-funcao'], ['NOME', 'Nome', 'text']] },
  usuario: { titulo: 'Usuário', salvar: 'salvarUsuario', campos: [['EMAIL', 'E-mail (conta Google)', 'text'], ['NOME', 'Nome', 'text'], ['PERFIL', 'Perfil', 'select-perfil'], ['ATIVO', 'Ativo', 'select-bool']] }
};

function abrirModalGenerico(tipo, id) {
  ESTADO.genericoTipo = tipo; ESTADO.genericoId = id;
  const cfg = CONFIG_GENERICO[tipo];
  document.getElementById('modalGenericoTitulo').textContent = (id ? 'Editar ' : 'Novo ') + cfg.titulo;
  let itemAtual = null;
  if (id) {
    const listaOrigem = { setor: 'setores', area: 'areas', funcao: 'funcoes', processo: 'processos' }[tipo];
    if (listaOrigem) itemAtual = ESTADO.boot.estrutura[listaOrigem].find(x => x[Object.keys(x)[0]] === id);
  }
  document.getElementById('formGenerico').innerHTML = cfg.campos.map(([campo, label, tipoCampo]) => {
    const id_ = 'gen_' + campo;
    const valorAtual = itemAtual ? itemAtual[campo] : '';
    if (tipoCampo === 'select-setor') return campoHtml(label, id_, 'select', ESTADO.boot.estrutura.setores.map(s => ({ v: s.SETOR_ID, n: s.NOME })), valorAtual);
    if (tipoCampo === 'select-funcao') return campoHtml(label, id_, 'select', ESTADO.boot.estrutura.funcoes.map(f => ({ v: f.FUNCAO_ID, n: f.NOME })), valorAtual);
    if (tipoCampo === 'select-perfil') return campoHtml(label, id_, 'select', ESTADO.boot.perfis.map(p => ({ v: p, n: p })), valorAtual || 'Visualização');
    if (tipoCampo === 'select-bool') return campoHtml(label, id_, 'select', [{ v: 'true', n: 'Sim' }, { v: 'false', n: 'Não' }], valorAtual === false ? 'false' : 'true');
    return campoHtml(label, id_, 'text', null, valorAtual);
  }).join('');
  abrirModal('modalGenerico');
}

async function salvarGenerico() {
  const tipo = ESTADO.genericoTipo, cfg = CONFIG_GENERICO[tipo];
  const item = {};
  const idCampoMap = { setor: 'SETOR_ID', area: 'AREA_ID', funcao: 'FUNCAO_ID', processo: 'PROCESSO_ID', usuario: 'USUARIO_ID' };
  item[idCampoMap[tipo]] = ESTADO.genericoId || '';
  cfg.campos.forEach(([campo, , tipoCampo]) => {
    let v = val('gen_' + campo);
    if (tipoCampo === 'select-bool') v = v === 'true';
    item[campo] = v;
  });
  try {
    await callServer(cfg.salvar, item);
    toast(cfg.titulo + ' salvo com sucesso.', 'sucesso');
    fecharModal('modalGenerico');
    ESTADO.boot.estrutura = await callServer('getEstruturaCompleta');
    popularFiltros();
    if (['setor', 'area', 'funcao', 'processo'].indexOf(tipo) > -1) renderProcessos();
    if (tipo === 'usuario') renderConfiguracoes();
  } catch (e) {}
}

// ---------------------------------------------------------------
// 15) RELATÓRIOS (item 27)
// ---------------------------------------------------------------
async function gerarRelatorio() {
  const tipo = document.getElementById('selectTipoRelatorio').value;
  const rel = await callServer('getRelatorio', tipo, ESTADO.filtro);
  ESTADO.relatorioAtual = rel;
  const tabela = document.getElementById('tabelaRelatorio');
  tabela.innerHTML = '<thead><tr>' + rel.colunas.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rel.linhas.map(l => '<tr>' + l.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody>';
}

async function exportarCSV() {
  const tipo = document.getElementById('selectTipoRelatorio').value;
  const csv = await callServer('exportarRelatorioCSV', tipo, ESTADO.filtro);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = tipo + '_' + new Date().toISOString().substring(0, 10) + '.csv';
  document.body.appendChild(link); link.click(); link.remove();
}

// ---------------------------------------------------------------
// 16) ALERTAS
// ---------------------------------------------------------------
async function renderAlertas() {
  const alertas = await callServer('getAlertas', ESTADO.filtro);
  document.getElementById('listaAlertasCompleta').innerHTML = alertas.length ? alertas.map(a =>
    '<div class="alerta-item ' + (a.nivel === 'Crítico' ? 'critico' : 'atencao') + '">' +
      '<span class="ic">' + (a.nivel === 'Crítico' ? '🔴' : '🟠') + '</span>' +
      '<div class="msg"><span class="tipo">' + esc(a.tipo) + '</span>' + esc(a.mensagem) + '</div>' +
    '</div>'
  ).join('') : '<div class="vazio">Nenhum alerta no momento 🎉</div>';
}

// ---------------------------------------------------------------
// 17) PAINEL DE GESTÃO VISUAL (TV) — item 21
// ---------------------------------------------------------------
let timerPainelTv = null;
async function renderPainelTv() {
  const d = await callServer('getPainelVisual');
  const k = d.kpis;
  document.getElementById('kpisPainelTv').innerHTML =
    kpiCardHtml(k.coberturaMedia + '%', 'Cobertura geral', 'verde', '📈') +
    kpiCardHtml(k.versatilidadeMedia + '%', 'Versatilidade média', 'roxo', '🧩') +
    kpiCardHtml(k.processosCriticos, 'Processos críticos', 'vermelho', '🔴') +
    kpiCardHtml(k.treinamentosAtrasados, 'Treinamentos atrasados', 'laranja', '⏱️') +
    kpiCardHtml(k.treinamentosVencidos, 'Vencidos', 'vermelho', '❗') +
    kpiCardHtml(k.colaboradoresEmTreinamento, 'Em treinamento', 'amarelo', '🎓');

  graficoBarras('chartTvCoberturaSetor', d.coberturaPorSetor.map(s => s.setor), [{ label: 'Cobertura %', data: d.coberturaPorSetor.map(s => s.cobertura), backgroundColor: '#4285f4' }]);
  graficoLinhas('chartTvEvolucao', d.evolucaoMensal.map(e => fmtData(e.DATA)), [{ label: 'Cobertura', data: d.evolucaoMensal.map(e => e.COBERTURA_MEDIA), borderColor: '#4285f4', backgroundColor: '#4285f4' }]);

  document.getElementById('tvProcessosCriticos').innerHTML = d.processosCriticos.length
    ? '<div class="tabela-wrap"><table class="tabela"><tbody>' + d.processosCriticos.map(p => '<tr><td>' + p.emoji + ' ' + esc(p.processo) + '</td><td>' + p.cobertura + '%</td></tr>').join('') + '</tbody></table></div>'
    : '<div class="vazio">Nenhum processo crítico</div>';
  document.getElementById('tvAtrasados').innerHTML = d.atrasados.length
    ? d.atrasados.map(a => '<div class="alerta-item atencao"><span class="ic">⏱️</span><div class="msg">' + esc(a.colaborador) + ' — ' + esc(a.processo) + '</div></div>').join('')
    : '<div class="vazio">Nenhum treinamento atrasado 🎉</div>';
  document.getElementById('tvTreinamentosHoje').innerHTML = d.treinamentosHoje.length
    ? '<div class="tabela-wrap"><table class="tabela"><tbody>' + d.treinamentosHoje.map(t => '<tr><td>' + esc(t.colaborador) + '</td><td>' + esc(t.processo) + '</td><td>' + esc(t.status) + '</td></tr>').join('') + '</tbody></table></div>'
    : '<div class="vazio">Nenhum treinamento agendado para hoje</div>';

  if (timerPainelTv) clearInterval(timerPainelTv);
  timerPainelTv = setInterval(() => { if (ESTADO.viewAtual === 'painel-tv') renderPainelTv(); }, 120000);
}

// ---------------------------------------------------------------
// 18) CONFIGURAÇÕES (item 39)
// ---------------------------------------------------------------
async function renderConfiguracoes() {
  const configs = ESTADO.boot.config;
  const porChave = {}; configs.forEach(c => porChave[c.CHAVE] = c.VALOR);

  document.getElementById('formEmpresa').innerHTML =
    campoHtml('Nome da empresa', 'cfgEmpresaNome', 'text', null, porChave['EMPRESA_NOME']) +
    campoHtml('Logo (URL)', 'cfgLogoUrl', 'text', null, porChave['EMPRESA_LOGO_URL']) +
    campoHtml('Unidade / Planta', 'cfgUnidade', 'text', null, porChave['UNIDADE']) +
    campoHtml('Localização', 'cfgLocalizacao', 'text', null, porChave['LOCALIZACAO']);

  document.getElementById('formLimites').innerHTML =
    campoHtml('Validade padrão (meses)', 'cfgValidadePadrao', 'number', null, porChave['VALIDADE_PADRAO_MESES']) +
    campoHtml('Aviso de vencimento (dias antes)', 'cfgProxVencimento', 'number', null, porChave['PROX_VENCIMENTO_DIAS']) +
    campoHtml('Cobertura crítica até (%)', 'cfgCoberturaCritico', 'number', null, porChave['COBERTURA_CRITICO_MAX']) +
    campoHtml('Cobertura atenção até (%)', 'cfgCoberturaAtencao', 'number', null, porChave['COBERTURA_ATENCAO_MAX']) +
    campoHtml('Versatilidade crítica até (%)', 'cfgVersatCritico', 'number', null, porChave['VERSAT_CRITICO_MAX']) +
    campoHtml('Versatilidade baixa até (%)', 'cfgVersatBaixo', 'number', null, porChave['VERSAT_BAIXO_MAX']) +
    campoHtml('Versatilidade em desenv. até (%)', 'cfgVersatDesenv', 'number', null, porChave['VERSAT_DESENV_MAX']) +
    campoHtml('Versatilidade boa até (%)', 'cfgVersatBom', 'number', null, porChave['VERSAT_BOM_MAX']) +
    campoHtml('Mín. habilitados p/ não ser risco', 'cfgMinHabilitados', 'number', null, porChave['MIN_HABILITADOS_SEM_RISCO']);

  document.querySelector('#tabelaNiveis tbody').innerHTML = ESTADO.boot.estrutura.niveis.map(n =>
    '<tr><td>' + n.NIVEL_ID + '</td><td>' + esc(n.NOME) + '</td><td>' + esc(n.DESCRICAO) + '</td>' +
    '<td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:' + n.COR + ';"></span> ' + n.COR + '</td>' +
    '<td style="font-size:16px;">' + n.ICONE + '</td><td>' + (n.COBRE_PROCESSO ? 'Sim' : 'Não') + '</td><td>' + (n.PODE_INSTRUIR ? 'Sim' : 'Não') + '</td>' +
    '<td><button class="btn btn-sm" onclick="editarNivel(' + n.NIVEL_ID + ')">Editar</button></td></tr>'
  ).join('');

  const usuarios = await callServer('listarUsuarios').catch(() => []);
  document.querySelector('#tabelaUsuarios tbody').innerHTML = (usuarios || []).map(u =>
    '<tr><td>' + esc(u.NOME) + '</td><td>' + esc(u.EMAIL) + '</td><td>' + esc(u.PERFIL) + '</td><td>' + (u.ATIVO ? 'Sim' : 'Não') + '</td>' +
    '<td><button class="btn btn-sm" onclick="abrirModalGenericoUsuario(\'' + u.USUARIO_ID + '\',\'' + esc(u.EMAIL) + '\',\'' + esc(u.NOME) + '\',\'' + u.PERFIL + '\',' + !!u.ATIVO + ')">Editar</button></td></tr>'
  ).join('') || '<tr><td colspan="5"><div class="vazio">Somente administradores veem esta lista</div></td></tr>';
}

function abrirModalGenericoUsuario(id, email, nome, perfil, ativo) {
  ESTADO.genericoTipo = 'usuario'; ESTADO.genericoId = id;
  document.getElementById('modalGenericoTitulo').textContent = 'Editar Usuário';
  document.getElementById('formGenerico').innerHTML =
    campoHtml('E-mail', 'gen_EMAIL', 'text', null, email) +
    campoHtml('Nome', 'gen_NOME', 'text', null, nome) +
    campoHtml('Perfil', 'gen_PERFIL', 'select', ESTADO.boot.perfis.map(p => ({ v: p, n: p })), perfil) +
    campoHtml('Ativo', 'gen_ATIVO', 'select', [{ v: 'true', n: 'Sim' }, { v: 'false', n: 'Não' }], String(ativo));
  abrirModal('modalGenerico');
}

async function editarNivel(id) {
  const n = ESTADO.boot.estrutura.niveis.find(x => Number(x.NIVEL_ID) === id);
  const novoNome = prompt('Nome do nível:', n.NOME); if (novoNome === null) return;
  const novaCor = prompt('Cor (hex, ex: #4285F4):', n.COR); if (novaCor === null) return;
  const novoIcone = prompt('Ícone (emoji/símbolo):', n.ICONE); if (novoIcone === null) return;
  await callServer('salvarNivel', Object.assign({}, n, { NOME: novoNome, COR: novaCor, ICONE: novoIcone }));
  ESTADO.boot.estrutura = await callServer('getEstruturaCompleta');
  toast('Nível atualizado.', 'sucesso');
  renderConfiguracoes();
}

async function salvarConfigEmpresa() {
  await Promise.all([
    callServer('setConfigValue', 'EMPRESA_NOME', val('cfgEmpresaNome')),
    callServer('setConfigValue', 'EMPRESA_LOGO_URL', val('cfgLogoUrl')),
    callServer('setConfigValue', 'UNIDADE', val('cfgUnidade')),
    callServer('setConfigValue', 'LOCALIZACAO', val('cfgLocalizacao'))
  ]);
  toast('Configurações da empresa salvas. Recarregue a página para ver o nome atualizado no menu.', 'sucesso');
}

async function salvarLimites() {
  await Promise.all([
    callServer('setConfigValue', 'VALIDADE_PADRAO_MESES', val('cfgValidadePadrao')),
    callServer('setConfigValue', 'PROX_VENCIMENTO_DIAS', val('cfgProxVencimento')),
    callServer('setConfigValue', 'COBERTURA_CRITICO_MAX', val('cfgCoberturaCritico')),
    callServer('setConfigValue', 'COBERTURA_ATENCAO_MAX', val('cfgCoberturaAtencao')),
    callServer('setConfigValue', 'VERSAT_CRITICO_MAX', val('cfgVersatCritico')),
    callServer('setConfigValue', 'VERSAT_BAIXO_MAX', val('cfgVersatBaixo')),
    callServer('setConfigValue', 'VERSAT_DESENV_MAX', val('cfgVersatDesenv')),
    callServer('setConfigValue', 'VERSAT_BOM_MAX', val('cfgVersatBom')),
    callServer('setConfigValue', 'MIN_HABILITADOS_SEM_RISCO', val('cfgMinHabilitados'))
  ]);
  ESTADO.boot.config = await callServer('getAllConfig');
  toast('Limites salvos com sucesso.', 'sucesso');
}
