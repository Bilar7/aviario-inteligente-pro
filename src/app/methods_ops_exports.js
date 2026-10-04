import "../services/firebase.js";
import * as XLSX from "xlsx";
// Métodos: ops_exports
export const methods = {
      // OPERAÇÕES: PLANILHA INTELIGENTE (MÓDULO 10)
      triggerExcelImport: function(event) {
        var file = event.target.files[0];
        if (!file) return;
        var self = this;
        var reader = new FileReader();
        reader.onload = function(e) {
          try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            var json = XLSX.utils.sheet_to_json(firstSheet);
            if (json && json.length > 0) {
              self.toast('Importadas ' + json.length + ' linhas do ficheiro Excel com sucesso!');
              self.persistFarm();
            }
          } catch(err) {
            self.toast('Erro ao importar Excel: ' + err.message, 'error');
          }
        };
        reader.readAsArrayBuffer(file);
      },
  exportExcel: function() {
        var farmData = {
          settings: this.settings || {},
          kpis: this.getSummaryKPIs ? this.getSummaryKPIs() : {},
          activeLote: this.getActiveLote ? this.getActiveLote() : null,
          lotes: this.lotes || [],
          mortalityLogs: this.mortalityLogs || [],
          feedLogs: this.feedLogs || [],
          sales: this.sales || [],
          clients: this.clients || [],
          expenses: this.expenses || [],
          staff: this.staff || [],
          attendance: this.attendance || [],
          stockItems: this.stockItems || [],
          cashLogs: this.cashLogs || [],
          receipts: this.receipts || [],
          healthLogs: this.healthLogs || [],
          notifications: this.notifications || [],
          priceTable: this.priceTable || [],
          suppliers: this.suppliers || [],
          energyLogs: this.energyLogs || [],
          cashTransactions: typeof this.getAllTransactions === 'function' ? this.getAllTransactions() : (this.cashLogs || [])
        };
        return window.exportSmartExcel(farmData);
      },
  openSaleInvoice: function(sale) {
    if (!sale) { this.toast('Venda não encontrada para emitir a factura.', 'error'); return false; }
    var settings = Object.assign({}, this.settings || {});
    if (!settings.companyLogo) settings.companyLogo = './assets/icon-192.png';
    var qty = Math.max(0, Number(sale.qty) || 0);
    var weightKg = Math.max(0, Number(sale.weightKg) || 0);
    var totalAmount = Math.max(0, Number(sale.totalAmount) || 0);
    var priceUnit = Number(sale.priceUnit) || 0;
    if (!priceUnit) {
      if (sale.type === 'weight' && weightKg > 0 && totalAmount > 0) priceUnit = totalAmount / weightKg;
      else if (qty > 0 && totalAmount > 0) priceUnit = totalAmount / qty;
    }
    var paymentSummary = this.getSalePaymentSummary(sale);
    var paidAmount = paymentSummary.paidAmount;
    var debtAmount = paymentSummary.debtAmount;
    var invoiceNumber = String(sale.invoiceNumber || ('FT-' + String(sale.id || Date.now()).replace(/[^A-Za-z0-9]+/g,'').slice(-12).toUpperCase()));
    this.invoicePreview = Object.assign({}, sale, {
      invoiceNumber: invoiceNumber,
      settings: settings,
      qty: qty,
      weightKg: weightKg,
      totalAmount: totalAmount,
      priceUnit: priceUnit,
      paidAmount: paidAmount,
      debtAmount: debtAmount,
      product: sale.product || 'Frango Vivo',
      paymentMethod: sale.paymentMethod || '—',
      paymentStatus: debtAmount > 0 ? (paidAmount > 0 ? 'Parcial' : 'Pendente') : 'Pago',
      responsible: sale.responsible || (this.currentUser && this.currentUser.nome) || 'Sistema'
    });
    this.invoicePreviewOpen = true;
    return true;
  },
  getSalePaymentSummary: function(sale) {
    var totalAmount = Math.max(0, Number(sale && sale.totalAmount) || 0);
    var originalPaid = Math.max(0, Number(sale && sale.paidAmount) || 0);
    var allocatedReceipts = (this.receipts || []).reduce(function(sum, receipt) {
      var allocation = (receipt.allocations || []).find(function(item) {
        return String(item.saleId) === String(sale && sale.id);
      });
      return sum + (Number(allocation && allocation.amount) || 0);
    }, 0);
    var paidAmount = Math.min(totalAmount, originalPaid + allocatedReceipts);
    return {
      paidAmount: paidAmount,
      debtAmount: Math.max(0, totalAmount - paidAmount)
    };
  },
  deleteSaleWithAudit: function(sale) {
    if (!sale) return;
    if (!this._isAdminRole || !this._isAdminRole()) {
      this.toast('Apenas o administrador pode apagar vendas.', 'error');
      return;
    }
    var self = this;
    var summary = this.getSalePaymentSummary(sale);
    this.confirm('Apagar a venda de ' + (sale.clientName || 'Cliente') + ' no valor de ' + this.fmtMT(sale.totalAmount) + '? Esta ação será registada na auditoria.', function() {
      self.archiveDeletedRecord('Venda', sale, 'Venda eliminada do histórico');
      var client = (self.clients || []).find(function(item) { return item.id === sale.clientId; });
      if (client) {
        client.totalBought = Math.max(0, Number(client.totalBought || 0) - Number(sale.totalAmount || 0));
        client.totalPaid = Math.max(0, Number(client.totalPaid || 0) - Number(sale.paidAmount || 0));
        client.debt = Math.max(0, Number(client.debt || 0) - summary.debtAmount);
      }
      self.sales = (self.sales || []).filter(function(item) { return item.id !== sale.id; });
      self.cashLogs = (self.cashLogs || []).filter(function(entry) { return entry.referenceId !== sale.id; });
      if (self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'sales', sale.id);
      self.logAudit('ANULAÇÃO DE VENDA', 'Venda de ' + (sale.clientName || 'Cliente') + ' anulada; lote ' + (sale.loteCode || '—'), sale.totalAmount);
      self.persistFarm();
      self.toast('Venda apagada e registada na auditoria.');
    });
  },
  printSaleInvoice: function() {
    if (!this.invoicePreview || !this.invoicePreviewOpen) return false;
    document.body.classList.add('printing-sale-invoice');
    window.print();
    setTimeout(function(){ document.body.classList.remove('printing-sale-invoice'); }, 500);
    return true;
  },
  closeSaleInvoice: function() {
    this.invoicePreviewOpen = false;
    this.invoicePreview = null;
  },
  downloadSaleInvoicePDF: function() {
    var self=this;
    if (!this.invoicePreview) return false;
    return window.generateSaleInvoicePDF(this.invoicePreview).catch(function(err){
      var message=(err && err.message) ? err.message : 'erro desconhecido';
      self.toast('Não foi possível gerar a factura: ' + message + ' Use Imprimir > Guardar como PDF para manter exactamente o mesmo formato da factura apresentada.', 'error');
      return {success:false,error:message};
    });
  },
  getOperationalArchiveRows: function() {
    var period = this.archivePeriod || 'month';
    var selectedDate = this.archiveDate || this.todayStr();
    var typeFilter = this.archiveType || 'all';
    var rows = [];
    var add = function(row) {
      var date = String(row.date || '');
      if (!date && period !== 'all') return;
      if (period === 'day' && date !== selectedDate) return;
      if (period === 'month' && date.slice(0, 7) !== selectedDate.slice(0, 7)) return;
      if (period === 'year' && date.slice(0, 4) !== selectedDate.slice(0, 4)) return;
      if (typeFilter !== 'all' && row.type !== typeFilter) return;
      row.date = date || '—';
      rows.push(row);
    };
    (this.sales || []).forEach(function(sale) {
      add({id:'sale_'+sale.id,date:sale.date,time:sale.time||'',type:'Venda',title:sale.clientName||'Cliente',details:(Number(sale.qty)||0)+' aves · '+(sale.loteCode||'Lote')+' · '+(sale.paymentStatus||'Registada'),amountText:this.fmtMT(sale.totalAmount)});
    }, this);
    (this.mortalityLogs || []).forEach(function(record) {
      add({id:'mort_'+record.id,date:record.date,time:'',type:'Mortalidade',title:(record.loteCode||'Lote')+' · '+(Number(record.qty)||0)+' aves',details:record.reason||'Motivo não indicado',amountText:'—'});
    });
    (this.feedLogs || []).forEach(function(record) {
      add({id:'feed_'+record.id,date:record.date,time:'',type:'Ração',title:(record.movement||'Movimento')+' · '+(record.type||'Ração'),details:(Number(record.qtyKg)||0)+' kg · '+(record.loteCode||'Armazém Geral'),amountText:record.movement==='COMPRA'?this.fmtMT(record.totalCost):'—'});
    }, this);
    (this.weightLogs || []).forEach(function(record) {
      var weight = Number(record.weightKg || record.kg || record.weight) || 0;
      add({id:'weight_'+record.id,date:record.date||record.createdAt,time:record.time||'',type:'Pesagem',title:record.loteCode||'Lote',details:(weight ? weight+' kg' : 'Peso registado')+(record.notes?' · '+record.notes:''),amountText:'—'});
    });
    (this.healthLogs || []).forEach(function(record) {
      add({id:'health_'+record.id,date:record.date,time:'',type:'Saúde',title:(record.type||'Tratamento')+' · '+(record.product||'Produto'),details:(record.loteCode||'Lote')+(record.notes?' · '+record.notes:''),amountText:Number(record.cost)?this.fmtMT(record.cost):'—'});
    }, this);
    (this.energyLogs || []).forEach(function(record) {
      add({id:'energy_'+record.id,date:record.date,time:'',type:'Energia',title:'Leitura elétrica',details:(Number(record.consumptionKwh)||0)+' kWh · '+(record.prevReading||0)+' → '+(record.currReading||0),amountText:this.fmtMT(record.totalAmount)});
    }, this);
    (this.attendance || []).forEach(function(record) {
      add({id:'attendance_'+record.id,date:record.date,time:record.checkIn||'',type:'Presença',title:record.staffName||'Colaborador',details:(record.status||'Registada')+(record.checkOut?' · saída '+record.checkOut:'')+(record.hoursWorked?' · '+record.hoursWorked+' h':''),amountText:'—'});
    });
    (this.receipts || []).forEach(function(record) {
      add({id:'receipt_'+record.id,date:record.date,time:record.time||'',type:'Recebimento',title:record.clientName||'Cliente',details:(record.paymentMethod||'Pagamento')+(record.observation?' · '+record.observation:''),amountText:this.fmtMT(record.amount)});
    }, this);
    (this.cashLogs || []).forEach(function(record) {
      add({id:'cash_'+record.id,date:record.date,time:record.time||'',type:'Caixa',title:record.category||record.type||'Movimento',details:record.description||'Movimento de caixa',amountText:(record.type==='OUT'?'- ':'')+this.fmtMT(record.amount)});
    }, this);
    (this.expenses || []).forEach(function(expense) {
      add({id:'expense_'+expense.id,date:expense.date,time:expense.time||'',type:'Despesa',title:expense.category||'Despesa',details:expense.description||expense.desc||expense.loteCode||'—',amountText:'- '+this.fmtMT(expense.amount)});
    }, this);
    (this.lotes || []).forEach(function(record) {
      add({id:'lot_'+record.id,date:record.entryDate||record.date||record.createdAt,time:'',type:'Lote',title:record.code||'Lote',details:(record.breed||record.type||'Aviário')+' · '+(Number(record.initialBirds)||0)+' aves · '+(record.status||'Registado'),amountText:'—'});
    });
    (this.notifications || []).forEach(function(record) {
      add({id:'notification_'+record.id,date:record.date,time:record.time||'',type:'Notificação',title:record.title||record.type||'Aviso',details:record.message||record.detail||'',amountText:'—'});
    });
    (this.financialAudits || []).concat(this.auditLogs || []).forEach(function(entry) {
      add({id:'audit_'+entry.id,date:entry.date||entry.createdAt,time:entry.time||'',type:'Auditoria',title:entry.action||'Alteração',details:(entry.userName||entry.user||'Sistema')+' · '+(entry.details||''),amountText:Number(entry.amount)?this.fmtMT(entry.amount):'—'});
    }, this);
    (this.archivedRecords || []).forEach(function(entry) {
      add({id:'deleted_'+entry.id,date:entry.date,time:entry.time||'',type:'Eliminação',title:(entry.type||'Registo')+' eliminado',details:(entry.description||'Registo removido')+' · Data original: '+(entry.originalDate||'—')+' · Por: '+(entry.deletedBy||'Sistema'),amountText:'—'});
    });
    return rows.sort(function(a, b) {
      return String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time));
    });
  },
  getOperationalArchivePeriodLabel: function() {
    var date = this.archiveDate || this.todayStr();
    if (this.archivePeriod === 'all') return 'Todos os períodos';
    if (this.archivePeriod === 'day') return 'Dia ' + date;
    if (this.archivePeriod === 'year') return 'Ano ' + date.slice(0, 4);
    return 'Mês ' + date.slice(0, 7);
  },
  downloadOperationalArchivePDF: function() {
    var self = this;
    if (typeof window.generateOperationalArchivePDF !== 'function') {
      this.toast('O gerador de PDF do arquivo não está disponível.', 'error');
      return Promise.resolve(false);
    }
    return window.generateOperationalArchivePDF({
      settings: this.settings || {},
      period: this.getOperationalArchivePeriodLabel(),
      type: this.archiveType || 'all',
      rows: this.getOperationalArchiveRows()
    }).then(function() {
      self.toast('PDF do arquivo descarregado.');
      return true;
    }).catch(function(error) {
      self.toast('Não foi possível gerar o PDF: '+((error&&error.message)||'erro desconhecido'),'error');
      return false;
    });
  },
  exportPDF: function() {
        var transactions = typeof this.getAllTransactions === 'function' ? this.getAllTransactions() : (this.cashLogs || []);
        var kpis = typeof this.getSummaryKPIs === 'function' ? this.getSummaryKPIs() : {};
        return window.generateProfessionalAviarioPDF({
          settings: this.settings || {},
          kpis: kpis,
          lotes: this.lotes || [],
          sales: this.sales || [],
          feedLogs: this.feedLogs || [],
          mortalityLogs: this.mortalityLogs || [],
          clients: this.clients || [],
          expenses: this.expenses || [],
          receipts: this.receipts || [],
          stockItems: this.stockItems || [],
          healthLogs: this.healthLogs || [],
          attendance: this.attendance || [],
          energyLogs: this.energyLogs || [],
          suppliers: this.suppliers || [],
          notifications: this.notifications || [],
          cashTransactions: transactions,
          priceTable: this.priceTable || []
        }, 'Relatorio_Aviario_' + this.todayStr());
      },
};
