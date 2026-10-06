import "../services/firebase.js";

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
      exportFinancasExcel: async function() {
        var sum = this.getEliteFinSummary(this.finPeriod);
        var trans = this.getFilteredTransactions();
        var smart = this.getSmartKPIs();
        var result = await window.exportFinanceExcel({
          settings: this.settings || {},
          period: this.finPeriod,
          today: this.todayStr(),
          sum: sum,
          trans: trans,
          smart: smart,
          alerts: this.getProfessionalAlerts ? this.getProfessionalAlerts() : [],
          agenda: this.getDailyAgenda ? this.getDailyAgenda() : [],
          healthLogs: this.healthLogs || []
        });
        this.toast('Excel completo exportado com Livro de Caixa, gestão, alertas, agenda e saúde.');
        return result;
      },
      exportFinancasPDF: function() {
        var self=this;
        var trans=this.getFilteredTransactions();
        var sum=this.getEliteFinSummary(this.finPeriod);
        return window.generateFinanceReportPDF({
          settings:this.settings||{},
          period:this.finPeriod,
          financeSummary:Object.assign({periodo:self.finPeriod},sum||{}),
          cashTransactions:trans||[]
        }).then(function(){
          self.toast('PDF financeiro descarregado com os dados do Livro de Caixa e todos os métodos de pagamento.');
        }).catch(function(err){
          self.toast('Não foi possível gerar o PDF financeiro: '+(err&&err.message?err.message:'erro desconhecido'),'error');
        });
      },
  deleteTransactionWithAudit: function(t) {
        if (!t) return;
        var self = this;
        this.confirm('Tem a certeza que deseja anular/eliminar o movimento \"' + t.desc + '\" de ' + this.fmtMT(t.amount) + '?', function() {
          var ref = t.referenceId || (t.raw && t.raw.referenceId) || t.id;
          var archived = false;
          var rawEntry = t.raw || t;
          if (rawEntry && rawEntry.id && !rawEntry.derived && self._queueCloudDelete) {
            self._queueCloudDelete(self.currentFarmId, 'cashEntries', rawEntry.id);
          }
          self.cashLogs = (self.cashLogs || []).filter(function(c) { return c.id !== t.id && c.referenceId !== ref; });
          if (ref) {
            var sale = (self.sales || []).find(function(s) { return s.id === ref; });
            if (sale) {
              self.archiveDeletedRecord('Venda', sale, 'Venda eliminada a partir do Livro de Caixa');
              if (self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'sales', sale.id);
              var client = (self.clients || []).find(function(c) { return c.id === sale.clientId; });
              if (client) {
                client.totalBought = Math.max(0, Number(client.totalBought || 0) - Number(sale.totalAmount || 0));
                client.totalPaid = Math.max(0, Number(client.totalPaid || 0) - Number(sale.paidAmount || 0));
                client.debt = Math.max(0, Number(client.debt || 0) - Number(sale.debtAmount || 0));
              }
              self.sales = self.sales.filter(function(s) { return s.id !== ref; });
              archived = true;
            }
            var receipt = (self.receipts || []).find(function(item) { return item.id === ref; });
            if (receipt) {
              self.archiveDeletedRecord('Recebimento', receipt, 'Recebimento eliminado a partir do Livro de Caixa');
              var receiptClient = (self.clients || []).find(function(c) { return c.id === receipt.clientId; });
              if (receiptClient) {
                var restoredDebt = Array.isArray(receipt.allocations)
                  ? receipt.allocations.reduce(function(sum, allocation) {
                    return sum + ((self.sales || []).some(function(item) { return String(item.id) === String(allocation.saleId); }) ? Number(allocation.amount) || 0 : 0);
                  }, 0)
                  : Number(receipt.amount) || 0;
                receiptClient.totalPaid = Math.max(0, Number(receiptClient.totalPaid || 0) - (Number(receipt.amount) || 0));
                receiptClient.debt = Math.max(0, Number(receiptClient.debt || 0) + restoredDebt);
              }
              self.receipts = (self.receipts || []).filter(function(item) { return item.id !== receipt.id; });
              if (self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'receipts', receipt.id);
              archived = true;
            }
            var expense = (self.expenses || []).find(function(e) { return e.id === ref; });
            if (expense) {
              self.archiveDeletedRecord('Despesa', expense, 'Despesa eliminada a partir do Livro de Caixa');
              if (self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'expenses', expense.id);
              archived = true;
            }
            self.expenses = (self.expenses || []).filter(function(e) { return e.id !== ref; });
          }
          if (!archived) self.archiveDeletedRecord('Caixa', t.raw || t, 'Movimento de caixa eliminado');
          self.logAudit('ANULAÇÃO DE MOVIMENTO', 'Anulou o movimento: ' + t.desc, t.amount);
          self.persistFarm();
          self.toast('Movimento anulado e registado na auditoria!');
        });
      },
};
