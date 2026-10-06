
// Métodos: modals
export const methods = {
  openNewLote: function() {
        if (!this.canCreateOperationalLote()) {
          this.toast('O seu perfil não tem permissão para criar lotes.', 'error');
          return;
        }
        this.editingLote = null;
        this.showNewLote = true;
        var year = new Date().getFullYear();
        var next = String((this.lotes || []).length + 1).padStart(3, '0');
        this.newLoteCode = 'L-' + year + '-' + next;
        this.newLoteBreed = 'Frango de corte';
        this.newLoteEntryDate = this.todayStr();
        this.newLoteBirds = '';
        this.newLoteAvgWeight = '';
        this.newLoteNotes = '';
        this.newLoteSupplier = '';
        this.newLoteInitialAge = 1;
        this.newLotePricePerChick = '';
        this.newLoteCostChicks = 0;
      },
      closeNewLote: function() {
        this.showNewLote = false;
        this.editingLote = null;
      },
      startEditLote: function(lote) {
        if (!this.canCreateOperationalLote()) {
          this.toast('O seu perfil não tem permissão para editar lotes.', 'error');
          return;
        }
        if (!lote) return;
        this.editingLote = lote;
        this.newLoteCode = lote.code || '';
        this.newLoteBreed = lote.breed || lote.type || 'Frango de corte';
        this.newLoteEntryDate = lote.entryDate || this.todayStr();
        this.newLoteBirds = Number(lote.initialBirds) || '';
        this.newLoteAvgWeight = Number(lote.avgWeight) || '';
        this.newLoteNotes = lote.notes || '';
        this.newLoteSupplier = lote.supplier || '';
        this.newLoteInitialAge = Number(lote.initialAge) || 0;
        this.newLotePricePerChick = Number(lote.pricePerChick) || '';
        this.newLoteCostChicks = Number(lote.costChicks) || 0;
        this.selectedLote = null;
        this.showNewLote = true;
      },
      getLoteLinkedRecords: function(lote) {
        if (!lote) return [];
        var collections = ['mortalityLogs', 'weightLogs', 'feedLogs', 'sales', 'expenses', 'healthLogs'];
        return collections.reduce(function(records, collection) {
          return records.concat((this[collection] || []).filter(function(record) {
            return String(record.loteId || '') === String(lote.id) ||
              (!record.loteId && String(record.loteCode || '') === String(lote.code || ''));
          }));
        }.bind(this), []);
      },
      saveNewLote: function() {
        if (!this.canCreateOperationalLote()) {
          this.toast('O seu perfil não tem permissão para criar lotes.', 'error');
          return;
        }
        var birds = Math.floor(Number(this.newLoteBirds) || 0);
        if (birds <= 0) {
          this.toast('Indique o número de aves do lote.', 'error');
          return;
        }
        var entryDate = this.newLoteEntryDate || this.todayStr();
        var code = String(this.newLoteCode || '').trim() || ('LT-' + Math.floor(1000 + Math.random() * 9000));
        var editing = this.editingLote;
        var current = editing && (this.lotes || []).find(function(l) { return l.id === editing.id; });
        if (editing && !current) {
          this.toast('Este lote já não existe. Atualize a lista e tente novamente.', 'error');
          this.closeNewLote();
          return;
        }
        var duplicate = (this.lotes || []).some(function(l) {
          return l.id !== (current && current.id) && String(l.code || '').toLowerCase() === code.toLowerCase();
        });
        if (duplicate) {
          this.toast('Já existe um lote com o código ' + code + '.', 'error');
          return;
        }
        var birds = Math.floor(Number(this.newLoteBirds) || 0);
        if (current && birds < this.getLoteMortality(current.id) + this.getLoteSoldBirds(current.id)) {
          this.toast('A quantidade inicial não pode ser inferior às aves já mortas ou vendidas.', 'error');
          return;
        }
        var linkedRecords = current ? this.getLoteLinkedRecords(current) : [];
        var avgWeight = Number(this.newLoteAvgWeight) || 0;
        var lote = current || {
          id: 'lote_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          status: 'active',
          createdAt: new Date().toISOString(),
          createdBy: this.currentUser ? (this.currentUser.username || this.currentUser.nome || 'Sistema') : 'Sistema'
        };
        var previousCode = lote.code;
        Object.assign(lote, {
          code: code,
          breed: this.newLoteBreed || 'Frango de corte',
          entryDate: entryDate,
          initialBirds: birds,
          avgWeight: avgWeight > 0 ? avgWeight : 0,
          supplier: String(this.newLoteSupplier || '').trim(),
          initialAge: Math.max(0, Number(this.newLoteInitialAge) || 0),
          pricePerChick: Math.max(0, Number(this.newLotePricePerChick) || 0),
          costChicks: Math.max(0, (Number(this.newLoteBirds)||0) * (Number(this.newLotePricePerChick)||0)),
          notes: String(this.newLoteNotes || '').trim()
        });
        if (!Array.isArray(this.lotes)) this.lotes = [];
        if (current) {
          if (previousCode !== code) {
            linkedRecords.forEach(function(record) { record.loteCode = code; });
          }
        } else {
          this.lotes.unshift(lote);
        }
        this.selectedLoteId = lote.id;
        this.selectedLote = null;
        this.persistFarm();
        this.showNewLote = false;
        this.editingLote = null;
        if (!current) this.loteStatusFilter = 'active';
        this.toast(current ? 'Lote #' + lote.code + ' atualizado com sucesso.' : 'Lote #' + lote.code + ' criado com sucesso.');
      },
      deleteLote: function(lote) {
        if (!this.canCreateOperationalLote()) {
          this.toast('O seu perfil não tem permissão para apagar lotes.', 'error');
          return;
        }
        if (!lote) return;
        var linkedRecords = this.getLoteLinkedRecords(lote);
        if (linkedRecords.length) {
          this.toast('Não é possível apagar este lote porque já tem movimentos associados. Edite-o para corrigir os dados.', 'error');
          return;
        }
        this.confirm('Apagar o lote #' + lote.code + '? Esta ação não pode ser desfeita.', function() {
          this.lotes = (this.lotes || []).filter(function(item) { return item.id !== lote.id; });
          this.selectedLote = null;
          this.editingLote = null;
          this.selectedLoteId = (this.lotes.find(function(item) { return item.status === 'active'; }) || this.lotes[0] || {}).id || '';
          this.logAudit('APAGAR_LOTE', 'Apagou o lote #' + lote.code);
          this.persistFarm();
          this.toast('Lote #' + lote.code + ' apagado.');
        }.bind(this));
      },
  openModalSaida: function() {
        this.showModalSaida = true;
        this.newSaidaDate = this.newSaidaDate || this.todayStr();
        this.newSaidaStatus = this.newSaidaStatus || 'Pago';
      },
      // CAIXA & FINANÇAS PRO — MÉTODOS DE CÁLCULO & CADEIA REATIVA
      saveModalEntrada: function() {
        if (!this._isAdminRole || !this._isAdminRole()) { this.toast('O acesso ao Livro de Caixa é reservado ao administrador.', 'error'); return; }
        var val = parseFloat(this.newEntradaAmount) || 0;
        if (val <= 0) {
          this.toast('Indique um valor válido para a entrada.', 'error');
          return;
        }
        
        var desc = this.newEntradaDesc.trim() || (this.newEntradaType + ' recebida');
        var client = null;
        if (this.newEntradaClientId) {
          client = this.clients.find(function(c) { return c.id === this.newEntradaClientId; }.bind(this));
        }
        
        var entryId = 'ent_' + Date.now().toString(36);
        this.cashLogs.unshift({
          id: entryId,
          date: this.newEntradaDate || this.todayStr(),
          time: new Date().toTimeString().slice(0, 5),
          type: 'IN',
          category: this.newEntradaType || 'Entrada Geral',
          description: desc + (client ? ' (' + client.name + ')' : ''),
          amount: val,
          paymentMethod: this.newEntradaMethod || 'Dinheiro',
          responsible: this.currentUser ? this.currentUser.nome : 'Sistema',
          referenceId: entryId,
          observation: this.newEntradaObs || ''
        });
  
        this.logAudit('ENTRADA DE CAIXA', desc + ' (' + (this.newEntradaMethod || 'Dinheiro') + ')', val);
        this.persistFarm();
        this.showModalEntrada = false;
        this.newEntradaAmount = '';
        this.newEntradaDesc = '';
        this.toast('Entrada de ' + this.fmtMT(val) + ' registada com sucesso!');
      },
  fmtMT: function(val) {
        var n = Number(val) || 0;
        return n.toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (this.settings ? (this.settings.currency || 'MT') : 'MT');
      },
  fmtNum: function(val) {
        var n = Number(val) || 0;
        return n.toLocaleString('pt-MZ');
      },
  toast: function(msg, type) {
        if (this.voiceEnabled && msg) this.speak(String(msg));
        var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        if (!this.toasts) this.toasts = [];
        this.toasts.push({ id: id, msg: msg, type: type || 'success' });
        setTimeout(function() {
          if (this.toasts) this.toasts = this.toasts.filter(function(t) { return t.id !== id; });
        }.bind(this), 3500);
      },
  confirm: function(msg, onConfirm) {
        if (!this.confirmDialog) this.confirmDialog = { show: false, message: '', callback: null };
        this.confirmDialog.message = msg;
        this.confirmDialog.callback = onConfirm;
        this.confirmDialog.show = true;
      },
  doConfirm: function() {
        if (this.confirmDialog && this.confirmDialog.callback) {
          this.confirmDialog.callback();
        }
        if (this.confirmDialog) this.confirmDialog.show = false;
      },
  saveModalSaida: function() {
        if (!this._isAdminRole || !this._isAdminRole()) { this.toast('O acesso ao Livro de Caixa é reservado ao administrador.', 'error'); return; }
        var val = parseFloat(this.newSaidaAmount) || 0;
        if (val <= 0) {
          this.toast('Indique um valor válido para a saída de caixa.', 'error');
          return;
        }
        
        var desc = (this.newSaidaDesc || '').trim() || ('Despesa com ' + (this.newSaidaCategory || 'Geral'));
        var expEntry = {
          id: 'exp_' + Date.now().toString(36),
          loteId: '',
          loteCode: 'Geral',
          category: this.newSaidaCategory || 'Outros',
          desc: desc,
          amount: val,
          paymentMethod: this.newSaidaMethod || 'Dinheiro',
          status: this.newSaidaStatus || 'Pago',
          date: this.newSaidaDate || new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0, 5),
          responsible: this.currentUser ? this.currentUser.nome : 'Sistema'
        };
  
        if (this.newSaidaCategory === 'Ração' && this.newSaidaBagsQty && this.newSaidaStockItemId) {
          var stk = (this.stockItems || []).find(function(s) { return s.id === this.newSaidaStockItemId; }.bind(this));
          if (stk) {
            var bags = Number(this.newSaidaBagsQty) || 0;
            if (bags > Number(stk.qty || 0)) {
              this.toast('Stock insuficiente para esta saída.', 'error');
              return;
            }
            stk.qty = Number(stk.qty || 0) - bags;
            expEntry.bagsQty = Number(this.newSaidaBagsQty) || 0;
            expEntry.stockItemId = this.newSaidaStockItemId;
          }
        }
  
        if (!this.expenses) this.expenses = [];
        this.expenses.unshift(expEntry);
        this.cashLogs.unshift({
          id: 'csh_' + Date.now().toString(36),
          date: expEntry.date,
          time: expEntry.time,
          type: 'OUT',
          category: expEntry.category,
          description: desc,
          amount: val,
          paymentMethod: expEntry.paymentMethod,
          responsible: expEntry.responsible,
          referenceId: expEntry.id
        });
  
        this.logAudit('SAÍDA DE CAIXA', desc + ' (' + (this.newSaidaMethod || 'Dinheiro') + ')', val);
        this.persistFarm();
        this.showModalSaida = false;
        this.newSaidaAmount = '';
        this.newSaidaDesc = '';
        this.toast('Despesa de ' + this.fmtMT(val) + ' registada com sucesso!');
      },
  saveModalPagamento: function() {
        var val = parseFloat(this.newPayAmount) || 0;
        if (val <= 0) {
          this.toast('Indique um valor válido de pagamento.', 'error');
          return;
        }
        var client = (this.clients || []).find(function(c) { return c.id === this.newPayClientId; }.bind(this));
        if (!client) {
          this.toast('Selecione o cliente devedor.', 'error');
          return;
        }
        if (Number(client.debt || 0) <= 0) {
          this.toast('Este cliente não tem dívida pendente.', 'error');
          return;
        }
        val = Math.min(val, Number(client.debt || 0));

        var remainingToAllocate = val;
        var allocations = [];
        var outstandingSales = (this.sales || []).filter(function(sale) {
          return sale.clientId === client.id && Number(sale.debtAmount) > 0;
        }).slice().sort(function(a, b) {
          return String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || ''));
        });
        outstandingSales.forEach(function(sale) {
          if (remainingToAllocate <= 0) return;
          var saleDebt = this.getSalePaymentSummary
            ? this.getSalePaymentSummary(sale).debtAmount
            : Number(sale.debtAmount) || 0;
          var allocated = Math.min(remainingToAllocate, saleDebt);
          if (allocated > 0) {
            allocations.push({ saleId: sale.id, amount: allocated });
            remainingToAllocate -= allocated;
          }
        }, this);
        
        client.totalPaid = (client.totalPaid || 0) + val;
        client.debt = Math.max(0, (client.debt || 0) - val);
        
        var paymentId = 'pay_' + Date.now().toString(36);
        var receipt = {
          id: paymentId,
          farmId: this.currentFarmId || 'farm_principal',
          clientId: client.id,
          clientName: client.name,
          date: this.newPayDate || this.todayStr(),
          time: new Date().toTimeString().slice(0, 5),
          amount: val,
          allocations: allocations,
          paymentMethod: this.newPayMethod || 'M-Pesa',
          status: 'paid',
          responsible: this.currentUser ? this.currentUser.nome : 'Sistema',
          createdByUid: this.currentUser ? this.currentUser._authUid || this.currentUser.uid || '' : '',
          observation: this.newPayNotes || ''
        };
        if (!Array.isArray(this.receipts)) this.receipts = [];
        this.receipts.unshift(receipt);
        if (this._queueCloudMutation) this._queueCloudMutation(this.currentFarmId, 'receipts', receipt);
  
        this.logAudit('AMORTIZAÇÃO DE DÍVIDA', 'Pagamento recebido de ' + client.name + ' via ' + receipt.paymentMethod, val);
        this.persistFarm();
        this.showModalPagamento = false;
        this.newPayAmount = '';
        this.toast('Pagamento de ' + this.fmtMT(val) + ' de ' + client.name + ' registado com sucesso!');
      },
};
