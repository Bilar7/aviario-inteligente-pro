// Estado do módulo: finance
export const state = {
      // MÓDULO FINANCEIRO DE ELITE (CAIXA & FINANÇAS INTEGRADO)
      finView: 'visao_geral',
  // visao_geral, livro_caixa, receitas, despesas, a_receber, a_pagar, analises, ia_analise, auditoria
      finPeriod: 'todos',
  finSearch: '',
  finCategoryFilter: 'all',
  finTypeFilter: 'all',
  // all, entrada, saida
      finMethodFilter: 'all',
  finCustomStart: '',
  finCustomEnd: '',
  finChartRange: '7d',
  // 7d, 30d, 3m, 6m, 1y
      showMoreFinMenu: false,
  selectedTransactionForDetail: null,
  showTransactionDetailModal: false,
};
