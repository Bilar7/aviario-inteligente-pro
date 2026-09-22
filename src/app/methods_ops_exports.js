import "../services/firebase.js";
// Métodos: ops_exports
export const methods = {
  exportExcel: function() {
        var farmData = {
          settings: this.settings || {},
          kpis: this.getSummaryKPIs ? this.getSummaryKPIs() : {},
          activeLote: this.getActiveLote ? this.getActiveLote() : null,
          lotes: (this.lotes && this.lotes.length ? this.lotes : (farmPayload.lotes || [])),
          mortalityLogs: (this.mortalityLogs && this.mortalityLogs.length ? this.mortalityLogs : (farmPayload.mortalityLogs || [])),
          feedLogs: (this.feedLogs && this.feedLogs.length ? this.feedLogs : (farmPayload.feedLogs || [])),
          sales: (this.sales && this.sales.length ? this.sales : (farmPayload.sales || [])),
          clients: (this.clients && this.clients.length ? this.clients : (farmPayload.clients || [])),
          expenses: (this.expenses && this.expenses.length ? this.expenses : (farmPayload.expenses || [])),
          staff: this.staff || [],
          attendance: (this.attendance && this.attendance.length ? this.attendance : (farmPayload.attendance || [])),
          stockItems: (this.stockItems && this.stockItems.length ? this.stockItems : (farmPayload.stockItems || [])),
          cashLogs: this.cashLogs || [],
          receipts: (this.receipts && this.receipts.length ? this.receipts : (farmPayload.receipts || [])),
          healthLogs: (this.healthLogs && this.healthLogs.length ? this.healthLogs : (farmPayload.healthLogs || [])),
          notifications: (this.notifications && this.notifications.length ? this.notifications : (farmPayload.notifications || [])),
          priceTable: (this.priceTable && this.priceTable.length ? this.priceTable : (farmPayload.priceTable || [])),
          suppliers: (this.suppliers && this.suppliers.length ? this.suppliers : (farmPayload.suppliers || [])),
          energyLogs: (this.energyLogs && this.energyLogs.length ? this.energyLogs : (farmPayload.energyLogs || [])),
          cashTransactions: typeof this.getAllTransactions === 'function' ? this.getAllTransactions() : (this.cashLogs || [])
        };
        return window.exportSmartExcel(farmData);
      },
  openSaleInvoice: function(sale) {
    if (!sale) { this.toast('Venda não encontrada para emitir a factura.', 'error'); return false; }
    var settings = Object.assign({}, this.settings || {});
    var qty = Math.max(0, Number(sale.qty) || 0);
    var weightKg = Math.max(0, Number(sale.weightKg) || 0);
    var totalAmount = Math.max(0, Number(sale.totalAmount) || 0);
    var priceUnit = Number(sale.priceUnit) || 0;
    if (!priceUnit) {
      if (sale.type === 'weight' && weightKg > 0 && totalAmount > 0) priceUnit = totalAmount / weightKg;
      else if (qty > 0 && totalAmount > 0) priceUnit = totalAmount / qty;
    }
    var paidAmount = Math.max(0, Number(sale.paidAmount) || 0);
    var debtAmount = Math.max(0, Number(sale.debtAmount) || Math.max(0, totalAmount - paidAmount));
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
      paymentStatus: sale.paymentStatus || (debtAmount > 0 ? 'Pendente' : 'Pago'),
      responsible: sale.responsible || (this.currentUser && this.currentUser.nome) || 'Sistema'
    });
    this.invoicePreviewOpen = true;
    return true;
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
      self.toast('Não foi possível gerar a factura: ' + (err && err.message ? err.message : 'erro desconhecido'), 'error');
    });
  },
  exportPDF: async function() {
        // Se o utilizador acabou de entrar e os listeners ainda não terminaram,
        // garante uma leitura actual antes de criar o documento. Em estado normal
        // não há espera extra, preservando o arranque/exportação rápidos.
        if (this.currentUser && this.currentFarmId && navigator.onLine &&
            !(this.lotes || []).length && !(this.sales || []).length && !(this.clients || []).length &&
            typeof this.syncNow === 'function' && !this.syncBusy) {
          try { await this.syncNow({silent:true, automatic:true}); } catch (e) {}
        }
        var transactions = typeof this.getAllTransactions === 'function' ? this.getAllTransactions() : (this.cashLogs || []);
        var kpis = typeof this.getSummaryKPIs === 'function' ? this.getSummaryKPIs() : {};
        var farmPayload = typeof this._buildFarmPayload === 'function' ? this._buildFarmPayload() : {};
        return window.generateProfessionalAviarioPDF(Object.assign({}, farmPayload, {
          settings: this.settings || {},
          kpis: kpis,
          lotes: (this.lotes && this.lotes.length ? this.lotes : (farmPayload.lotes || [])),
          sales: (this.sales && this.sales.length ? this.sales : (farmPayload.sales || [])),
          feedLogs: (this.feedLogs && this.feedLogs.length ? this.feedLogs : (farmPayload.feedLogs || [])),
          mortalityLogs: (this.mortalityLogs && this.mortalityLogs.length ? this.mortalityLogs : (farmPayload.mortalityLogs || [])),
          clients: (this.clients && this.clients.length ? this.clients : (farmPayload.clients || [])),
          expenses: (this.expenses && this.expenses.length ? this.expenses : (farmPayload.expenses || [])),
          receipts: (this.receipts && this.receipts.length ? this.receipts : (farmPayload.receipts || [])),
          stockItems: (this.stockItems && this.stockItems.length ? this.stockItems : (farmPayload.stockItems || [])),
          healthLogs: (this.healthLogs && this.healthLogs.length ? this.healthLogs : (farmPayload.healthLogs || [])),
          attendance: (this.attendance && this.attendance.length ? this.attendance : (farmPayload.attendance || [])),
          energyLogs: (this.energyLogs && this.energyLogs.length ? this.energyLogs : (farmPayload.energyLogs || [])),
          suppliers: (this.suppliers && this.suppliers.length ? this.suppliers : (farmPayload.suppliers || [])),
          notifications: (this.notifications && this.notifications.length ? this.notifications : (farmPayload.notifications || [])),
          cashTransactions: transactions,
          priceTable: (this.priceTable && this.priceTable.length ? this.priceTable : (farmPayload.priceTable || []))
        }), 'Relatorio_Aviario_' + this.todayStr());
      },
};
