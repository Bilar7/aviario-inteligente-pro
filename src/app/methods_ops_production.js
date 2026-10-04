import "../services/firebase.js";
// Métodos: ops_production
export const methods = {
      // OPERAÇÕES: LOTES DE FRANGOS (MÓDULO 2)
      // OPERAÇÕES: MORTALIDADE / BAIXAS
      addMortality: function() {
        this.mortalityLogs = this.mortalityLogs || [];
        var lote = this.lotes.find(l => l.id === this.newMortLoteId) || this.getActiveLote();
        if (!lote) {
          this.toast('Selecione um lote para registar a mortalidade.', 'error');
          return;
        }
        var qty = Number(this.newMortQty) || 1;
        if (qty <= 0) {
          this.toast('Indique uma quantidade válida de aves mortas.', 'error');
          return;
        }
        var remaining = this.getLoteRemainingBirds(lote);
        if (qty > remaining) {
          this.toast('Quantidade superior ao total de frangos restantes (' + remaining + ').', 'error');
          return;
        }
  
        var record = {
          id: 'm_' + Date.now(),
          loteId: lote.id,
          loteCode: lote.code,
          date: this.newMortDate || this.todayStr(),
          qty: qty,
          reason: this.newMortReason || 'Normal / Maneio',
          recordedBy: this.currentUser ? this.currentUser.nome : 'Sistema'
        };
  
        this.mortalityLogs.unshift(record);
        this.logAudit('REGISTO_MORTALIDADE', qty + ' frangos mortos no lote ' + lote.code);
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Mortalidade de ' + qty + ' aves registada no ' + lote.code);
        this.newMortQty = 1;
      },
      startEditMortality: function(record) {
        if (!record) return;
        this.editingMortality = record;
        this.newMortLoteId = record.loteId || '';
        this.newMortDate = record.date || this.todayStr();
        this.newMortQty = Number(record.qty) || 0;
        this.newMortReason = record.reason || 'Normal / Maneio';
      },
      cancelMortalityEdit: function() {
        this.editingMortality = null;
        this.newMortLoteId = this.lotes && this.lotes.length ? this.lotes[0].id : '';
        this.newMortDate = this.todayStr();
        this.newMortQty = 1;
        this.newMortReason = 'Normal / Maneio';
      },
      saveMortalityEdit: function() {
        if (!this.editingMortality) return this.addMortality();
        this.mortalityLogs = this.mortalityLogs || [];
        var lote = this.lotes.find(l => l.id === this.newMortLoteId) || this.getActiveLote();
        if (!lote) {
          this.toast('Selecione um lote para actualizar a mortalidade.', 'error');
          return;
        }
        var currentQty = Number(this.editingMortality.qty) || 0;
        var qty = Number(this.newMortQty) || 0;
        if (qty <= 0) {
          this.toast('Indique uma quantidade válida de aves mortas.', 'error');
          return;
        }
        var otherDeaths = this.mortalityLogs
          .filter(m => m.id !== this.editingMortality.id && m.loteId === lote.id)
          .reduce((sum, m) => sum + (Number(m.qty) || 0), 0);
        var soldBirds = this.getLoteSoldBirds(lote.id);
        var maxAllowed = Math.max(0, (Number(lote.initialBirds) || 0) - soldBirds - otherDeaths);
        if (qty > maxAllowed) {
          this.toast('A quantidade ajustada excede o total disponível do lote (' + maxAllowed + ' aves).', 'error');
          return;
        }

        this.mortalityLogs = this.mortalityLogs.map(function(m) {
          if (m.id !== this.editingMortality.id) return m;
          return Object.assign({}, m, {
            loteId: lote.id,
            loteCode: lote.code,
            date: this.newMortDate || this.todayStr(),
            qty: qty,
            reason: this.newMortReason || 'Normal / Maneio',
            recordedBy: this.currentUser ? this.currentUser.nome : 'Sistema',
            updatedAt: new Date().toISOString()
          });
        }.bind(this));

        this.logAudit('EDIÇÃO_MORTALIDADE', 'Actualizou mortalidade do lote ' + lote.code + ' de ' + currentQty + ' para ' + qty + ' aves.');
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Registo de mortalidade actualizado com sucesso.');
        this.cancelMortalityEdit();
      },
      deleteMortality: function(record) {
        if (!record) return;
        var self = this;
        this.confirm('Tem a certeza que deseja apagar este registo de mortalidade do lote ' + (record.loteCode || 'selecionado') + ' (' + (record.qty || 0) + ' aves)?', function() {
          self.archiveDeletedRecord('Mortalidade', record, 'Registo de mortalidade eliminado');
          self.mortalityLogs = (self.mortalityLogs || []).filter(function(m) { return m.id !== record.id; });
          self.logAudit('APAGAR_MORTALIDADE', 'Eliminou o registo de mortalidade do lote ' + (record.loteCode || 'desconhecido') + ' com ' + (record.qty || 0) + ' aves.');
          self.persistFarm();
          self.runAiDiagnostics();
          self.toast('Registo de mortalidade apagado com sucesso.', 'success');
          if (self.editingMortality && self.editingMortality.id === record.id) {
            self.cancelMortalityEdit();
          }
        });
      },
      // OPERAÇÕES: RAÇÃO & ALIMENTAÇÃO (MÓDULO 3)
      addFeedLog: function() {
        if (this.newFeedMovement === 'COMPRA' && !this._isAdminRole()) { this.toast('A compra de ração e o lançamento financeiro são reservados ao administrador.', 'error'); return; }
        var lote = this.lotes.find(l => l.id === this.newFeedLoteId) || this.getActiveLote();
        var qtyKg = Number(this.newFeedQtyKg) || 50;
        var mov = this.newFeedMovement || 'CONSUMO';
        var feedType = this.newFeedType || 'Ração A1 (Inicial)';
        var feedId = 'f_' + Date.now();
        var cashEntryId = '';
        var stockAdjusted = false;
        var bagWeight = Number(this.settings.feedBagsWeightKg) || 50;
  
        if (mov === 'CONSUMO') {
          if (!lote) {
            this.toast('Selecione um lote para registar o consumo de ração.', 'error');
            return;
          }
          // Deduz do stock correspondente
          var stockItem = this.stockItems.find(s => s.name.toLowerCase().indexOf('ração') !== -1);
          if (stockItem) {
            var sacksDeducted = qtyKg / bagWeight;
            if (sacksDeducted > Number(stockItem.qty)) {
              this.toast('Stock de ração insuficiente para este consumo.', 'error');
              return;
            }
            stockItem.qty = Math.max(0, Number(stockItem.qty) - sacksDeducted);
            stockAdjusted = true;
          }
        } else if (mov === 'COMPRA') {
          // Entrada no Stock + Saída no Caixa
          var sacks = Math.ceil(qtyKg / bagWeight);
          var priceBag = Number(this.newFeedPriceBag) || 0;
          var totalCost = sacks * priceBag;
  
          var existingStock = this.stockItems.find(s => s.name === feedType);
          if (existingStock) {
            existingStock.qty = Number(existingStock.qty) + sacks;
          } else {
            this.stockItems.push({
              id: 'stk_' + Date.now(),
              name: feedType,
              category: 'Ração',
              qty: sacks,
              unit: 'Sacos 50kg',
              minStock: 10,
              price: priceBag,
              supplier: this.newFeedSupplier || '',
              expiryDate: '',
              lotNumber: 'HG-' + this.todayStr()
            });
          }
          stockAdjusted = true;
  
          // Lança Saída Financeira
          cashEntryId = 'csh_' + feedId;
          this.cashLogs.unshift({
            id: cashEntryId,
            date: this.newFeedDate || this.todayStr(),
            type: 'OUT',
            category: 'Compra de Ração',
            description: 'Compra de ' + sacks + ' sacos de ' + feedType,
            amount: totalCost,
            referenceId: feedId
          });
        }
  
        var record = {
          id: feedId,
          loteId: lote ? lote.id : '',
          loteCode: lote ? lote.code : 'Armazém Geral',
          date: this.newFeedDate || this.todayStr(),
          type: feedType,
          movement: mov,
          qtyKg: qtyKg,
          priceBag: Number(this.newFeedPriceBag) || 0,
          totalCost: mov === 'COMPRA' ? totalCost : 0,
          cashEntryId: cashEntryId,
          stockAdjusted: stockAdjusted,
          supplier: this.newFeedSupplier || '',
          recordedBy: this.currentUser ? this.currentUser.nome : 'Sistema'
        };
  
        this.feedLogs.unshift(record);
        this.logAudit('RAÇÃO_' + mov, qtyKg + ' kg de ' + feedType + ' (' + mov + ')');
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Movimento de ração (' + mov + ') registado com sucesso!');
      },
      startEditFeedLog: function(record) {
        if (!record) return;
        this.editingFeed = record;
        this.newFeedLoteId = record.loteId || '';
        this.newFeedDate = record.date || this.todayStr();
        this.newFeedType = record.type || 'Ração A1 (Inicial)';
        this.newFeedMovement = record.movement || 'CONSUMO';
        this.newFeedQtyKg = Number(record.qtyKg) || '';
        this.newFeedPriceBag = Number(record.priceBag) || '';
        this.newFeedSupplier = record.supplier || '';
      },
      cancelFeedEdit: function() {
        this.editingFeed = null;
        this.newFeedLoteId = this.getActiveLote() ? this.getActiveLote().id : '';
        this.newFeedDate = this.todayStr();
        this.newFeedType = 'Ração A1 (Inicial 0-14d)';
        this.newFeedMovement = 'CONSUMO';
        this.newFeedQtyKg = '';
        this.newFeedPriceBag = '';
        this.newFeedSupplier = '';
      },
      saveFeedLogEdit: function() {
        var original = this.editingFeed;
        if (!original) return;
        if ((original.movement === 'COMPRA' || this.newFeedMovement === 'COMPRA') && !this._isAdminRole()) {
          this.toast('A edição de compras de ração é reservada ao administrador.', 'error');
          return;
        }
        var qtyKg = Number(this.newFeedQtyKg) || 0;
        var lote = this.lotes.find(function(item) { return item.id === this.newFeedLoteId; }.bind(this));
        var movement = this.newFeedMovement || 'CONSUMO';
        var type = this.newFeedType || original.type;
        var bagWeight = Number(this.settings.feedBagsWeightKg) || 50;
        if (qtyKg <= 0 || (movement === 'CONSUMO' && !lote)) {
          this.toast('Indique uma quantidade válida e selecione o lote para o consumo.', 'error');
          return;
        }
        var oldStock = original.stockAdjusted === false ? null : (this.stockItems || []).find(function(item) { return item.name === original.type; });
        var newStock = (this.stockItems || []).find(function(item) { return item.name === type; });
        var stockDelta = function(log) {
          return log.movement === 'COMPRA' ? Math.ceil((Number(log.qtyKg) || 0) / bagWeight) : -(Number(log.qtyKg) || 0) / bagWeight;
        };
        var oldDelta = oldStock ? stockDelta(original) : 0;
        var updated = Object.assign({}, original, {
          loteId: lote ? lote.id : '',
          loteCode: lote ? lote.code : 'Armazém Geral',
          date: this.newFeedDate || this.todayStr(),
          type: type,
          movement: movement,
          qtyKg: qtyKg,
          priceBag: Number(this.newFeedPriceBag) || 0,
          totalCost: movement === 'COMPRA' ? Math.ceil(qtyKg / bagWeight) * (Number(this.newFeedPriceBag) || 0) : 0,
          supplier: this.newFeedSupplier || '',
          stockAdjusted: movement === 'COMPRA' || !!newStock,
          updatedAt: new Date().toISOString()
        });
        var newDelta = newStock || movement === 'COMPRA' ? stockDelta(updated) : 0;
        var oldNext = oldStock && oldStock !== newStock ? Number(oldStock.qty || 0) - oldDelta : null;
        var newNext = oldStock === newStock && newStock
          ? Number(newStock.qty || 0) - oldDelta + newDelta
          : (newStock ? Number(newStock.qty || 0) + newDelta : null);
        if (oldNext !== null && oldNext < 0 || newNext !== null && newNext < 0) {
          this.toast('A alteração excede o stock disponível para corrigir este movimento.', 'error');
          return;
        }
        if (oldNext !== null) oldStock.qty = oldNext;
        if (movement === 'COMPRA' && !newStock) {
          newStock = { id: 'stk_' + Date.now(), name: type, category: 'Ração', qty: 0, unit: 'Sacos 50kg', minStock: 10, price: updated.priceBag, supplier: updated.supplier, expiryDate: '', lotNumber: 'HG-' + updated.date };
          this.stockItems.push(newStock);
          newNext = newDelta;
        }
        if (newStock) newStock.qty = newNext;
        var linkedCash = (this.cashLogs || []).find(function(entry) {
          return entry.id === original.cashEntryId || entry.referenceId === original.id ||
            (entry.category === 'Compra de Ração' && entry.date === original.date && Number(entry.amount) === Number(original.totalCost) && String(entry.description || '').indexOf(original.type) !== -1);
        });
        if (movement === 'COMPRA') {
          if (linkedCash) Object.assign(linkedCash, { date: updated.date, category: 'Compra de Ração', description: 'Compra de ' + Math.ceil(qtyKg / bagWeight) + ' sacos de ' + type, amount: updated.totalCost, referenceId: original.id });
          else {
            updated.cashEntryId = 'csh_' + original.id;
            this.cashLogs.unshift({ id: updated.cashEntryId, date: updated.date, type: 'OUT', category: 'Compra de Ração', description: 'Compra de ' + Math.ceil(qtyKg / bagWeight) + ' sacos de ' + type, amount: updated.totalCost, referenceId: original.id });
          }
        } else if (linkedCash) {
          this.cashLogs = this.cashLogs.filter(function(entry) { return entry.id !== linkedCash.id; });
          updated.cashEntryId = '';
        }
        this.feedLogs = (this.feedLogs || []).map(function(item) { return item.id === original.id ? updated : item; });
        this.logAudit('EDIÇÃO_RAÇAO', 'Actualizou o movimento de ' + original.type + ' para ' + type + ' (' + qtyKg + ' kg).');
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Movimento de ração actualizado.');
        this.cancelFeedEdit();
      },
      deleteFeedLog: function(record) {
        if (!record) return;
        if (record.movement === 'COMPRA' && !this._isAdminRole()) {
          this.toast('A eliminação de compras de ração é reservada ao administrador.', 'error');
          return;
        }
        var self = this;
        this.confirm('Apagar este movimento de ' + (record.type || 'ração') + ' (' + (record.qtyKg || 0) + ' kg)?', function() {
          var stock = (self.stockItems || []).find(function(item) { return item.name === record.type; });
          if (stock && record.stockAdjusted !== false) {
            var bagWeight = Number(self.settings.feedBagsWeightKg) || 50;
            var delta = record.movement === 'COMPRA' ? Math.ceil((Number(record.qtyKg) || 0) / bagWeight) : -(Number(record.qtyKg) || 0) / bagWeight;
            var nextQty = Number(stock.qty || 0) - delta;
            if (nextQty < 0) { self.toast('Não é possível apagar: parte deste stock já foi consumida.', 'error'); return; }
            stock.qty = nextQty;
          }
          self.archiveDeletedRecord('Ração', record, 'Movimento de ração eliminado');
          self.feedLogs = (self.feedLogs || []).filter(function(item) { return item.id !== record.id; });
          var linkedCash = (self.cashLogs || []).filter(function(entry) {
            return entry.id === record.cashEntryId || entry.referenceId === record.id ||
              (record.movement === 'COMPRA' && entry.category === 'Compra de Ração' && entry.date === record.date && Number(entry.amount) === Number(record.totalCost) && String(entry.description || '').indexOf(record.type) !== -1);
          });
          linkedCash.forEach(function(entry) { if (self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'cashEntries', entry.id); });
          self.cashLogs = (self.cashLogs || []).filter(function(entry) { return entry.id !== record.cashEntryId && entry.referenceId !== record.id; });
          self.logAudit('APAGAR_RAÇAO', 'Eliminou o movimento de ' + record.type + ' (' + (record.qtyKg || 0) + ' kg).');
          self.persistFarm();
          self.runAiDiagnostics();
          self.toast('Movimento de ração apagado.');
          if (self.editingFeed && self.editingFeed.id === record.id) self.cancelFeedEdit();
        });
      },
      // OPERAÇÕES: VENDAS DE FRANGOS (MÓDULO 4) — CADEIA REATIVA
      getSalePreviewTotal: function() {
        var qty = Math.max(0, Number(this.newSaleQty) || 0);
        if (this.newSaleType === 'weight') {
          var kg = Math.max(0, Number(this.newSaleWeightKg) || 0);
          var priceKg = Math.max(0, Number(this.newSalePriceUnit) || 0);
          return Math.round(kg * priceKg);
        }
        var priceUnit = Math.max(0, Number(this.newSalePriceUnit) || 0);
        return Math.round(qty * priceUnit);
      },
      getSalePreviewPaid: function() {
        var total = this.getSalePreviewTotal();
        if (this.newSalePaymentStatus === 'Pago') return total;
        return Math.min(total, Math.max(0, Number(this.newSalePaidAmount) || 0));
      },
      getSalePreviewDebt: function() {
        return Math.max(0, this.getSalePreviewTotal() - this.getSalePreviewPaid());
      },
      syncSalePaymentAmount: function() {
        if (this.newSalePaymentStatus === 'Pago') {
          this.newSalePaidAmount = this.getSalePreviewTotal();
        } else if (this.newSalePaymentStatus === 'Crédito') {
          this.newSalePaidAmount = 0;
          this.newSalePaymentMethod = 'Crédito';
        } else if (this.newSalePaymentStatus === 'Parcial') {
          if (Number(this.newSalePaidAmount) > this.getSalePreviewTotal()) {
            this.newSalePaidAmount = this.getSalePreviewTotal();
          }
        }
        return this.newSalePaidAmount;
      },
      addSale: function() {
        var lote = this.lotes.find(l => l.id === this.newSaleLoteId) || this.getActiveLote();
        if (!lote) {
          this.toast('Selecione um lote com frangos disponíveis.', 'error');
          return;
        }
        var qty = Number(this.newSaleQty) || 0;
        if (qty <= 0) { this.toast('Indique a quantidade de frangos.', 'error'); return; }
        var remaining = this.getLoteRemainingBirds(lote);
        if (qty > remaining) {
          this.toast('Quantidade superior ao saldo restante do lote (' + remaining + ' aves).', 'error');
          return;
        }
  
        var clientName = (this.newSaleClientName || 'Cliente Balcão / Particular').trim();
        var client = this.clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
        if (!client) {
          client = {
            id: 'c_' + Date.now(),
            name: clientName,
            phone: '',
            address: 'Local / Balcão',
            type: 'Particular',
            totalBought: 0,
            totalPaid: 0,
            debt: 0,
            dueDate: ''
          };
          this.clients.push(client);
        }
  
        var total = this.getSalePreviewTotal();
        if (total <= 0) {
          this.toast('Indique uma quantidade/peso e um preço válidos para calcular o total.', 'error');
          return;
        }

        var paymentStatus = this.newSalePaymentStatus || 'Pago';
        this.syncSalePaymentAmount();
        var paid = paymentStatus === 'Pago'
          ? total
          : Math.min(total, Math.max(0, Number(this.newSalePaidAmount) || 0));
        var debt = Math.max(0, total - paid);
        var paymentMethod = paymentStatus === 'Crédito'
          ? 'Crédito'
          : (this.newSalePaymentMethod || 'Dinheiro');

        if (paymentStatus === 'Pago' && paid !== total) {
          paid = total;
        }
  
        var sale = {
          id: 's_' + Date.now(),
          farmId: this.currentFarmId || 'farm_principal',
          createdByUid: this.currentUser ? this.currentUser._authUid || this.currentUser.uid || '' : '',
          createdAt: new Date().toISOString(),
          loteId: lote.id,
          loteCode: lote.code,
          clientId: client.id,
          clientName: client.name,
          date: this.newSaleDate || this.todayStr(),
          time: new Date().toTimeString().slice(0, 5),
          product: this.newSaleProduct || 'Frango Vivo',
          type: this.newSaleType,
          qty: qty,
          weightKg: Number(this.newSaleWeightKg) || (qty * (Number(this.settings.standardWeightTarget) || 0)),
          priceUnit: Number(this.newSalePriceUnit) || 0,
          totalAmount: total,
          paidAmount: paid,
          debtAmount: debt,
          paymentMethod: paymentMethod,
          paymentStatus: paymentStatus,
          status: debt === 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending'),
          responsible: this.currentUser ? this.currentUser.nome : 'Sistema'
        };
  
        this.sales.unshift(sale);
  
        // CADEIA REATIVA:
        // 1. Atualiza dados do cliente (Total comprado, Total pago, Dívida pendente)
        client.totalBought = (Number(client.totalBought) || 0) + total;
        client.totalPaid = (Number(client.totalPaid) || 0) + paid;
        client.debt = (Number(client.debt) || 0) + debt;
        if (debt > 0) client.dueDate = this.todayStr();
  
        // 2. O recebimento fica dentro da venda. O Livro de Caixa do administrador
        // deriva a entrada a partir de paidAmount, sem permitir que o funcionário
        // escreva directamente na coleção financeira.
        if (this._queueCloudMutation) this._queueCloudMutation(this.currentFarmId, 'sales', sale);

        this.logAudit('VENDA_FRANGOS', 'Venda de ' + qty + ' frangos para ' + client.name + ' por ' + this.fmtMT(total));
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Venda de ' + qty + ' frangos registada com sucesso! Total: ' + this.fmtMT(total));
        
        this.newSaleQty = '';
        this.newSaleWeightKg = '';
        this.newSalePriceUnit = '';
        this.newSalePaidAmount = '';
        this.newSalePaymentStatus = 'Pago';
        this.newSalePaymentMethod = 'Dinheiro';
        this.subTabVendas = 'historico';
      },
      // OPERAÇÕES: CLIENTES & DÍVIDAS (MÓDULO 6)
      addClient: function() {
        if (!this.newClientName.trim()) {
          this.toast('Por favor, informe o nome do cliente.', 'error');
          return;
        }
        var c = {
          id: 'c_' + Date.now(),
          name: this.newClientName.trim(),
          phone: this.newClientPhone || '',
          address: this.newClientAddress || '',
          type: this.newClientType || 'Particular',
          totalBought: 0,
          totalPaid: 0,
          debt: 0,
          dueDate: ''
        };
        this.clients.unshift(c);
        this.persistFarm();
        this.toast('Cliente ' + c.name + ' cadastrado com sucesso!');
        this.newClientName = '';
        this.newClientPhone = '';
        this.newClientAddress = '';
        this.subTabClientes = 'lista';
      },
  sendWhatsAppBilling: function(client) {
        if (!client.phone) {
          this.toast('Cliente não possui telemóvel registado.', 'error');
          return;
        }
        var cleanPhone = client.phone.replace(/[^0-9]/g, '');
        if (cleanPhone.indexOf('258') !== 0 && cleanPhone.length === 9) {
          cleanPhone = '258' + cleanPhone;
        }
        var msg = "Olá *" + client.name + "*! \nSaudações do *" + this.settings.farmName + "*.\n\nInformamos que possui um saldo pendente de *" + this.fmtMT(client.debt) + "* referente à compra de frangos.\n\nPode efetuar o pagamento via M-Pesa para o número: " + this.settings.phone + ".\nMuito obrigado pela preferência!";
        var url = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(msg);
        window.open(url, '_blank');
      },
  logAttendance: function(staffMember, status) {
        var checkInTime = new Date().toTimeString().slice(0, 5);
        var record = {
          id: 'att_' + Date.now(),
          staffId: staffMember.id,
          staffName: staffMember.name,
          date: this.todayStr(),
          checkIn: checkInTime,
          checkOut: '17:00',
          hoursWorked: 9.0,
          status: status || 'present'
        };
        this.attendance.unshift(record);
        this.persistFarm();
        this.toast('Ponto registado para ' + staffMember.name + ' (' + status + ')');
      },
  deleteAttendanceRecord: function(record) {
        if (!record || !this._isAdminRole()) { this.toast('Apenas o administrador pode apagar presenças.', 'error'); return; }
        var self=this;
        this.confirm('Apagar a presença de '+(record.staffName||'colaborador')+' em '+(record.date||'—')+'?',function(){
          self.archiveDeletedRecord('Presença',record,'Registo de presença eliminado');
          self.attendance=(self.attendance||[]).filter(function(item){return item.id!==record.id;});
          self.persistFarm();
          self.toast('Presença eliminada e arquivada.');
        });
      },
  paySalaryAdvance: function(staffMember, amount, desc, paymentMethod) {
        var val = Number(amount);
        if (isNaN(val) || val <= 0) {
          this.toast('Valor de pagamento inválido.', 'error');
          return;
        }
        staffMember.paidThisMonth = (Number(staffMember.paidThisMonth) || 0) + val;
  
        // CADEIA REATIVA: Saída no Caixa
        this.cashLogs.unshift({
          id: 'csh_' + Date.now(),
          date: this.todayStr(),
          type: 'OUT',
          category: 'Salários & Mão de Obra',
          description: (desc || 'Pagamento / Adiantamento Salarial') + ' — ' + staffMember.name,
          amount: val,
          referenceId: staffMember.id
        });
  
        this.expenses.unshift({
          id: 'e_' + Date.now(),
          loteId: '',
          loteCode: 'Geral',
          category: 'Salários',
          description: (desc || 'Salário') + ' — ' + staffMember.name,
          amount: val,
          date: this.todayStr(),
          paymentMethod: paymentMethod || 'Caixa / Numerário',
          supplier: staffMember.name
        });
  
        this.logAudit('PAGAMENTO_SALARIO', 'Pago ' + this.fmtMT(val) + ' a ' + staffMember.name);
        this.persistFarm();
        this.toast('Pagamento de ' + this.fmtMT(val) + ' registado para ' + staffMember.name);
        this.payingStaff = null;
      },
      // OPERAÇÕES: ENERGIA & DESPESAS (MÓDULO 8)
      addEnergyLog: function() {
        var prev = Number(this.newEnergyPrev) || 0;
        var curr = Number(this.newEnergyCurr) || 0;
        if (curr < prev) {
          this.toast('A leitura atual não pode ser inferior à anterior.', 'error');
          return;
        }
        var cons = curr - prev;
        var pKwh = Number(this.newEnergyPriceKwh) || 0;
        var total = Number(this.newEnergyAmount) || Math.round(cons * pKwh);
  
        var logId = 'en_' + Date.now();
        var expenseId = 'e_energy_' + Date.now();
        var cashId = 'csh_energy_' + Date.now();
        var log = {
          id: logId,
          expenseId: expenseId,
          cashEntryId: cashId,
          prevReading: prev,
          currReading: curr,
          consumptionKwh: cons,
          pricePerKwh: pKwh,
          totalAmount: total,
          date: this.newEnergyDate || this.todayStr()
        };
        this.energyLogs.unshift(log);
  
        // CADEIA REATIVA: Saída no Caixa & Despesa Financeira
        this.expenses.unshift({
          id: expenseId,
          loteId: '',
          loteCode: 'Geral',
          category: 'Energia (EDM Credelec)',
          description: 'Consumo elétrico ' + cons + ' kWh (Contador EDM)',
          amount: total,
          date: log.date,
          paymentMethod: 'Credelec / M-Pesa',
          supplier: 'EDM'
        });
  
        this.cashLogs.unshift({
          id: cashId,
          date: log.date,
          type: 'OUT',
          category: 'Energia Elétrica',
          description: 'Recarga Credelec EDM (' + cons + ' kWh)',
          amount: total,
          referenceId: log.id
        });
  
        this.newEnergyPrev = curr;
        this.newEnergyCurr = curr + 150;
        this.persistFarm();
        this.toast('Fatura de energia de ' + this.fmtMT(total) + ' calculada e registada!');
      },
  deleteEnergyLog: function(record) {
        if (!record || !this._isAdminRole()) { this.toast('Apenas o administrador pode apagar leituras de energia.', 'error'); return; }
        var self=this;
        this.confirm('Apagar a leitura de energia de '+(record.date||'—')+' ('+(Number(record.consumptionKwh)||0)+' kWh)?',function(){
          self.archiveDeletedRecord('Energia',record,'Leitura de energia eliminada');
          var consumption=Number(record.consumptionKwh)||0;
          var description='Consumo elétrico '+consumption+' kWh (Contador EDM)';
          var expense=(self.expenses||[]).find(function(item){return item.id===record.expenseId||(item.category==='Energia (EDM Credelec)'&&item.date===record.date&&item.description===description);});
          var expenseId=expense?expense.id:record.expenseId;
          self.energyLogs=(self.energyLogs||[]).filter(function(item){return item.id!==record.id;});
          if (expenseId && self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'expenses', expenseId);
          (self.cashLogs||[]).filter(function(item){return item.id===record.cashEntryId||item.referenceId===record.id||item.referenceId===expenseId;}).forEach(function(item){if(self._queueCloudDelete)self._queueCloudDelete(self.currentFarmId,'cashEntries',item.id);});
          self.expenses=(self.expenses||[]).filter(function(item){return item.id!==expenseId;});
          self.cashLogs=(self.cashLogs||[]).filter(function(item){return item.id!==record.cashEntryId&&item.referenceId!==record.id&&item.referenceId!==expenseId;});
          self.persistFarm();
          self.runAiDiagnostics();
          self.toast('Leitura de energia eliminada e arquivada.');
        });
      },
  addExpense: function() {
        var amt = Number(this.newExpAmount);
        if (isNaN(amt) || amt <= 0) {
          this.toast('Informe um valor válido para a despesa.', 'error');
          return;
        }
        var exp = {
          id: 'e_' + Date.now(),
          loteId: this.newExpLoteId || '',
          loteCode: this.newExpLoteId ? (this.lotes.find(l => l.id === this.newExpLoteId) || {}).code || 'Lote' : 'Geral',
          category: this.newExpCategory || 'Outros Custos',
          description: this.newExpDesc || 'Despesa operacional de rotina',
          amount: amt,
          date: this.newExpDate || this.todayStr(),
          paymentMethod: this.newExpPaymentMethod || 'Caixa',
          supplier: 'Fornecedor Local'
        };
  
        this.expenses.unshift(exp);
  
        // CADEIA REATIVA: Saída no Caixa
        this.cashLogs.unshift({
          id: 'csh_' + Date.now(),
          date: exp.date,
          type: 'OUT',
          category: exp.category,
          description: exp.description + ' (' + exp.loteCode + ')',
          amount: exp.amount,
          referenceId: exp.id
        });
  
        this.logAudit('DESPESA_' + exp.category, this.fmtMT(amt) + ' — ' + exp.description);
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Despesa de ' + this.fmtMT(amt) + ' registada com sucesso!');
        this.newExpDesc = '';
        this.newExpAmount = '';
      },
      startEditExpense: function(expense) {
        if (!expense) return;
        this.editingExpense = expense;
        this.newExpLoteId = expense.loteId || '';
        this.newExpCategory = expense.category || 'Outros';
        this.newExpDesc = expense.description || expense.desc || '';
        this.newExpAmount = Number(expense.amount) || '';
        this.newExpDate = expense.date || this.todayStr();
        this.newExpPaymentMethod = expense.paymentMethod || 'Caixa';
        if (this.view !== 'despesas') this.view = 'despesas';
      },
      cancelExpenseEdit: function() {
        this.editingExpense = null;
        this.newExpLoteId = '';
        this.newExpCategory = 'Medicamentos & Vacinas';
        this.newExpDesc = '';
        this.newExpAmount = '';
        this.newExpDate = this.todayStr();
        this.newExpPaymentMethod = 'Caixa / Numerário';
      },
      saveExpenseEdit: function() {
        var original = this.editingExpense;
        if (!original) return;
        if (!this._isAdminRole || !this._isAdminRole()) { this.toast('A edição de despesas é reservada ao administrador.', 'error'); return; }
        var amount = Number(this.newExpAmount);
        if (!Number.isFinite(amount) || amount <= 0) { this.toast('Indique um valor válido para a despesa.', 'error'); return; }
        var description = (this.newExpDesc || '').trim() || 'Despesa operacional';
        var updated = Object.assign({}, original, {
          loteId: this.newExpLoteId || original.loteId || '',
          category: Number(original.bagsQty) > 0 ? original.category : (this.newExpCategory || original.category || 'Outros'),
          description: description,
          desc: description,
          amount: amount,
          date: this.newExpDate || this.todayStr(),
          paymentMethod: this.newExpPaymentMethod || original.paymentMethod || 'Caixa',
          updatedAt: new Date().toISOString()
        });
        this.expenses = (this.expenses || []).map(function(item) { return item.id === original.id ? updated : item; });
        var linkedCash = (this.cashLogs || []).find(function(entry) { return entry.referenceId === original.id; });
        if (linkedCash) Object.assign(linkedCash, { date: updated.date, category: updated.category, description: updated.description, amount: amount, paymentMethod: updated.paymentMethod });
        else {
          this.cashLogs.unshift({ id: 'csh_' + original.id, date: updated.date, type: 'OUT', category: updated.category, description: updated.description, amount: amount, paymentMethod: updated.paymentMethod, referenceId: updated.id });
        }
        this.logAudit('EDIÇÃO_DESPESA', 'Actualizou ' + updated.category + ': ' + updated.description, amount);
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Despesa actualizada.');
        this.cancelExpenseEdit();
      },
      deleteExpense: function(expense) {
        if (!expense) return;
        if (!this._isAdminRole || !this._isAdminRole()) { this.toast('A eliminação de despesas é reservada ao administrador.', 'error'); return; }
        var self = this;
        this.confirm('Apagar a despesa "' + (expense.description || expense.desc || expense.category || 'Despesa') + '" no valor de ' + this.fmtMT(expense.amount) + '?', function() {
          if (Number(expense.bagsQty) > 0 && expense.stockItemId) {
            var stockItem = (self.stockItems || []).find(function(item) { return item.id === expense.stockItemId; });
            if (stockItem) stockItem.qty = Number(stockItem.qty || 0) + Number(expense.bagsQty);
          }
          self.archiveDeletedRecord('Despesa', expense, 'Despesa eliminada');
          if (self._queueCloudDelete) self._queueCloudDelete(self.currentFarmId, 'expenses', expense.id);
          (self.cashLogs||[]).filter(function(entry){return entry.referenceId===expense.id;}).forEach(function(entry){if(self._queueCloudDelete)self._queueCloudDelete(self.currentFarmId,'cashEntries',entry.id);});
          self.expenses = (self.expenses || []).filter(function(item) { return item.id !== expense.id; });
          self.cashLogs = (self.cashLogs || []).filter(function(entry) { return entry.referenceId !== expense.id; });
          self.logAudit('APAGAR_DESPESA', 'Eliminou ' + (expense.category || 'Despesa') + ': ' + (expense.description || expense.desc || ''), expense.amount);
          self.persistFarm();
          self.runAiDiagnostics();
          self.toast('Despesa apagada e registada na auditoria.');
          if (self.editingExpense && self.editingExpense.id === expense.id) self.cancelExpenseEdit();
        });
      },
      // OPERAÇÕES: INVENTÁRIO & STOCK (MÓDULO 9) — 6 ABAS
      addStockItem: function() {
        if (!this.newStockName.trim()) {
          this.toast('Informe o nome do insumo.', 'error');
          return;
        }
        var item = {
          id: 'stk_' + Date.now(),
          name: this.newStockName.trim(),
          category: this.newStockCategory || 'Ração',
          qty: Number(this.newStockQty) || 0,
          unit: this.newStockUnit || 'Sacos 50kg',
          minStock: Number(this.newStockMin) || 5,
          price: Number(this.newStockPrice) || 0,
          supplier: this.newStockSupplier || '',
          expiryDate: this.newStockExpiry || '',
          lotNumber: this.newStockLot || 'LOT-2026'
        };
        this.stockItems.unshift(item);
        this.persistFarm();
        this.toast('Insumo ' + item.name + ' adicionado ao stock!');
        this.newStockName = '';
        this.subTabStock = 'posicao';
      },
};
