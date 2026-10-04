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
  archiveDate: new Date().toISOString().slice(0, 10),
  archivePeriod: 'month',
  archiveType: 'all',
  archiveSelectedRecord: null,
  // Filtros e Pesquisas
      planilhaSearch: '',
  planilhaSortCol: '',
  planilhaSortAsc: true,
  relatorioPeriod: 'mes',
  alertFilter: 'todos',
};
