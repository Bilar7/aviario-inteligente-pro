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
  
        if (mov === 'CONSUMO') {
          if (!lote) {
            this.toast('Selecione um lote para registar o consumo de ração.', 'error');
            return;
          }
          // Deduz do stock correspondente
          var stockItem = this.stockItems.find(s => s.name.toLowerCase().indexOf('ração') !== -1);
          if (stockItem) {
            var sacksDeducted = qtyKg / (this.settings.feedBagsWeightKg || 50);
            if (sacksDeducted > Number(stockItem.qty)) {
              this.toast('Stock de ração insuficiente para este consumo.', 'error');
              return;
            }
            stockItem.qty = Math.max(0, Number(stockItem.qty) - sacksDeducted);
          }
        } else if (mov === 'COMPRA') {
          // Entrada no Stock + Saída no Caixa
          var sacks = Math.ceil(qtyKg / (this.settings.feedBagsWeightKg || 50));
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
  
          // Lança Saída Financeira
          this.cashLogs.unshift({
            id: 'csh_' + Date.now(),
            date: this.newFeedDate || this.todayStr(),
            type: 'OUT',
            category: 'Compra de Ração',
            description: 'Compra de ' + sacks + ' sacos de ' + feedType,
            amount: totalCost,
            referenceId: 'feed_buy_' + Date.now()
          });
        }
  
        var record = {
          id: 'f_' + Date.now(),
          loteId: lote ? lote.id : '',
          loteCode: lote ? lote.code : 'Armazém Geral',
          date: this.newFeedDate || this.todayStr(),
          type: feedType,
          movement: mov,
          qtyKg: qtyKg,
          priceBag: Number(this.newFeedPriceBag) || 0,
          totalCost: mov === 'COMPRA' ? totalCost : 0,
          supplier: this.newFeedSupplier || '',
          recordedBy: this.currentUser ? this.currentUser.nome : 'Sistema'
        };
  
        this.feedLogs.unshift(record);
        this.logAudit('RAÇÃO_' + mov, qtyKg + ' kg de ' + feedType + ' (' + mov + ')');
        this.persistFarm();
        this.runAiDiagnostics();
        this.toast('Movimento de ração (' + mov + ') registado com sucesso!');
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
  
        var log = {
          id: 'en_' + Date.now(),
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
          id: 'e_' + Date.now(),
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
          id: 'csh_' + Date.now(),
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
