import * as XLSX from "xlsx";
import { generateProfessionalAviarioPDF, generateSaleInvoicePDF, generateFinanceReportPDF } from "./pdf.js";

function safeText(value, fallback) { return String(value === undefined || value === null || value === '' ? (fallback || '') : value); }

export function buildCompanyProfileRows(settings) {
  settings = settings || {};
  return [
    ['PERFIL DA EMPRESA'],
    ['Empresa / Aviário', safeText(settings.companyLegalName || settings.farmName, 'Aviário Inteligente Pro')],
    ['Subtítulo / Actividade', safeText(settings.companySubtitle || settings.tagline, 'Sistema Integrado de Gestão Avícola & Produção')],
    ['Telefone', safeText(settings.phone, 'Não informado')],
    ['E-mail', safeText(settings.companyEmail, 'Não informado')],
    ['Morada / Localização', safeText(settings.companyAddress || settings.location, 'Não informado')],
    ['Responsável / Assinatura', safeText(settings.signatureName || settings.ownerName, 'Não informado')],
    ['Cargo', safeText(settings.signatureTitle, 'Responsável')],
    ['Logotipo', settings.companyLogo ? 'Logotipo da empresa configurado — usado em PDFs e impressão' : 'Logotipo padrão do sistema — usado automaticamente em PDFs e impressão'],
    ['Rodapé', safeText(settings.reportFooter, 'Relatório emitido automaticamente pelo sistema.')],
    ['Assinatura', settings.signatureImage ? 'Imagem de assinatura configurada' : safeText(settings.signatureName, 'Não configurada')],
  ];
}

export function addBrandingSheet(wb, settings) {
  var rows = buildCompanyProfileRows(settings);
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:28},{wch:62}];
  wb.Props = Object.assign({}, wb.Props || {}, {
    Title: safeText(settings && (settings.companyLegalName || settings.farmName), 'Aviário Inteligente Pro'),
    Subject: safeText(settings && (settings.companySubtitle || settings.tagline), 'Relatório de gestão avícola'),
    Author: safeText(settings && (settings.signatureName || settings.ownerName), 'Responsável'),
    Company: safeText(settings && (settings.companyLegalName || settings.farmName), 'Aviário Inteligente Pro')
  });
  XLSX.utils.book_append_sheet(wb, ws, '00_Perfil_Empresa');
}


// ============================================================
// ============================================================

