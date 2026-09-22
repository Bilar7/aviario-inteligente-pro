// Estado do módulo: navigation
export const state = {
  // Navegação Principal & Mobile
      view: 'dashboard',
  mobileMenuOpen: false,
  moreOpen: false,
  selectedLoteId: '',
  subTabLotes: 'ativos',
  subTabRacao: 'consumo',
  subTabVendas: 'pdv',
  subTabFinancas: 'caixa',
  subTabClientes: 'lista',
  subTabEquipa: 'funcionarios',
  subTabDespesas: 'energia',
  subTabStock: 'produtos',
  subTabPlanilha: 'lotes',
  subTabRelatorios: 'producao',
  subTabConfiguracoes: 'aviario',
  // Filtros e Pesquisas
      planilhaSearch: '',
  planilhaSortCol: '',
  planilhaSortAsc: true,
  relatorioPeriod: 'mes',
  alertFilter: 'todos',
};
