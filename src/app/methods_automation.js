// Automação: cálculos derivados, previsões e alertas operacionais.
// Não grava dados; apenas transforma os registos existentes em indicadores úteis.
export const methods = {
  getLoteTargetDate: function(lote) {
    if (!lote || !lote.entryDate) return '';
    var target = Number(lote.cycleDays) || Number(this.settings.cycleDays) || 38;
    var initialAge = Number(lote.initialAge) || 0;
    var date = new Date(lote.entryDate + 'T00:00:00');
    date.setDate(date.getDate() + Math.max(0, target - initialAge));
    return date.toISOString().slice(0,10);
  },
  formatShortDate: function(value) {
    if (!value) return '—';
    var d = new Date(value + (String(value).length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('pt-MZ', {day:'2-digit', month:'2-digit', year:'numeric'});
  },
  getLoteCurrentWeight: function(lote) {
    if (!lote) return 0;
    var logs = this.getLoteGrowthLogs ? this.getLoteGrowthLogs(lote.id) : [];
    if (logs.length) return Number(logs[logs.length - 1].weightKg) || Number(logs[logs.length - 1].avgWeight) || 0;
    return Number(lote.avgWeight) || 0;
  },
  getLoteExpectedBirds: function(lote) {
    if (!lote) return 0;
    var survival = Math.max(0, 1 - ((Number(this.settings.maxMortalityPercent) || 3) / 100));
    return Math.round((Number(lote.initialBirds) || 0) * survival);
  },
  getAverageSalePriceKg: function() {
    var weighted = 0, kg = 0;
    (this.sales || []).forEach(function(s) {
      var w = Number(s.weightKg) || 0;
      if (w > 0) { weighted += w * (Number(s.priceUnit) || 0); kg += w; }
    });
    if (kg > 0) return weighted / kg;
    var unitSales = (this.sales || []).filter(function(s){ return s.type === 'unit' && Number(s.qty) > 0; });
    if (unitSales.length) {
      var sum = unitSales.reduce(function(a,s){ return a + (Number(s.priceUnit)||0); },0);
      return sum / unitSales.length / (Number(this.settings.standardWeightTarget)||2.1);
    }
    return 220;
  },
  getFeedAverageCostKg: function() {
    var bagWeight = Number(this.settings.feedBagsWeightKg) || 50;
    var boughtKg = 0, boughtCost = 0;
    (this.feedLogs || []).filter(function(f){ return f.movement === 'COMPRA'; }).forEach(function(f){
      var kg = Number(f.qtyKg) || 0;
      var cost = Number(f.totalCost) || ((kg / bagWeight) * (Number(f.priceBag) || 0));
      boughtKg += kg; boughtCost += cost;
    });
    if (boughtKg > 0) return boughtCost / boughtKg;
    var stock = (this.stockItems || []).filter(function(s){ return String(s.category||'').toLowerCase().indexOf('ração') !== -1; });
    var totalKg = stock.reduce(function(a,s){ return a + (Number(s.qty)||0) * bagWeight; },0);
    var totalValue = stock.reduce(function(a,s){ return a + (Number(s.qty)||0) * (Number(s.price)||0); },0);
    return totalKg > 0 ? totalValue / totalKg : 0;
  },
  getLoteFeedCost: function(loteId) {
    var avgCostKg = this.getFeedAverageCostKg();
    return (this.feedLogs || []).filter(function(f){ return f.loteId === loteId && f.movement === 'CONSUMO'; })
      .reduce(function(sum,f){
        var explicit = Number(f.totalCost) || 0;
        var derived = (Number(f.qtyKg)||0) * (Number(f.priceBag) ? Number(f.priceBag) / (Number(this.settings.feedBagsWeightKg)||50) : avgCostKg);
        return sum + (explicit || derived);
      }.bind(this), 0);
  },
  getLoteExpenses: function(loteId) {
    return (this.expenses || []).filter(function(e){ return e.loteId === loteId; })
      .reduce(function(sum,e){ return sum + (Number(e.amount)||0); },0);
  },
  getLoteProjection: function(lote) {
    if (!lote) return {age:0, daysLeft:0, targetDate:'', birds:0, expectedBirds:0, weight:0, targetWeight:0, weightGap:0, productionKg:0, revenue:0, costs:0, profit:0, margin:0};
    var age = this.getLoteAgeDays(lote);
    var targetAge = Number(lote.cycleDays) || Number(this.settings.cycleDays) || 38;
    var daysLeft = Math.max(0, targetAge - age);
    var currentBirds = this.getLoteRemainingBirds(lote);
    var expectedBirds = this.getLoteExpectedBirds(lote);
    var weight = this.getLoteCurrentWeight(lote);
    var targetWeight = Number(lote.targetWeight) || Number(this.settings.standardWeightTarget) || 2.1;
    var forecastBirds = Math.max(currentBirds, Math.min(expectedBirds, Number(lote.initialBirds)||0));
    var productionKg = forecastBirds * targetWeight;
    var priceKg = this.getAverageSalePriceKg();
    var revenue = productionKg * priceKg;
    var costs = (Number(lote.costChicks)||0) + this.getLoteFeedCost(lote.id) + this.getLoteExpenses(lote.id);
    var profit = revenue - costs;
    return {
      age: age, daysLeft: daysLeft, targetDate: this.getLoteTargetDate(lote), birds: currentBirds,
      expectedBirds: expectedBirds, weight: weight, targetWeight: targetWeight,
      weightGap: targetWeight - weight, productionKg: productionKg, priceKg: priceKg,
      revenue: revenue, costs: costs, profit: profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0
    };
  },
  getFeedDailyAverage: function(loteId) {
    var logs = (this.feedLogs || []).filter(function(f){ return f.movement === 'CONSUMO' && (!loteId || f.loteId === loteId); });
    if (!logs.length) return 0;
    var days = new Set(logs.map(function(f){ return f.date; })).size || 1;
    return logs.reduce(function(sum,f){ return sum + (Number(f.qtyKg)||0); },0) / days;
  },
  getFeedStockKg: function() {
    var bagWeight = Number(this.settings.feedBagsWeightKg) || 50;
    return (this.stockItems || []).filter(function(s){ return String(s.category||'').toLowerCase().indexOf('ração') !== -1 || String(s.category||'').toLowerCase().indexOf('feed') !== -1; })
      .reduce(function(sum,s){ return sum + (Number(s.qty)||0) * bagWeight; },0);
  },
  getFeedStockDays: function(loteId) {
    var daily = this.getFeedDailyAverage(loteId);
    return daily > 0 ? this.getFeedStockKg() / daily : 0;
  },
  getSmartKPIs: function() {
    var base = this.getSummaryKPIs();
    var lote = this.getActiveLote();
    var projection = this.getLoteProjection(lote);
    var profitMargin = base.totalRevenue > 0 ? (base.netProfit / base.totalRevenue) * 100 : 0;
    var stockKg = this.getFeedStockKg();
    var stockDays = this.getFeedStockDays(lote ? lote.id : '');
    var feedTargetKg = lote ? projection.birds * projection.targetWeight * (Number(this.settings.targetFCR)||1.6) : 0;
    return Object.assign({}, base, {
      profitMargin: profitMargin,
      projection: projection,
      feedStockKg: stockKg,
      feedStockDays: stockDays,
      feedTargetKg: feedTargetKg,
      birdsExpectedAtTarget: projection.expectedBirds
    });
  },
  getSmartStatus: function() {
    var k = this.getSmartKPIs();
    var p = k.projection;
    if (!this.getActiveLote()) return {type:'info', label:'Sem lote ativo', message:'Crie ou selecione um lote para ativar as previsões.'};
    if (Number(k.mortalityRate) > (Number(this.settings.maxMortalityPercent)||3)) return {type:'critical', label:'Mortalidade acima do limite', message:'A mortalidade atingiu ' + k.mortalityRate + '%. Verifique o lote ' + this.getActiveLote().code + '.'};
    if (k.feedStockDays > 0 && k.feedStockDays < 3) return {type:'warning', label:'Ração para menos de 3 dias', message:'O stock estimado cobre apenas ' + k.feedStockDays.toFixed(1) + ' dias de consumo.'};
    if (p.weight > 0 && p.weightGap > 0.25) return {type:'warning', label:'Peso abaixo da meta', message:'O peso médio está ' + p.weightGap.toFixed(2) + ' kg abaixo da meta de ' + p.targetWeight.toFixed(2) + ' kg.'};
    return {type:'success', label:'Operação sob controlo', message:'Os principais indicadores do lote estão dentro dos parâmetros definidos.'};
  },
  getSmartActions: function() {
    var lote = this.getActiveLote();
    if (!lote) return [];
    var k = this.getSmartKPIs(), actions = [];
    if (Number(k.mortalityRate) > (Number(this.settings.maxMortalityPercent)||3)) actions.push({label:'Registar mortalidade', view:'lotes'});
    if (k.feedStockDays > 0 && k.feedStockDays < 7) actions.push({label:'Repor ração', view:'racao'});
    if (!k.totalFeedKg || !this.getLoteGrowthLogs(lote.id).length) actions.push({label:'Registar peso', view:'lotes'});
    if (!actions.length) actions.push({label:'Registar ração', view:'racao'});
    return actions.slice(0,3);
  }
};