export function exportFinanceExcel(data) {
  data = data || {};
  var settings = data.settings || {};
  var sum = data.sum || {};
  var trans = data.trans || [];
  var smart = data.smart || {};
  var wb = XLSX.utils.book_new();
  addBrandingSheet(wb, settings);

  var rows = [
    ['AVIÁRIO INTELIGENTE PRO — LIVRO DE CAIXA & EXTRATO'],
    ['Período', data.period || '', 'Gerado em', new Date().toLocaleString('pt-PT')],
    ['Saldo atual', sum.saldoCaixa || 0, 'Receitas período', sum.periodReceitas || 0, 'Despesas período', sum.periodDespesas || 0, 'Resultado', sum.lucro || 0],
    [], ['Data','Hora','Tipo','Categoria','Descrição','Forma Pagamento','Entrada (MT)','Saída (MT)','Saldo Acumulado (MT)','Responsável','Origem']
  ];
  trans.forEach(function(t){
    rows.push([t.date || '',t.time || '',t.type || '',t.category || '',t.desc || t.description || '',t.paymentMethod || '',t.type==='ENTRADA'?t.amount:0,t.type==='SAÍDA'?t.amount:0,t.runningBalance || 0,t.responsible || '',t.derived?'Derivado':'Registo']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Livro_Caixa');

  var projection = smart.projection || {};
  var resumo = [
    ['INDICADORES DE GESTÃO','VALOR'],
    ['Saldo atual (MT)', sum.saldoCaixa || 0], ['Receitas do período (MT)', sum.periodReceitas || 0], ['Despesas do período (MT)', sum.periodDespesas || 0],
    ['Lucro do período (MT)', sum.lucro || 0], ['Margem (%)', Number(sum.margemLucro)||0], ['A receber (MT)', sum.totalAReceber || 0], ['A pagar (MT)', sum.totalAPagar || 0],
    ['Aves atuais', smart.remainingBirds || 0], ['Mortalidade (%)', smart.mortalityRate || 0], ['Ração em stock (kg)', smart.feedStockKg || 0], ['Cobertura de ração (dias)', Number(smart.feedStockDays || 0)],
    ['Receita projetada (MT)', projection.revenue || 0], ['Custo projetado (MT)', projection.costs || 0], ['Resultado projetado (MT)', projection.profit || 0], ['Margem projetada (%)', Number(projection.margin || 0)]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo_Gestao');

  var methodsRows=[['MÉTODO','SALDO (MT)']];
  Object.keys(sum.methods || {}).forEach(function(m){ methodsRows.push([m,sum.methods[m]]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(methodsRows), 'Metodos_Pagamento');

  var alertRows=[['NÍVEL','ALERTA','DETALHE']];
  (data.alerts || []).forEach(function(a){ alertRows.push([a.type || '',a.title || '',a.detail || a.message || '']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alertRows), 'Alertas');

  var agendaRows=[['DATA','ATIVIDADE','DETALHE']];
  (data.agenda || []).forEach(function(a){ agendaRows.push([a.date || '',a.title || '',a.detail || '']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agendaRows), 'Agenda');

  var healthRows=[['DATA','LOTE','TIPO','PRODUTO/TRATAMENTO','QTD','CUSTO (MT)','PRÓXIMA DATA','REGISTADO POR','OBSERVAÇÕES']];
  (data.healthLogs || []).forEach(function(h){ healthRows.push([h.date,h.loteCode,h.type,h.product,h.quantity,h.cost,h.nextDate,h.recordedBy,h.notes]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(healthRows), 'Saude_Vacinacao');

  var fileName='Aviario_Inteligente_Pro_Gestao_Financeira_'+(settings.farmName || settings.companyLegalName || 'Aviario').replace(/\s+/g,'_')+'_'+(data.today || new Date().toISOString().slice(0,10))+'.xlsx';
  XLSX.writeFile(wb, fileName);
  return {success:true,fileName:fileName};
}

export function exportDailyControlExcel(data) {
  data = data || {};
  var wb = XLSX.utils.book_new();
  addBrandingSheet(wb, data.settings || {});
  var rows = [
    ['Aviário Inteligente Pro — Controlo do Dia: ' + (data.date || '')],
    ['Produto', 'Preço Unit. (MT)', 'Inicial', 'Entradas', 'Disponível', 'Sobrou', 'Vendas (Qtd)', 'Total (MT)']
  ];
  (data.products || []).forEach(function(item){ rows.push(item); });
  var total = data.total || {};
  rows.push(['TOTAL GERAL', '', '', '', '', '', total.totalUnidades || 0, total.totalVendas || 0]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Controlo do Dia');
  var fileName='Controlo_Dia_'+(data.date || new Date().toISOString().slice(0,10))+'.xlsx';
  XLSX.writeFile(wb, fileName);
  return {success:true,fileName:fileName};
}

export function exportSmartExcel(farmData) {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca Excel a carregar. Verifique a ligação.');
    return;
  }

  var wb = XLSX.utils.book_new();
  addBrandingSheet(wb, farmData.settings || {});
  var dateStr = new Date().toISOString().slice(0, 10);
  
  // -------------------------------------------------------------
  // ABA 01: DASHBOARD RESUMO
  // -------------------------------------------------------------
  farmData.settings = farmData.settings || {};
  farmData.kpis = farmData.kpis || {};
  var dashRows = [
    [safeText(farmData.settings.companyLegalName || farmData.settings.farmName, 'AVIÁRIO INTELIGENTE PRO').toUpperCase() + ' — RELATÓRIO DE GESTÃO'],
    ['Relatório Consolidado de Desempenho e Finanças', 'Data:', dateStr],
    [],
    ['INDICADOR DE DESEMPENHO', 'VALOR', 'UNIDADE / STATUS'],
    ['Nome do Aviário / Empresa', farmData.settings.farmName || 'Meu Aviário', ''],
    ['Lote Ativo Selecionado', farmData.activeLote ? farmData.activeLote.code + ' (' + farmData.activeLote.breed + ')' : 'Nenhum', ''],
    ['Pintos / Frangos Iniciais', farmData.kpis.initialBirds, 'aves'],
    ['Mortalidade Acumulada', farmData.kpis.deaths, 'aves (' + farmData.kpis.mortalityRate + '%)'],
    ['Frangos Vendidos', farmData.kpis.soldBirds, 'aves'],
    ['Frangos Disponíveis em Stock', farmData.kpis.remainingBirds, 'aves'],
    ['Peso Médio Atual', farmData.kpis.avgWeight, 'kg/ave'],
    ['Peso Vivo Total Estimado', (farmData.kpis.remainingBirds * farmData.kpis.avgWeight).toFixed(1), 'kg'],
    ['Consumo Total de Ração', farmData.kpis.totalFeedKg, 'kg (' + (farmData.kpis.totalFeedKg / 50).toFixed(1) + ' sacos)'],
    ['Conversão Alimentar (FCR)', farmData.kpis.fcr, 'kg ração / kg peso'],
    [],
    ['RESUMO FINANCEIRO', 'VALOR (MT)', 'OBSERVAÇÕES'],
    ['Receita Total de Vendas', farmData.kpis.totalRevenue, 'MT'],
    ['Despesas Totais de Produção', farmData.kpis.totalExpenses, 'MT'],
    ['Lucro Líquido Real', farmData.kpis.netProfit, 'MT'],
    ['Margem de Lucro', farmData.kpis.profitMargin + '%', ''],
    ['Saldo Atual em Caixa', farmData.kpis.cashBalance, 'MT'],
    ['Contas a Receber (Dívidas Clientes)', farmData.kpis.accountsReceivable, 'MT'],
    ['Contas a Pagar (Fornecedores)', farmData.kpis.accountsPayable, 'MT']
  ];
  var wsDash = XLSX.utils.aoa_to_sheet(dashRows);
  XLSX.utils.book_append_sheet(wb, wsDash, '01_Dashboard');

  // -------------------------------------------------------------
  // ABA 02: LOTES & DESEMPENHO
  // -------------------------------------------------------------
  var lotesRows = [
    ['CÓDIGO', 'DATA ENTRADA', 'RAÇA', 'QTD INICIAL', 'MORTES', 'MORTALIDADE %', 'VENDIDOS', 'RESTANTES', 'PESO MÉDIO (KG)', 'FCR', 'STATUS', 'CUSTO PINTOS (MT)']
  ];
  (farmData.lotes || []).forEach(function(l) {
    var mort = l.deaths || 0;
    var mortPct = l.initialBirds > 0 ? ((mort / l.initialBirds) * 100).toFixed(2) : '0.00';
    var rest = (l.initialBirds || 0) - mort - (l.soldBirds || 0);
    lotesRows.push([
      l.code, l.entryDate, l.breed, l.initialBirds, mort, mortPct + '%', l.soldBirds || 0, rest, l.avgWeight || 0, l.fcr || '—', l.status || 'Ativo', l.costChicks || 0
    ]);
  });
  var wsLotes = XLSX.utils.aoa_to_sheet(lotesRows);
  XLSX.utils.book_append_sheet(wb, wsLotes, '02_Lotes');

  // -------------------------------------------------------------
  // ABA 03: MORTALIDADE DIÁRIA
  // -------------------------------------------------------------
  var mortRows = [
    ['DATA', 'LOTE', 'QUANTIDADE DE MORTES', 'MOTIVO / OBSERVAÇÃO', 'REGISTADO POR']
  ];
  (farmData.mortalityLogs || []).forEach(function(m) {
    mortRows.push([m.date, m.loteCode, m.qty, m.reason || 'Normal/Seleção', m.recordedBy || 'Responsável']);
  });
  var wsMort = XLSX.utils.aoa_to_sheet(mortRows);
  XLSX.utils.book_append_sheet(wb, wsMort, '03_Mortalidade');

  // -------------------------------------------------------------
  // ABA 04: RAÇÃO & ALIMENTAÇÃO
  // -------------------------------------------------------------
  var racaoRows = [
    ['TIPO / DATA', 'LOTE', 'MOVIMENTO', 'QUANTIDADE (KG)', 'SACOS (50KG)', 'PREÇO/SACO (MT)', 'CUSTO TOTAL (MT)', 'FORNECEDOR / OBS']
  ];
  (farmData.feedLogs || []).forEach(function(f) {
    racaoRows.push([
      f.type + ' (' + f.date + ')', f.loteCode || 'Geral', f.movement, f.qtyKg, (f.qtyKg / 50).toFixed(1), f.pricePerBag || 0, f.totalCost || 0, f.supplier || '—'
    ]);
  });
  var wsRacao = XLSX.utils.aoa_to_sheet(racaoRows);
  XLSX.utils.book_append_sheet(wb, wsRacao, '04_Racao_FCR');

  // -------------------------------------------------------------
  // ABA 05: VENDAS DE FRANGOS
  // -------------------------------------------------------------
  var vendasRows = [
    ['DATA', 'CLIENTE', 'LOTE', 'QUANTIDADE', 'PESO TOTAL (KG)', 'PREÇO UNIT / KG', 'TOTAL (MT)', 'VALOR PAGO (MT)', 'MÉTODO PAGAMENTO', 'DÍVIDA (MT)', 'STATUS']
  ];
  (farmData.sales || []).forEach(function(v) {
    vendasRows.push([
      v.date, v.clientName, v.loteCode, v.qty, v.weightKg || '—', (v.pricePerUnit != null ? v.pricePerUnit : (v.priceUnit != null ? v.priceUnit : 0)), v.totalAmount, v.paidAmount, v.paymentMethod || '—', v.debtAmount, v.debtAmount > 0 ? 'Pendente' : 'Liquidado'
    ]);
  });
  var wsVendas = XLSX.utils.aoa_to_sheet(vendasRows);
  XLSX.utils.book_append_sheet(wb, wsVendas, '05_Vendas');

  // -------------------------------------------------------------
  // ABA 06: CLIENTES & DÍVIDAS
  // -------------------------------------------------------------
  var clientRows = [
    ['NOME DO CLIENTE', 'CONTACTO', 'ENDEREÇO', 'TIPO', 'TOTAL COMPRADO (MT)', 'TOTAL PAGO (MT)', 'SALDO EM DÍVIDA (MT)']
  ];
  (farmData.clients || []).forEach(function(c) {
    clientRows.push([
      c.name, c.phone, c.address || '—', c.type || 'Particular', c.totalBought || 0, c.totalPaid || 0, c.debt || 0
    ]);
  });
  var wsClients = XLSX.utils.aoa_to_sheet(clientRows);
  XLSX.utils.book_append_sheet(wb, wsClients, '06_Clientes');

  // -------------------------------------------------------------
  // ABA 07: DESPESAS OPERACIONAIS
  // -------------------------------------------------------------
  var despRows = [
    ['DATA', 'CATEGORIA', 'DESCRIÇÃO', 'LOTE', 'VALOR (MT)', 'FORMA PAGAMENTO', 'STATUS']
  ];
  (farmData.expenses || []).forEach(function(e) {
    despRows.push([
      e.date, e.category, (e.description != null ? e.description : e.desc), e.loteCode || 'Geral', e.amount, e.paymentMethod || 'Dinheiro', e.status || 'Pago'
    ]);
  });
  var wsDesp = XLSX.utils.aoa_to_sheet(despRows);
  XLSX.utils.book_append_sheet(wb, wsDesp, '07_Despesas');

  // -------------------------------------------------------------
  // ABA 08: FUNCIONÁRIOS & PONTO
  // -------------------------------------------------------------
  var staffRows = [
    ['NOME', 'CARGO', 'CONTACTO', 'SALÁRIO BASE (MT)', 'DIAS TRABALHADOS', 'ADIANTAMENTOS (MT)', 'SALÁRIO PAGO (MT)', 'A PAGAR (MT)']
  ];
  (farmData.staff || []).forEach(function(s) {
    staffRows.push([
      s.name, s.role, s.phone, s.salary, s.daysWorked || s.workedDays || 0, s.advances || s.advance || 0, s.paidSalary || s.salaryPaid || 0, s.pendingSalary || s.salaryPending || 0
    ]);
  });
  var wsStaff = XLSX.utils.aoa_to_sheet(staffRows);
  XLSX.utils.book_append_sheet(wb, wsStaff, '08_Funcionarios');

  // -------------------------------------------------------------
  // ABA 09: FLUXO DE CAIXA
  // -------------------------------------------------------------
  var cashRows = [
    ['DATA', 'TIPO', 'CATEGORIA', 'HISTÓRICO / DETALHES', 'ENTRADA (+MT)', 'SAÍDA (-MT)', 'SALDO (MT)']
  ];
  (farmData.cashLogs || []).forEach(function(k) {
    cashRows.push([
      k.date, k.type, k.category, k.description, k.type === 'IN' ? k.amount : 0, k.type === 'OUT' ? k.amount : 0, k.runningBalance || 0
    ]);
  });
  var wsCash = XLSX.utils.aoa_to_sheet(cashRows);
  XLSX.utils.book_append_sheet(wb, wsCash, '09_Caixa');

  // -------------------------------------------------------------
  // ABA 10: INVENTÁRIO DE STOCK
  // -------------------------------------------------------------
  var stockRows = [
    ['PRODUTO / ITEM', 'CATEGORIA', 'QUANTIDADE', 'UNIDADE', 'STOCK MÍNIMO', 'PREÇO MÉDIO (MT)', 'VALOR EM STOCK (MT)', 'ALERTA']
  ];
  (farmData.stockItems || []).forEach(function(st) {
    var alertStr = st.qty <= 0 ? ' ESGOTADO' : (st.qty <= st.minStock ? ' STOCK BAIXO' : ' NORMAL');
    stockRows.push([
      st.name, st.category, st.qty, st.unit || 'un', st.minStock || 5, st.unitPrice || 0, (st.qty * (st.unitPrice || 0)), alertStr
    ]);
  });
  var wsStock = XLSX.utils.aoa_to_sheet(stockRows);
  XLSX.utils.book_append_sheet(wb, wsStock, '10_Stock');

  var receiptsRows = [['DATA','CLIENTE','VALOR (MT)','MÉTODO PAGAMENTO','REFERÊNCIA','REGISTADO POR']];
  (farmData.receipts || []).forEach(function(r) { receiptsRows.push([r.date || '', r.clientName || '', Number(r.amount) || 0, r.paymentMethod || '—', r.referenceId || r.saleId || '', r.createdByName || r.responsible || '']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(receiptsRows), '11_Recebimentos');

  var attendRows = [['DATA','FUNCIONÁRIO','STATUS','ENTRADA','SAÍDA','OBSERVAÇÕES']];
  (farmData.attendance || []).forEach(function(a) { attendRows.push([a.date || '', a.staffName || a.name || '', a.status || '', a.checkIn || '', a.checkOut || '', a.notes || '']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attendRows), '12_Presença');

  var healthRows = [['DATA','LOTE','TIPO','PRODUTO','QUANTIDADE','CUSTO (MT)','PRÓXIMA DATA','REGISTADO POR']];
  (farmData.healthLogs || []).forEach(function(h) { healthRows.push([h.date || '', h.loteCode || '', h.type || '', h.product || '', Number(h.quantity || h.qty) || 0, Number(h.cost) || 0, h.nextDate || '', h.recordedBy || '']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(healthRows), '13_Saude');

  var energyRows = [['DATA','LEITURA ANTERIOR','LEITURA ACTUAL','CONSUMO','PREÇO KWH','CUSTO (MT)']];
  (farmData.energyLogs || []).forEach(function(e) { energyRows.push([e.date || '', Number(e.previous || e.prev || e.prevReading) || 0, Number(e.current || e.curr || e.currReading) || 0, Number(e.consumption || e.kwh) || 0, Number(e.priceKwh || e.price || e.pricePerKwh) || 0, Number(e.amount || e.cost) || 0]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(energyRows), '14_Energia');

  var statementRows = [['DATA','TIPO','CATEGORIA','DESCRIÇÃO','VALOR (MT)','MÉTODO','RESPONSÁVEL','REFERÊNCIA']];
  (farmData.cashTransactions || []).forEach(function(t){ statementRows.push([t.date||'',t.type||'',t.category||'',t.desc||t.description||'',Number(t.amount)||0,t.paymentMethod||'—',t.responsible||'',t.referenceId||'']); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(statementRows), '15_Extrato');
  var presentationRows = [['CAMPO','VALOR'],['Empresa', farmData.settings.companyLegalName || farmData.settings.farmName || 'Aviário Inteligente Pro'],['Subtítulo', farmData.settings.companySubtitle || farmData.settings.tagline || 'Gestão Avícola'],['Responsável', farmData.settings.signatureName || farmData.settings.ownerName || ''],['Cargo', farmData.settings.signatureTitle || ''],['Logotipo', farmData.settings.companyLogo ? 'Logotipo da empresa configurado — usado em PDFs e impressão' : 'Logotipo padrão do sistema — usado automaticamente em PDFs e impressão'],['Assinatura', farmData.settings.signatureImage ? 'Imagem configurada no perfil' : (farmData.settings.signatureName || 'Não configurada')],['Site','Desenvolvido por Bilar DigitalTech Solutions']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(presentationRows), '16_Apresentacao');

  // Acabamento comum: larguras legíveis e filtro na primeira linha das folhas de dados.
  wb.SheetNames.forEach(function(sheetName) {
    var ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) return;
    var range = XLSX.utils.decode_range(ws['!ref']);
    var widths = [];
    for (var c = range.s.c; c <= range.e.c; c++) {
      var maxLen = 10;
      for (var r = range.s.r; r <= Math.min(range.e.r, range.s.r + 120); r++) {
        var cell = ws[XLSX.utils.encode_cell({r:r,c:c})];
        var value = cell && cell.v != null ? String(cell.v) : '';
        if (value.length > maxLen) maxLen = value.length;
      }
      widths.push({wch: Math.min(Math.max(maxLen + 2, 12), 38)});
    }
    ws['!cols'] = widths;
    if (range.e.r >= range.s.r) ws['!autofilter'] = {ref: ws['!ref']};
  });

  // Gravação do Arquivo Excel
  var fileName = 'Aviario_Inteligente_Pro_Relatorio_' + (farmData.settings.farmName ? farmData.settings.farmName.replace(/\s+/g, '_') : 'Geral') + '_' + dateStr + '.xlsx';
  XLSX.writeFile(wb, fileName);
};

export const exportElementToPDF = generateProfessionalAviarioPDF;

export { generateProfessionalAviarioPDF, generateFinanceReportPDF };

export async function importSmartExcel(file, callback) {
  if (!file || typeof FileReader === 'undefined') return;
  var reader = new FileReader();
  reader.onload = function(event) {
    try {
      var data = new Uint8Array(event.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var importedData = {};
      workbook.SheetNames.forEach(function(sheetName) {
        importedData[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      });
      callback && callback(null, importedData);
    } catch (error) {
      callback && callback(error);
    }
  };
  reader.onerror = function(error) { callback && callback(error); };
  reader.readAsArrayBuffer(file);
}

export { generateSaleInvoicePDF };

