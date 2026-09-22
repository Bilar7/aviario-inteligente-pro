import "../services/firebase.js";
import * as XLSX from "xlsx";

// Métodos: finance_actions
export const methods = {
  // Ações Rápidas de Cobrança e Pagamento
      openCobrarClienteWhatsApp: function(client) {
        if (!client || !client.phone) {
          this.toast('Cliente sem número de telefone registado.', 'error');
          return;
        }
        var cleanPhone = client.phone.replace(/\D/g, '');
        if (cleanPhone.length <= 9 && !cleanPhone.startsWith('258')) cleanPhone = '258' + cleanPhone;
        var msg = 'Olá ' + client.name + ', saudações do ' + this.settings.farmName + '. Lembramos com estima que possui um saldo pendente de ' + this.fmtMT(client.debt) + '. Agradecemos a confirmação do pagamento via M-Pesa/E-Mola. Muito obrigado!';
        var url = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg);
        window.open(url, '_blank');
        this.toast('WhatsApp de cobrança aberto com sucesso!');
      },
  openPaymentModalForClient: function(client) {
        if (!client) return;
        this.newPayClientId = client.id;
        this.newPayAmount = client.debt || '';
        this.newPayDate = new Date().toISOString().slice(0, 10);
        this.newPayMethod = 'M-Pesa';
        this.showModalPagamento = true;
      },
  liquidateExpenseDirectly: function(exp) {
        if (!this._isAdminRole || !this._isAdminRole()) { this.toast('Esta operação é reservada ao administrador.', 'error'); return; }
        if (!exp) return;
        var self = this;
        this.confirm('Confirmar a liquidação e pagamento de ' + this.fmtMT(exp.amount) + ' referente a \"' + exp.desc + '\"?', function() {
          exp.status = 'Pago';
          var existing = (self.cashLogs || []).some(function(c) { return c.referenceId === exp.id; });
          if (!existing) {
            self.cashLogs.unshift({
              id: 'csh_liq_' + exp.id,
              date: self.todayStr(),
              time: new Date().toTimeString().slice(0, 5),
              type: 'OUT',
              category: exp.category || 'Despesa',
              description: exp.desc || exp.description || 'Despesa liquidada',
              amount: Number(exp.amount) || 0,
              paymentMethod: exp.paymentMethod || 'Dinheiro',
              responsible: self.currentUser ? self.currentUser.nome : 'Sistema',
              referenceId: exp.id
            });
          }
          self.logAudit('LIQUIDAÇÃO DE CONTA', 'Pagamento efetuado para: ' + (exp.desc || exp.description || 'Despesa'), exp.amount);
          self.persistFarm();
          self.toast('Conta liquidada com sucesso!');
        });
      },
  // Ações de Auditoria e Fecho de Caixa
      fecharCaixaDoDia: function() {
        if (!this._isAdminRole || !this._isAdminRole()) { this.toast('Esta operação é reservada ao administrador.', 'error'); return; }
        var self = this;
        var sum = this.getEliteFinSummary('hoje');
        this.confirm('Deseja realizar o Fecho de Caixa de Hoje? Saldo apurado: ' + this.fmtMT(sum.saldoCaixa) + '.', function() {
          self.logAudit('FECHO DE CAIXA', 'Fecho diário realizado com saldo apurado de ' + self.fmtMT(sum.saldoCaixa), sum.saldoCaixa);
          self.persistFarm();
          self.toast('Caixa fechado e auditoria registada!');
        });
      },
  // Exportações Reais do Módulo Financeiro
      exportFinancasExcel: function() {
        if (typeof XLSX === 'undefined') { this.toast('Biblioteca Excel a carregar...', 'error'); return; }
        var sum = this.getEliteFinSummary(this.finPeriod);
        var trans = this.getFilteredTransactions();
        var smart = this.getSmartKPIs();
        var wb = XLSX.utils.book_new();
        var profileRows = [
          ['PERFIL DA EMPRESA'],
          ['Empresa / Aviário', this.settings.companyLegalName || this.settings.farmName || 'Aviário Inteligente Pro'],
          ['Subtítulo / Actividade', this.settings.companySubtitle || this.settings.tagline || 'Gestão Avícola'],
          ['Telefone', this.settings.phone || ''], ['E-mail', this.settings.companyEmail || ''],
          ['Morada / Localização', this.settings.companyAddress || this.settings.location || ''],
          ['Responsável', this.settings.signatureName || this.settings.ownerName || (this.currentUser ? this.currentUser.nome : '')],
          ['Cargo', this.settings.signatureTitle || 'Responsável'],
          ['Logotipo', this.settings.companyLogo ? 'Configurado no perfil' : 'Não configurado'],
        ];
        var profileWs=XLSX.utils.aoa_to_sheet(profileRows); profileWs['!cols']=[{wch:28},{wch:62}]; XLSX.utils.book_append_sheet(wb, profileWs, '00_Perfil_Empresa');
        var rows = [
          ['AVIÁRIO INTELIGENTE PRO — LIVRO DE CAIXA & EXTRATO'],
          ['Período', this.finPeriod, 'Gerado em', new Date().toLocaleString('pt-PT')],
          ['Saldo atual', sum.saldoCaixa, 'Receitas período', sum.periodReceitas, 'Despesas período', sum.periodDespesas, 'Resultado', sum.lucro],
          [], ['Data','Hora','Tipo','Categoria','Descrição','Forma Pagamento','Entrada (MT)','Saída (MT)','Saldo Acumulado (MT)','Responsável','Origem']
        ];
        trans.forEach(function(t){ rows.push([t.date,t.time||'',t.type,t.category,t.desc,t.paymentMethod,t.type==='ENTRADA'?t.amount:0,t.type==='SAÍDA'?t.amount:0,t.runningBalance||0,t.responsible,t.derived?'Derivado':'Registo']); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Livro_Caixa');

        var resumo = [
          ['INDICADORES DE GESTÃO','VALOR'],
          ['Saldo atual (MT)', sum.saldoCaixa], ['Receitas do período (MT)', sum.periodReceitas], ['Despesas do período (MT)', sum.periodDespesas],
          ['Lucro do período (MT)', sum.lucro], ['Margem (%)', Number(sum.margemLucro)||0], ['A receber (MT)', sum.totalAReceber], ['A pagar (MT)', sum.totalAPagar],
          ['Aves atuais', smart.remainingBirds], ['Mortalidade (%)', smart.mortalityRate], ['Ração em stock (kg)', smart.feedStockKg], ['Cobertura de ração (dias)', Number(smart.feedStockDays.toFixed(1))],
          ['Receita projetada (MT)', smart.projection.revenue], ['Custo projetado (MT)', smart.projection.costs], ['Resultado projetado (MT)', smart.projection.profit], ['Margem projetada (%)', Number(smart.projection.margin.toFixed(1))]
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo_Gestao');

        var methodsRows=[['MÉTODO','SALDO (MT)']];
        Object.keys(sum.methods||{}).forEach(function(m){ methodsRows.push([m,sum.methods[m]]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(methodsRows), 'Metodos_Pagamento');

        var alertRows=[['NÍVEL','ALERTA','DETALHE']];
        (this.getProfessionalAlerts ? this.getProfessionalAlerts() : []).forEach(function(a){ alertRows.push([a.type,a.title,a.detail]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alertRows), 'Alertas');

        var agendaRows=[['DATA','ATIVIDADE','DETALHE']];
        (this.getDailyAgenda ? this.getDailyAgenda() : []).forEach(function(a){ agendaRows.push([a.date,a.title,a.detail]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agendaRows), 'Agenda');

        var healthRows=[['DATA','LOTE','TIPO','PRODUTO/TRATAMENTO','QTD','CUSTO (MT)','PRÓXIMA DATA','REGISTADO POR','OBSERVAÇÕES']];
        (this.healthLogs||[]).forEach(function(h){ healthRows.push([h.date,h.loteCode,h.type,h.product,h.quantity,h.cost,h.nextDate,h.recordedBy,h.notes]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(healthRows), 'Saude_Vacinacao');

        XLSX.writeFile(wb, 'Aviario_Inteligente_Pro_Gestao_Financeira_'+(this.settings.farmName||'Aviario').replace(/\s+/g,'_')+'_'+this.todayStr()+'.xlsx');
        this.toast('Excel completo exportado com Livro de Caixa, gestão, alertas, agenda e saúde.');
      },
      exportFinancasPDF: async function() {
        var self=this;
        if (this.currentUser && this.currentFarmId && navigator.onLine &&
            !(this.lotes || []).length && !(this.sales || []).length && !(this.clients || []).length &&
            typeof this.syncNow === 'function' && !this.syncBusy) {
          try { await this.syncNow({silent:true, automatic:true}); } catch (e) {}
        }
        var trans=this.getFilteredTransactions();
        var sum=this.getEliteFinSummary(this.finPeriod);
        var smart=this.getSmartKPIs();
        var farmPayload = typeof this._buildFarmPayload === 'function' ? this._buildFarmPayload() : {};
        return window.generateProfessionalAviarioPDF(Object.assign({}, farmPayload, {
          settings:this.settings||{},
          kpis:smart||this.getSummaryKPIs&&this.getSummaryKPIs()||{},
          lotes:this.lotes||[],
          sales:this.sales||[],
          feedLogs:this.feedLogs||[],
          mortalityLogs:this.mortalityLogs||[],
          clients:this.clients||[],
          expenses:this.expenses||[],
          receipts:this.receipts||[],
          stockItems:this.stockItems||[],
          healthLogs:this.healthLogs||[],
          attendance:this.attendance||[],
          energyLogs:this.energyLogs||[],
          suppliers:this.suppliers||[],
          notifications:this.notifications||[],
          cashTransactions:trans,
          priceTable:(this.priceTable&&this.priceTable.length?this.priceTable:(farmPayload.priceTable||[])),
          financeSummary:Object.assign({periodo:self.finPeriod},sum||{}),
          financeProjection:smart&&smart.projection?smart.projection:{},
          alerts:this.getProfessionalAlerts?this.getProfessionalAlerts():[],
          agenda:this.getDailyAgenda?this.getDailyAgenda():[]
        }), 'Relatorio_Financeiro_'+this.todayStr()).then(function(){
          self.toast('PDF financeiro completo descarregado com os dados reais do período.');
        }).catch(function(err){
          self.toast('Não foi possível gerar o PDF: '+(err&&err.message?err.message:'erro desconhecido'),'error');
        });
      },
  deleteTransactionWithAudit: function(t) {
        if (!t) return;
        var self = this;
        this.confirm('Tem a certeza que deseja anular/eliminar o movimento \"' + t.desc + '\" de ' + this.fmtMT(t.amount) + '?', function() {
          var ref = t.referenceId || (t.raw && t.raw.referenceId) || t.id;
          self.cashLogs = (self.cashLogs || []).filter(function(c) { return c.id !== t.id && c.referenceId !== ref; });
          if (ref) {
            var sale = (self.sales || []).find(function(s) { return s.id === ref; });
            if (sale) {
              var client = (self.clients || []).find(function(c) { return c.id === sale.clientId; });
              if (client) {
                client.totalBought = Math.max(0, Number(client.totalBought || 0) - Number(sale.totalAmount || 0));
                client.totalPaid = Math.max(0, Number(client.totalPaid || 0) - Number(sale.paidAmount || 0));
                client.debt = Math.max(0, Number(client.debt || 0) - Number(sale.debtAmount || 0));
              }
              self.sales = self.sales.filter(function(s) { return s.id !== ref; });
            }
            self.expenses = (self.expenses || []).filter(function(e) { return e.id !== ref; });
          }
          self.logAudit('ANULAÇÃO DE MOVIMENTO', 'Anulou o movimento: ' + t.desc, t.amount);
          self.persistFarm();
          self.toast('Movimento anulado e registado na auditoria!');
        });
      },
};
