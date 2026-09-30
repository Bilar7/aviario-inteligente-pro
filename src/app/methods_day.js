import "../services/firebase.js";
import { exportDailyControlExcel } from "../services/exports.js";
// Métodos: day
export const methods = {
  activeProducts: function() {
        return this.stockItems || [];
      },
  dayRecord: function(dateStr) {
        if (!this.dailyRecords) this.dailyRecords = {};
        if (!this.dailyRecords[dateStr]) {
          this.dailyRecords[dateStr] = {
            status: 'open',
            items: {}
          };
        }
        return this.dailyRecords[dateStr];
      },
  ensureDay: function(dateStr) {
        this.dayRecord(dateStr);
      },
  recordFor: function(prodId, dateStr) {
        var d = this.dayRecord(dateStr);
        if (!d.items[prodId]) {
          d.items[prodId] = {
            stockInicial: 0,
            entradas: [],
            remanescente: null
          };
        }
        return d.items[prodId];
      },
  entradaTotal: function(rec) {
        if (!rec || !rec.entradas) return 0;
        return rec.entradas.reduce(function(acc, val) { return acc + Number(val || 0); }, 0);
      },
  disponivel: function(rec) {
        if (!rec) return 0;
        return (Number(rec.stockInicial) || 0) + this.entradaTotal(rec);
      },
  saida: function(rec) {
        if (!rec || rec.remanescente === null || typeof rec.remanescente === 'undefined') return null;
        var disp = this.disponivel(rec);
        var rem = Number(rec.remanescente) || 0;
        return Math.max(0, disp - rem);
      },
  totalVendido: function(rec, prod) {
        var s = this.saida(rec);
        if (s === null) return null;
        var price = Number(prod ? prod.price : 0) || 0;
        return s * price;
      },
  dayTotals: function(dateStr) {
        var self = this;
        var totalUnidades = 0;
        var totalVendas = 0;
        var d = this.dayRecord(dateStr);
        this.activeProducts().forEach(function(p) {
          var r = self.recordFor(p.id, dateStr);
          var s = self.saida(r);
          if (s !== null) {
            totalUnidades += s;
            totalVendas += (s * (Number(p.price) || 0));
          }
        });
        return { totalUnidades: totalUnidades, totalVendas: totalVendas };
      },
  saveRemanescente: function(prodId) {
        var val = this.remInputs[prodId];
        if (val === '' || typeof val === 'undefined') return;
        var rec = this.recordFor(prodId, this.selectedDate);
        rec.remanescente = Number(val) || 0;
        this.persistFarm();
        this.toast('Sobrou guardado com sucesso!');
      },
  aplicarRemanescenteComoInicial: function(dateStr) {
        var self = this;
        var d = this.dayRecord(dateStr);
        this.activeProducts().forEach(function(p) {
          var r = self.recordFor(p.id, dateStr);
          if (r.remanescente !== null) {
            r.stockInicial = r.remanescente;
            r.remanescente = null;
            delete self.remInputs[p.id];
          }
        });
        this.persistFarm();
        this.toast('Sobrou aplicado como Stock Inicial!');
      },
  zerarPlanilha: function(dateStr) {
        var self = this;
        this.confirm('Tem a certeza que deseja limpar o Controlo do Dia ' + dateStr + '?', function() {
          var d = self.dayRecord(dateStr);
          d.items = {};
          self.remInputs = {};
          self.persistFarm();
          self.toast('Controlo do Dia limpo!');
        });
      },
  exportDailyExcel: function(dateStr) {
    var self = this;
    var rows = [];
    this.activeProducts().forEach(function(p) {
      var r = self.recordFor(p.id, dateStr);
      rows.push([
        p.name,
        p.price || 0,
        r.stockInicial || 0,
        self.entradaTotal(r),
        self.disponivel(r),
        r.remanescente !== null ? r.remanescente : '—',
        self.saida(r) !== null ? self.saida(r) : '—',
        self.totalVendido(r, p) !== null ? self.totalVendido(r, p) : '—'
      ]);
    });
    var result = exportDailyControlExcel({
      settings: this.settings || {},
      date: dateStr,
      products: rows,
      total: this.dayTotals(dateStr)
    });
    this.toast('Excel exportado com sucesso!');
    return result;
  },
  openAddProductModal: function() {
        this.newProdName = '';
        this.newProdPrice = '';
        this.newProdCategory = 'Frangos';
        this.showAddProductModal = true;
      },
  saveNewProduct: function() {
        var name = (this.newProdName || '').trim();
        var price = Number(this.newProdPrice) || 0;
        if (!name) {
          this.toast('Introduza o nome do produto', 'error');
          return;
        }
        this.stockItems.push({
          id: 'prod_' + Date.now(),
          name: name,
          category: this.newProdCategory,
          price: price,
          qty: 0,
          unit: 'unid',
          minStock: 5
        });
        this.showAddProductModal = false;
        this.persistFarm();
        this.toast('Produto adicionado ao Controlo!');
      },
  openEntradaModalFor: function(prod) {
        this.entradaTargetProduct = prod;
        this.newEntradaQty = 1;
        this.showEntradaModal = true;
      },
  saveProductEntrada: function() {
        if (!this.entradaTargetProduct) return;
        var qty = Number(this.newEntradaQty) || 0;
        if (qty <= 0) return;
        var r = this.recordFor(this.entradaTargetProduct.id, this.selectedDate);
        if (!r.entradas) r.entradas = [];
        r.entradas.push(qty);
        this.showEntradaModal = false;
        this.persistFarm();
        this.toast('Entrada de ' + qty + ' itens registada!');
      },
};
