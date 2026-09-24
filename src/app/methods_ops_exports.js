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
      var message=(err && err.message) ? err.message : 'erro desconhecido';
      self.toast('Não foi possível gerar a factura: ' + message + ' Use Imprimir > Guardar como PDF para manter exactamente o mesmo formato da factura apresentada.', 'error');
      return {success:false,error:message};
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
