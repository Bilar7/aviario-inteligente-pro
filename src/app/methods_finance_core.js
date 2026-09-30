import "../services/firebase.js";
// Métodos: finance_core
export const methods = {
  // Inicialização do array de auditoria se não existir
      getAudits: function() {
        if (!this.financialAudits) this.financialAudits = [];
        return this.financialAudits;
      },
  logAudit: function(action, details, amount) {
        if (!this.financialAudits) this.financialAudits = [];
        var now = new Date();
        var auditEntry = {
          id: 'aud_' + Date.now().toString(36),
          userName: this.currentUser ? this.currentUser.nome : 'Sistema',
          userRole: this.currentUser ? this.currentUser.role : 'system',
          action: action,
          details: details,
          amount: Number(amount) || 0,
          date: now.toISOString().slice(0, 10),
          time: now.toTimeString().slice(0, 8),
          timestamp: Date.now()
        };
        this.financialAudits.unshift(auditEntry);
        if (this.financialAudits.length > 300) this.financialAudits.pop();
        if (typeof this._queueCloudMutation === 'function' && this.currentFarmId && this.currentUser) {
          var activity = Object.assign({}, auditEntry, {
            farmId: this.currentFarmId,
            createdByUid: this.currentUser._authUid || this.currentUser.uid || ''
          });
          this._queueCloudMutation(this.currentFarmId, 'activityLogs', activity);
        }
      },
  // Livro de caixa unificado: usa movimentos reais e cria apenas faltantes derivados.
      reconcileCashLedger: function() {
        return Array.isArray(this.cashLogs) ? this.cashLogs.slice() : [];
      },
  // Extrato unificado sem duplicar vendas/despesas que já possuem movimento de caixa.
      getAllTransactions: function() {
        var self = this;
        var source = this.reconcileCashLedger();
        var seenRefs = new Set();
        source.forEach(function(c) { if (c && c.referenceId) seenRefs.add(String(c.referenceId)); });
        var isLegacyExpensePosted = function(exp) {
          var id = String(exp && exp.id || '');
          if (id && seenRefs.has(id)) return true;
          var amount = Number(exp && exp.amount) || 0;
          var date = exp && exp.date || '';
          var category = String(exp && exp.category || '').toLowerCase();
          var desc = String(exp && (exp.description || exp.desc) || '').toLowerCase();
          return source.some(function(c) {
            if (!c || c.type !== 'OUT' || Number(c.amount) !== amount || (c.date || '') !== date) return false;
            var cc = String(c.category || '').toLowerCase();
            var cd = String(c.description || '').toLowerCase();
            return (category && (cc.indexOf(category) !== -1 || category.indexOf(cc) !== -1)) ||
                   (desc && (cd.indexOf(desc) !== -1 || desc.indexOf(category) !== -1));
          });
        };
        (this.sales || []).forEach(function(s) {
          var paid = Number(s.paidAmount) || 0, ref = String(s.id || '');
          if (paid > 0 && ref && !seenRefs.has(ref)) {
            source.push({id:'derived_sale_'+ref,date:s.date||self.todayStr(),time:s.time||'',type:'IN',category:'Vendas de Frangos',description:'Recebimento de venda — '+(s.clientName||'Cliente'),amount:paid,paymentMethod:s.paymentMethod||'Dinheiro',responsible:s.responsible||(self.currentUser?self.currentUser.nome:'Sistema'),referenceId:ref,derived:true});
            seenRefs.add(ref);
          }
        });
        (this.receipts || []).forEach(function(r) {
          var amount = Number(r.amount) || 0, ref = String(r.id || '');
          if (amount > 0 && ref && !seenRefs.has(ref)) {
            source.push({id:'derived_receipt_'+ref,date:r.date||self.todayStr(),time:r.time||'',type:'IN',category:'Recebimento de Dívida',description:'Pagamento de dívida — '+(r.clientName||'Cliente'),amount:amount,paymentMethod:r.paymentMethod||'Dinheiro',responsible:r.responsible||(self.currentUser?self.currentUser.nome:'Sistema'),referenceId:ref,derived:true});
            seenRefs.add(ref);
          }
        });
        (this.expenses || []).forEach(function(e) {
          var ref = String(e.id || '');
          if (!ref || isLegacyExpensePosted(e)) return;
          source.push({id:'derived_exp_'+ref,date:e.date||self.todayStr(),time:e.time||'',type:'OUT',category:e.category||'Despesa',description:e.description||e.desc||'Despesa operacional',amount:Number(e.amount)||0,paymentMethod:e.paymentMethod||'Dinheiro',responsible:e.responsible||(self.currentUser?self.currentUser.nome:'Sistema'),referenceId:ref,derived:true});
          seenRefs.add(ref);
        });
        var list = source.map(function(c,index) { return {
          id:c.id||('cash_'+index), sourceType:c.referenceId?'cash':'cash_manual', date:c.date||self.todayStr(), time:c.time||'',
          type:c.type==='IN'?'ENTRADA':'SAÍDA', category:c.category||(c.type==='IN'?'Entrada':'Saída'), desc:c.description||'Movimento de caixa', amount:Number(c.amount)||0,
          paymentMethod:c.paymentMethod||'—', status:'Pago', responsible:c.responsible||(self.currentUser?self.currentUser.nome:'Sistema'), referenceId:c.referenceId||'', raw:c, derived:Boolean(c.derived)
        }; });
        list.sort(function(a,b){ if(a.date!==b.date) return a.date<b.date?-1:1; return (a.time||'').localeCompare(b.time||''); });
        var running=0;
        list.forEach(function(item){ running += item.type==='ENTRADA'?item.amount:-item.amount; item.runningBalance=running; });
        return list.reverse();
      },
  // Filtros de Data e Período
      isDateInPeriod: function(dateStr, period) {
        if (!dateStr) return true;
        var today = new Date();
        var todayStr = today.toISOString().slice(0, 10);
        
        if (period === 'todos') return true;
        if (period === 'hoje') return dateStr === todayStr;
        
        if (period === 'ontem') {
          var yest = new Date(today);
          yest.setDate(today.getDate() - 1);
          return dateStr === yest.toISOString().slice(0, 10);
        }
        
        if (period === '7d') {
          var d7 = new Date(today);
          d7.setDate(today.getDate() - 7);
          return dateStr >= d7.toISOString().slice(0, 10) && dateStr <= todayStr;
        }
        
        if (period === 'este_mes') {
          return dateStr.slice(0, 7) === todayStr.slice(0, 7);
        }
        
        if (period === 'mes_anterior') {
          var prevM = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          var prevMStr = prevM.toISOString().slice(0, 7);
          return dateStr.slice(0, 7) === prevMStr;
        }
        
        if (period === 'ano') {
          return dateStr.slice(0, 4) === todayStr.slice(0, 4);
        }
        
        if (period === 'custom') {
          if (this.finCustomStart && dateStr < this.finCustomStart) return false;
          if (this.finCustomEnd && dateStr > this.finCustomEnd) return false;
          return true;
        }
        
        return true;
      },
  // Lista Filtrada para o Livro de Caixa
      getFilteredTransactions: function() {
        var self = this;
        var all = this.getAllTransactions();
        var query = (this.finSearch || '').toLowerCase().trim();
  
        return all.filter(function(t) {
          // Filtro por Período
          if (!self.isDateInPeriod(t.date, self.finPeriod)) return false;
          
          // Filtro por Tipo (Entrada / Saída)
          if (self.finTypeFilter !== 'all' && t.type.toLowerCase() !== self.finTypeFilter.toLowerCase()) return false;
          
          // Filtro por Categoria
          if (self.finCategoryFilter !== 'all' && t.category !== self.finCategoryFilter) return false;
  
          // Filtro por Método
          if (self.finMethodFilter !== 'all' && t.paymentMethod !== self.finMethodFilter) return false;
  
          // Filtro de Texto
          if (query) {
            var matchDesc = (t.desc || '').toLowerCase().indexOf(query) !== -1;
            var matchCat = (t.category || '').toLowerCase().indexOf(query) !== -1;
            var matchMethod = (t.paymentMethod || '').toLowerCase().indexOf(query) !== -1;
            var matchResp = (t.responsible || '').toLowerCase().indexOf(query) !== -1;
            if (!matchDesc && !matchCat && !matchMethod && !matchResp) return false;
          }
  
          return true;
        });
      },
  // Resumo Financeiro Completo para os KPIs
      getEliteFinSummary: function(period) {
        var p = period || this.finPeriod;
        var all = this.getAllTransactions();
        var self = this;
  
        var totalReceitasGlobal = 0;
        var totalDespesasGlobal = 0;
  
        var periodReceitas = 0;
        var periodDespesas = 0;
  
        var methodBalances = {
          'Dinheiro': 0,
          'M-Pesa': 0,
          'e-Mola': 0,
          'Transferência': 0,
          'Cartão': 0,
          'Crédito': 0,
          'Outros': 0
        };
  
        all.forEach(function(t) {
          var isPaid = t.status === 'Pago';
          var inPeriod = self.isDateInPeriod(t.date, p);
  
          if (isPaid) {
            if (t.type === 'ENTRADA') {
              totalReceitasGlobal += t.amount;
              if (inPeriod) periodReceitas += t.amount;
              
              var m = t.paymentMethod || 'Dinheiro';
              if (methodBalances[m] !== undefined) methodBalances[m] += t.amount;
              else if (m.toLowerCase().indexOf('mpesa') !== -1 || m.toLowerCase().indexOf('m-pesa') !== -1) methodBalances['M-Pesa'] += t.amount;
              else if (m.toLowerCase().indexOf('emola') !== -1 || m.toLowerCase().indexOf('e-mola') !== -1) methodBalances['e-Mola'] += t.amount;
              else if (m.toLowerCase().indexOf('transf') !== -1 || m.toLowerCase().indexOf('bim') !== -1 || m.toLowerCase().indexOf('bci') !== -1) methodBalances['Transferência'] += t.amount;
              else if (m.toLowerCase().indexOf('cart') !== -1) methodBalances['Cartão'] += t.amount;
              else if (m.toLowerCase().indexOf('crédito') !== -1 || m.toLowerCase().indexOf('credito') !== -1 || m.toLowerCase().indexOf('fiado') !== -1) methodBalances['Crédito'] += t.amount;
              else methodBalances['Outros'] += t.amount;
            } else if (t.type === 'SAÍDA') {
              totalDespesasGlobal += t.amount;
              if (inPeriod) periodDespesas += t.amount;
  
              var m = t.paymentMethod || 'Dinheiro';
              if (methodBalances[m] !== undefined) methodBalances[m] -= t.amount;
              else if (m.toLowerCase().indexOf('mpesa') !== -1 || m.toLowerCase().indexOf('m-pesa') !== -1) methodBalances['M-Pesa'] -= t.amount;
              else if (m.toLowerCase().indexOf('emola') !== -1 || m.toLowerCase().indexOf('e-mola') !== -1) methodBalances['e-Mola'] -= t.amount;
              else if (m.toLowerCase().indexOf('transf') !== -1 || m.toLowerCase().indexOf('bim') !== -1 || m.toLowerCase().indexOf('bci') !== -1) methodBalances['Transferência'] -= t.amount;
              else if (m.toLowerCase().indexOf('cart') !== -1) methodBalances['Cartão'] -= t.amount;
              else if (m.toLowerCase().indexOf('crédito') !== -1 || m.toLowerCase().indexOf('credito') !== -1 || m.toLowerCase().indexOf('fiado') !== -1) methodBalances['Crédito'] -= t.amount;
              else methodBalances['Outros'] -= t.amount;
            }
          }
        });
  
        var saldoCaixaReal = totalReceitasGlobal - totalDespesasGlobal;
        var lucroPeriodo = periodReceitas - periodDespesas;
        var margemLucro = periodReceitas > 0 ? ((lucroPeriodo / periodReceitas) * 100).toFixed(1) : '0.0';
  
        // Contas a Receber (Dívidas de Clientes)
        var totalAReceber = 0;
        var devedoresCount = 0;
        var vencidasAReceber = 0;
        (this.clients || []).forEach(function(c) {
          var d = Number(c.debt) || 0;
          if (d > 0) {
            totalAReceber += d;
            devedoresCount++;
            // Se tiver mais de 15 dias ou marcado como vencido
            if (c.status === 'vencido' || (c.lastSaleDate && (Date.now() - new Date(c.lastSaleDate).getTime()) > 30*24*3600*1000)) {
              vencidasAReceber += d;
            }
          }
        });
  
        // Contas a Pagar (Despesas Pendentes)
        var totalAPagar = 0;
        var contasPendentesCount = 0;
        var vencidasAPagar = 0;
        (this.expenses || []).forEach(function(exp) {
          if (exp.status === 'Pendente' || exp.status === 'pendente') {
            var val = Number(exp.amount) || 0;
            totalAPagar += val;
            contasPendentesCount++;
            if (exp.date && (new Date().toISOString().slice(0,10) > exp.date)) {
              vencidasAPagar += val;
            }
          }
        });
  
        return {
          saldoCaixa: saldoCaixaReal,
          periodReceitas: periodReceitas,
          periodDespesas: periodDespesas,
          lucro: lucroPeriodo,
          margemLucro: margemLucro,
          totalAReceber: totalAReceber,
          devedoresCount: devedoresCount,
          vencidasAReceber: vencidasAReceber,
          totalAPagar: totalAPagar,
          contasPendentesCount: contasPendentesCount,
          vencidasAPagar: vencidasAPagar,
          methods: methodBalances
        };
      },
  // Dados Reais para o Gráfico de Fluxo Financeiro
      getFinancialChartData: function(range) {
        var r = range || this.finChartRange || '7d';
        var all = this.getAllTransactions().filter(function(t) { return t.status === 'Pago'; });
        var points = [];
        var today = new Date();
  
        if (r === '7d') {
          for (var i = 6; i >= 0; i--) {
            var d = new Date(today);
            d.setDate(today.getDate() - i);
            var dStr = d.toISOString().slice(0, 10);
            var dayLabel = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit' });
            
            var recs = all.filter(function(t) { return t.date === dStr && t.type === 'ENTRADA'; }).reduce(function(a, b) { return a + b.amount; }, 0);
            var desps = all.filter(function(t) { return t.date === dStr && t.type === 'SAÍDA'; }).reduce(function(a, b) { return a + b.amount; }, 0);
            points.push({ label: dayLabel, date: dStr, receitas: recs, despesas: desps, lucro: recs - desps });
          }
        } else if (r === '30d') {
          // Agrupar a cada 5 dias dos últimos 30 dias
          for (var i = 5; i >= 0; i--) {
            var dStart = new Date(today);
            dStart.setDate(today.getDate() - (i * 5 + 4));
            var dEnd = new Date(today);
            dEnd.setDate(today.getDate() - (i * 5));
            
            var sStr = dStart.toISOString().slice(0, 10);
            var eStr = dEnd.toISOString().slice(0, 10);
            var label = dEnd.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  
            var recs = all.filter(function(t) { return t.date >= sStr && t.date <= eStr && t.type === 'ENTRADA'; }).reduce(function(a, b) { return a + b.amount; }, 0);
            var desps = all.filter(function(t) { return t.date >= sStr && t.date <= eStr && t.type === 'SAÍDA'; }).reduce(function(a, b) { return a + b.amount; }, 0);
            points.push({ label: label, date: eStr, receitas: recs, despesas: desps, lucro: recs - desps });
          }
        } else if (r === '3m' || r === '6m' || r === '1y') {
          var numMonths = r === '3m' ? 3 : (r === '6m' ? 6 : 12);
          for (var i = numMonths - 1; i >= 0; i--) {
            var mDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            var mStr = mDate.toISOString().slice(0, 7);
            var mLabel = mDate.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });
  
            var recs = all.filter(function(t) { return (t.date || '').slice(0, 7) === mStr && t.type === 'ENTRADA'; }).reduce(function(a, b) { return a + b.amount; }, 0);
            var desps = all.filter(function(t) { return (t.date || '').slice(0, 7) === mStr && t.type === 'SAÍDA'; }).reduce(function(a, b) { return a + b.amount; }, 0);
            points.push({ label: mLabel, date: mStr, receitas: recs, despesas: desps, lucro: recs - desps });
          }
        }
  
        var maxVal = Math.max.apply(Math, points.map(function(p) { return Math.max(p.receitas, p.despesas); }).concat([1000]));
        points.forEach(function(p) {
          p.receitaPct = Math.min(100, Math.round((p.receitas / maxVal) * 100));
          p.despesaPct = Math.min(100, Math.round((p.despesas / maxVal) * 100));
        });
  
        return { points: points, maxVal: maxVal, hasData: points.some(function(p) { return p.receitas > 0 || p.despesas > 0; }) };
      },
  // Distribuição de Despesas por Categoria (para Análises)
      getExpenseCategoriesBreakdown: function() {
        var exps = this.expenses || [];
        var totals = {};
        var sum = 0;
  
        exps.forEach(function(e) {
          var cat = e.category || 'Outros';
          var val = Number(e.amount) || 0;
          totals[cat] = (totals[cat] || 0) + val;
          sum += val;
        });
  
        var list = [];
        for (var cat in totals) {
          var val = totals[cat];
          var pct = sum > 0 ? ((val / sum) * 100).toFixed(1) : 0;
          list.push({ category: cat, amount: val, percentage: Number(pct) });
        }
        list.sort(function(a, b) { return b.amount - a.amount; });
        return { list: list, total: sum };
      },
  // Diagnósticos IA Reais Baseados em Dados
      getAiFinancialInsights: function() {
        var sum = this.getEliteFinSummary('este_mes');
        var expBreakdown = this.getExpenseCategoriesBreakdown();
        var feedItem = expBreakdown.list.find(function(item) { return item.category.toLowerCase().indexOf('ração') !== -1 || item.category.toLowerCase().indexOf('racao') !== -1; });
        var feedPct = feedItem ? feedItem.percentage : 0;
  
        var insights = [];
  
        // 1. Situação do Caixa e Margem
        if (sum.lucro >= 0 && sum.saldoCaixa > 10000) {
          insights.push({
            type: 'success',
            icon: '',
            title: 'Situação Financeira Saudável & Sustentável',
            desc: 'O aviário apresenta saldo positivo de ' + this.fmtMT(sum.saldoCaixa) + ' com margem de lucro de ' + sum.margemLucro + '% neste período. A liquidez atual é suficiente para cobrir os ciclos operacionais.'
          });
        } else if (sum.lucro >= 0) {
          insights.push({
            type: 'warning',
            icon: '',
            title: 'Saldo Operacional em Nível de Alerta',
            desc: 'Embora o resultado mensal seja positivo (' + this.fmtMT(sum.lucro) + '), o saldo total em caixa é de ' + this.fmtMT(sum.saldoCaixa) + '. Recomenda-se cautela em novos investimentos até o escoamento dos lotes ativos.'
          });
        } else {
          insights.push({
            type: 'critical',
            icon: '',
            title: 'Atenção: Margem Mensal Negativa',
            desc: 'As despesas deste mês superaram as receitas em ' + this.fmtMT(Math.abs(sum.lucro)) + '. Verifique o cronograma de abate e vendas dos frangos para reequilibrar o fluxo de caixa.'
          });
        }
  
        // 2. Análise do Custo da Ração
        if (feedPct >= 65) {
          insights.push({
            type: 'critical',
            icon: '',
            title: 'Impacto Crítico do Custo de Ração (' + feedPct + '%)',
            desc: 'A ração representa ' + feedPct + '% de todos os gastos da exploração (limite ideal: 60-65%). Considere otimizar as fases de transição alimentar (A1/A2/A3) e evitar desperdícios nos comedouros.'
          });
        } else if (feedPct > 50) {
          insights.push({
            type: 'warning',
            icon: '',
            title: 'Ração dentro da Média do Sector (' + feedPct + '%)',
            desc: 'O consumo de ração corresponde a ' + feedPct + '% dos custos operacionais, em conformidade com o padrão avícola moçambicano.'
          });
        }
  
        // 3. Contas a Receber e Dívidas de Clientes
        if (sum.totalAReceber > 15000) {
          insights.push({
            type: 'critical',
            icon: '',
            title: 'Volume Elevado de Créditos Pendentes (' + this.fmtMT(sum.totalAReceber) + ')',
            desc: 'Existem ' + sum.devedoresCount + ' clientes com dívidas acumuladas. ' + (sum.vencidasAReceber > 0 ? this.fmtMT(sum.vencidasAReceber) + ' já estão vencidas. ' : '') + 'Recomenda-se acionar cobrança direta via WhatsApp para acelerar a entrada de capital.'
          });
        } else if (sum.totalAReceber > 0) {
          insights.push({
            type: 'info',
            icon: '',
            title: 'Contas a Receber Controladas (' + this.fmtMT(sum.totalAReceber) + ')',
            desc: 'O montante pendente com ' + sum.devedoresCount + ' clientes devedores está dentro do limite prudencial aceitável.'
          });
        }
  
        // 4. Previsão Operacional & Abate
        var lote = this.getActiveLote();
        if (lote) {
          var aves = this.getLoteRemainingBirds(lote);
          var receitaEstimada = aves * 220;
          insights.push({
            type: 'info',
            icon: '',
            title: 'Projeção de Entrada com Lote #' + lote.code,
            desc: 'Com ' + this.fmtNum(aves) + ' aves vivas prontas para escoamento, a receita bruta projetada de venda é de aproximadamente ' + this.fmtMT(receitaEstimada) + ' a 220 MT/frango.'
          });
        }
  
        return insights;
      },
};
