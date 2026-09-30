import "../services/firebase.js";
import * as SafeStorage from "../services/storage.js";
// Métodos: core
export const methods = {
      // INICIALIZAÇÃO & PERSISTÊNCIA LOCAL + NUVEM
      initFirebaseAuth: function() {
        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        if (!auth) {
          this._firebaseAuthReadyResolved = true;
          return;
        }
        var self = this;
        if (this._authObserver) return;
        this._firebaseAuthReadyResolved = false;
        this._firebaseAuthUser = null;
        this._firebaseAuthReadyPromise = new Promise(function(resolve) {
          self._resolveFirebaseAuthReady = resolve;
        });
        this._authObserver = auth.onAuthStateChanged(function(user) {
          // O primeiro callback confirma que o Firebase terminou a restauração
          // da sessão persistida. A sincronização só avança depois deste ponto.
          if (!self._firebaseAuthReadyResolved) {
            self._firebaseAuthReadyResolved = true;
            if (self._resolveFirebaseAuthReady) self._resolveFirebaseAuthReady(user || null);
          }
          self._firebaseAuthUser = user || null;
          if (!user) {
            if (navigator.onLine && !self._intentionalLogout && self.currentUser && self._localSessionProvisional) {
              self.currentUser = null;
              self.currentFarmId = null;
              SafeStorage.removeItem('aviario_sess');
              self.loginError = 'A sessão na nuvem terminou. Entre novamente para continuar.';
            }
            return;
          }
          self._localSessionProvisional = false;
          self._loadCloudUserProfile(user).catch(function(err) {
            self.cloudStatus = navigator.onLine ? 'error' : 'offline';
            self.cloudLastSyncError = self._friendlyCloudError(err);
          });
        }, function(err) {
          if (!self._firebaseAuthReadyResolved) {
            self._firebaseAuthReadyResolved = true;
            if (self._resolveFirebaseAuthReady) self._resolveFirebaseAuthReady(null);
          }
          self.cloudStatus = navigator.onLine ? 'error' : 'offline';
          self.cloudLastSyncError = self._friendlyCloudError(err);
        });
      },
      _awaitFirebaseAuthReady: async function(timeoutMs) {
        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        if (!auth) return null;
        if (auth.currentUser) return auth.currentUser;
        if (!this._firebaseAuthReadyPromise) this.initFirebaseAuth();
        var promise = this._firebaseAuthReadyPromise;
        if (!promise) return auth.currentUser || null;
        var timeout = Number(timeoutMs) || 5000;
        var timer;
        var timeoutPromise = new Promise(function(resolve) {
          timer = setTimeout(function() { resolve(null); }, timeout);
        });
        var resolved = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timer);
        return (window.getFirebaseAuth ? window.getFirebaseAuth().currentUser : null) || resolved || null;
      },
  _cloudPasswordForSecret: function(secret, type) {
        var v = String(secret || '');
        return type === 'pin' ? ('Aviario#PIN#' + v) : v;
      },
  // Aplica um snapshot da exploração ao estado reactivo da aplicação.
      // Mantém apenas campos conhecidos e conserva o estado quando um snapshot está incompleto.
      _applyFarmData: function(data, farmId) {
        data = data || {};
        if (farmId) this.currentFarmId = farmId;
        if (data.settings && typeof data.settings === 'object') {
          this.settings = Object.assign({}, this.settings, data.settings);
        }
        if (typeof this._applyCompanyBranding === 'function') this._applyCompanyBranding();
        var arrays = ['lotes','mortalityLogs','weightLogs','feedLogs','clients','energyLogs','staff','attendance','stockItems','notifications','suppliers','priceTable','healthLogs','auditLogs'];
        arrays.forEach(function(key) {
          if (Array.isArray(data[key])) this[key] = data[key];
        }, this);
        if (data.selectedLoteId) this.selectedLoteId = data.selectedLoteId;
        if (data.selectedDate) this.selectedDate = data.selectedDate;
        this._farmDataLoadedAt = Date.now();
        var remoteUpdated = Date.parse(data.updatedAt || '') || 0;
        if (remoteUpdated && (!this._localDataUpdatedAt || remoteUpdated >= this._localDataUpdatedAt)) this._localDataUpdatedAt = remoteUpdated;
        return true;
      },
  init: function() {
        var self = this;
        // Nunca deixar a aplicação ficar numa rota inválida/antiga e apresentar apenas uma área vazia.
        if (!this.view || (typeof this.view !== 'string')) this.view = 'dashboard';
        if (typeof this.canAccessView === 'function' && !this.canAccessView(this.view)) this.view = 'dashboard';
        if (window.location.protocol === 'file:') {
          var warn = document.getElementById('file-protocol-warning');
          if (warn) warn.hidden = false;
          this.loginError = 'Abra a aplicação pelo servidor local (iniciar-aviario.bat).';
          return;
        }
        this.cloudStatus = navigator.onLine ? 'connecting' : 'offline';
        this.cloudLastSyncAt = 0;
        this.cloudLastSyncError = '';
        this.syncBusy = false;
        this.selectedDate = this.todayStr();
        this.newMortDate = this.todayStr();
        this.newFeedDate = this.todayStr();
        this.newSaleDate = this.todayStr();
        this.newExpDate = this.todayStr();
        this.newEnergyDate = this.todayStr();
  
        var theme = SafeStorage.getItem('aviario_theme');
        if (theme) this.darkMode = (theme === 'dark');
        if (typeof this.applyTheme === 'function') this.applyTheme();
        var voice = SafeStorage.getItem('aviario_voice');
        if (voice) this.voiceEnabled = (voice === 'on');
        var voiceGender = SafeStorage.getItem('aviario_voice_gender');
        if (voiceGender) this.voiceGender = voiceGender === 'masculina' ? 'masculina' : 'feminina';
        var lang = SafeStorage.getItem('aviario_lang');
        if (lang) this.currentLang = lang;
  
        // Firebase é inicializado sob demanda; o modo local abre sem esperar pela nuvem.
        // Recupera sessão local somente offline; online o Firebase é a fonte de verdade.
        var sess = SafeStorage.getItem('aviario_sess');
        if (!navigator.onLine && sess) {
          try {
            var s = JSON.parse(sess);
            if (s && s.user && s.farmId) {
              this.currentUser = this._normalizeUserProfile(s.user);
              this.currentFarmId = s.farmId;
              this._localSessionProvisional = true;
              if (typeof this._loadOutbox === 'function') this._loadOutbox(s.farmId);
              var localCache = SafeStorage.getItem('aviario_cache_' + s.farmId);
              if (localCache) this._applyFarmData(JSON.parse(localCache), s.farmId);
              if (typeof this._loadSecureCacheLocal === 'function') this._loadSecureCacheLocal(s.farmId);
            }
          } catch(e) {}
        }


        // Restaura a sessão Firebase rapidamente e mantém a conta ligada à nuvem em segundo plano.
        try { this.initFirebaseAuth(); } catch(e) {}

        // Produção real: não criar dados de demonstração no arranque.
        window.addEventListener('online', function(){
          self.cloudStatus = 'connecting';
          if (self.currentUser && self.currentFarmId) {
            if (typeof self._flushCloudOutbox === 'function') self._flushCloudOutbox(self.currentFarmId).catch(function(){});
            self.listenFarm(self.currentFarmId);
            setTimeout(function(){ self.syncNow({silent:true, automatic:true}).catch(function(){}); }, 700);
          }
        });
        window.addEventListener('offline', function(){ self.cloudStatus = 'offline'; });
        document.addEventListener('visibilitychange', function(){
          if (document.visibilityState === 'visible' && self.currentUser && self.currentFarmId && navigator.onLine) {
            setTimeout(function(){ self.syncNow({silent:true, automatic:true}).catch(function(){}); }, 350);
          }
        });
        // Confirmação automática periódica: não exige clique e não gera notificações repetitivas.
        this._autoSyncTimer = setInterval(function(){
          if (self.currentUser && self.currentFarmId && navigator.onLine && !self.syncBusy) {
            self.syncNow({silent:true, automatic:true}).catch(function(){});
          }
        }, 30000);

        setTimeout(function(){
          if (self.currentUser && self.currentFarmId) {
            try { self.runAiDiagnostics(); } catch(e) {}
          }
        }, 2500);
      },
      // MOTOR DE CÁLCULO ZOOTÉCNICO, FINANCEIRO & KPIS
      todayStr: function() {
        return new Date().toISOString().slice(0, 10);
      },
  getActiveLote: function() {
        if (!this.lotes || this.lotes.length === 0) return null;
        if (this.selectedLoteId) {
          var found = this.lotes.find(l => l.id === this.selectedLoteId);
          if (found) return found;
        }
        return this.lotes.find(l => l.status === 'active') || this.lotes[0];
      },
  getLotesSummary: function() {
        var activeLotes = this.lotes.filter(function(l) { return l.status === 'active'; });
        var totalBirds = activeLotes.reduce(function(acc, l) {
          var d = this.getLoteMortality(l.id);
          var s = this.getLoteSoldBirds(l.id);
          return acc + Math.max(0, (l.initialBirds || 0) - d - s);
        }.bind(this), 0);
  
        var totalInitial = activeLotes.reduce(function(acc, l) { return acc + (l.initialBirds || 0); }, 0);
        var totalDeaths = activeLotes.reduce(function(acc, l) { return acc + this.getLoteMortality(l.id); }.bind(this), 0);
        var mortalityRate = totalInitial > 0 ? ((totalDeaths / totalInitial) * 100).toFixed(1) : '0.0';
  
        var totalSold = this.sales.reduce(function(acc, s) { return acc + (parseInt(s.qty) || 0); }, 0);
        var totalFeed = this.feedLogs.filter(function(f) { return f.movement === 'CONSUMO'; })
          .reduce(function(acc, f) { return acc + (parseFloat(f.qtyKg) || 0); }, 0);
  
        var sumWeights = activeLotes.reduce(function(acc, l) { return acc + (parseFloat(l.avgWeight) || 0); }, 0);
        var avgWeight = activeLotes.length > 0 ? (sumWeights / activeLotes.length).toFixed(2) : '0.00';
  
        return {
          totalBirds: totalBirds,
          mortalityRate: mortalityRate,
          avgWeight: avgWeight,
          totalFeedKg: totalFeed,
          totalSold: totalSold,
          activeLotesCount: activeLotes.length
        };
      },
  getLoteAgeDays: function(lote) {
        if (!lote || !lote.entryDate) return 0;
        var start = new Date(lote.entryDate + 'T00:00:00');
        var today = new Date();
        start.setHours(0,0,0,0); today.setHours(0,0,0,0);
        var elapsed = Math.floor((today - start) / 86400000);
        return Math.max(0, elapsed + (Number(lote.initialAge) || 0));
      },
  getLoteMortality: function(loteId) {
        if (!this.mortalityLogs) return 0;
        return this.mortalityLogs
          .filter(m => !loteId || m.loteId === loteId)
          .reduce((sum, m) => sum + (Number(m.qty) || 0), 0);
      },
  getLoteSoldBirds: function(loteId) {
        if (!this.sales) return 0;
        return this.sales
          .filter(s => !loteId || s.loteId === loteId)
          .reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
      },
  getLoteRemainingBirds: function(lote) {
        if (!lote) return 0;
        var init = Number(lote.initialBirds) || 0;
        var deaths = this.getLoteMortality(lote.id);
        var sold = this.getLoteSoldBirds(lote.id);
        return Math.max(0, init - deaths - sold);
      },
  getLoteFeedConsumedKg: function(loteId) {
        if (!this.feedLogs) return 0;
        return this.feedLogs
          .filter(f => (!loteId || f.loteId === loteId) && f.movement === 'CONSUMO')
          .reduce((sum, f) => sum + (Number(f.qtyKg) || 0), 0);
      },
  getLoteFCR: function(loteId) {
        var targetLote = this.lotes.find(l => l.id === loteId);
        if (!targetLote) return '—';
        var feedKg = this.getLoteFeedConsumedKg(loteId);
        var remaining = this.getLoteRemainingBirds(targetLote);
        var sold = this.getLoteSoldBirds(loteId);
        var avgW = Number(targetLote.avgWeight) || 0;
        
        // Peso total de carne produzida (vivos atuais + vendidos)
        var totalMeatKg = (remaining * avgW) + (sold * avgW);
        if (totalMeatKg <= 0 || feedKg <= 0) return '—';
        return (feedKg / totalMeatKg).toFixed(2);
      },
  getSummaryKPIs: function() {
        var lote = this.getActiveLote();
        var initial = lote ? Number(lote.initialBirds) || 0 : 0;
        var remaining = lote ? this.getLoteRemainingBirds(lote) : 0;
        var deaths = lote ? this.getLoteMortality(lote.id) : this.getLoteMortality();
        var sold = lote ? this.getLoteSoldBirds(lote.id) : this.getLoteSoldBirds();
        var mortRate = initial > 0 ? ((deaths / initial) * 100).toFixed(1) : '0.0';
  
        var totalFeedKg = lote ? this.getLoteFeedConsumedKg(lote.id) : this.getLoteFeedConsumedKg();
        var fcr = lote ? this.getLoteFCR(lote.id) : '—';
  
        // Finanças
        var totalRevenue = (this.sales || []).reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
        var totalPaidRevenue = (this.sales || []).reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0);
        var accountsReceivable = (this.clients || []).reduce((sum, c) => sum + (Number(c.debt) || 0), 0);
  
        var expensesCost = (this.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        var chicksCost = (this.lotes || []).reduce((sum, l) => sum + (Number(l.costChicks) || 0), 0);
        var feedPurchasedCost = (this.feedLogs || []).filter(f => f.movement === 'COMPRA').reduce((sum, f) => sum + ((Number(f.qtyKg)/50) * (Number(f.priceBag)||0)), 0);
        var totalExpenses = expensesCost + chicksCost + feedPurchasedCost;
  
        // Saldo Real em Caixa
        var cashIn = (this.cashLogs || []).filter(c => c.type === 'IN').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        var cashOut = (this.cashLogs || []).filter(c => c.type === 'OUT').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        var cashBalance = cashIn - cashOut;
  
        // Lucro Líquido
        var netProfit = totalRevenue - totalExpenses;
  
        // Ração disponível em sacos de 50kg
        var availableFeedSacks = (this.stockItems || [])
          .filter(s => s.category.toLowerCase().indexOf('ração') !== -1 || s.category.toLowerCase().indexOf('feed') !== -1)
          .reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
  
        // Vendas do dia
        var todaySales = (this.sales || []).filter(s => s.date === this.todayStr());
        var todaySalesRevenue = todaySales.reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0);
        var todaySalesBirds = todaySales.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
  
        return {
          initialBirds: initial,
          remainingBirds: remaining,
          deaths: deaths,
          soldBirds: sold,
          mortalityRate: mortRate,
          totalFeedKg: totalFeedKg,
          availableFeedSacks: availableFeedSacks,
          fcr: fcr,
          totalRevenue: totalRevenue,
          totalExpenses: totalExpenses,
          cashBalance: cashBalance,
          accountsReceivable: accountsReceivable,
          netProfit: netProfit,
          todaySalesRevenue: todaySalesRevenue,
          todaySalesBirds: todaySalesBirds
        };
      },
  getHealthBadge: function(mortalityRate) {
        var r = parseFloat(mortalityRate);
        var max = this.settings.maxMortalityPercent || 3.0;
        if (r < max * 0.8) return { label: ' Excelente (Saudável)', class: 'badge-normal' };
        if (r <= max) return { label: ' Atenção (No Limite)', class: 'badge-warning' };
        return { label: ' Crítico (Mortalidade Alta)', class: 'badge-critical' };
      },
      // MOTOR DE INTELIGÊNCIA ARTIFICIAL & DIAGNÓSTICOS EM TEMPO REAL
      runAiDiagnostics: function() {
        if (this._diagnosticRunning) return;
        this._diagnosticRunning = true;
        var notes = [];
        var kpis = this.getSummaryKPIs();
        var lote = this.getActiveLote();
  
        // 1. Diagnóstico de Mortalidade
        if (lote) {
          var mort = parseFloat(kpis.mortalityRate);
          var maxM = this.settings.maxMortalityPercent || 3.0;
          if (mort > maxM) {
            notes.push({
              id: 'diag_mort',
              type: 'critical',
              title: 'Mortalidade Acima do Limite',
              message: 'A mortalidade do ' + lote.code + ' atingiu ' + mort + '%, superando o teto definido de ' + maxM + '%. Verifique ventilação, qualidade da cama e temperatura.'
            });
          } else {
            notes.push({
              id: 'diag_prod',
              type: 'success',
              title: 'Produção Dentro do Esperado',
              message: 'O lote ' + lote.code + ' apresenta taxa de mortalidade controlada de ' + mort + '% (limite: ' + maxM + '%).'
            });
          }
        }
  
        // 2. Diagnóstico de Stock de Ração
        (this.stockItems || []).forEach(item => {
          if (item.category.toLowerCase().indexOf('ração') !== -1 || item.category.toLowerCase().indexOf('feed') !== -1) {
            if (Number(item.qty) <= Number(item.minStock)) {
              notes.push({
                id: 'diag_stock_' + item.id,
                targetView: 'stock',
                type: 'warning',
                title: 'Stock Baixo de ' + item.name,
                message: item.name + ' tem apenas ' + item.qty + ' ' + (item.unit||'sacos') + ' restantes (mínimo de segurança: ' + item.minStock + '). Faça a encomenda de reposição.'
              });
            }
          }
        });
  
        // 3. Diagnóstico de Conversão Alimentar FCR
        if (lote) {
          var fcrVal = parseFloat(kpis.fcr);
          if (fcrVal > 1.85) {
            notes.push({
              id: 'diag_fcr',
              targetView: 'racao',
              type: 'warning',
              title: 'Conversão Alimentar Elevada',
              message: 'FCR calculado em ' + fcrVal + '. As aves estão consumindo mais ração por kg de peso produzido do que o padrão ideal (<1.65).'
            });
          }
        }
  
        // 4. Diagnóstico de Contas a Receber / Dívidas de Clientes
        var devedores = (this.clients || []).filter(c => Number(c.debt) > 0);
        if (devedores.length > 0) {
          var totalDebt = devedores.reduce((sum, c) => sum + Number(c.debt), 0);
          notes.push({
            id: 'diag_debt',
            targetView: 'clientes',
            type: 'info',
            title: 'Valores a Receber Pendentes',
            message: 'Existem ' + devedores.length + ' cliente(s) com dívidas pendentes totalizando ' + this.fmtMT(totalDebt) + '.'
          });
        }
  
        this.notifications = notes;
        this._diagnosticRunning = false;
      },
      openNotification: function(notification) {
        if (!notification) return;
        this.showNotificationsModal = false;
        var target = notification.targetView || 'dashboard';
        if (!this.canAccessView(target)) target = 'dashboard';
        this.goTo(target, notification.targetSubTab || null);
      },
      // NAVEGAÇÃO & CONTROLO MOBILE
      goTo: function(targetView, subTab) {
        var target = String(targetView || 'dashboard');
        if (!this.currentUser) return;
        if (!this.canAccessView(target)) {
          this.toast('Esta área não está disponível para o seu perfil.', 'error');
          target = 'dashboard';
        }
        this.view = target;
        this.mobileMenuOpen = false;
        if (this.voiceEnabled) { var labels = {dashboard:'Painel Geral',controlo:'Controlo do Dia',lotes:'Lotes de Frangos',racao:'Ração e Alimentação',vendas:'Vendas de Frangos',financas:'Caixa e Finanças',clientes:'Clientes e Dívidas',equipa:'Presença e Equipa',despesas:'Energia e Despesas',stock:'Inventário e Stock',planilha:'Planilha Inteligente',relatorios:'Relatórios',configuracoes:'Definições'}; this.speak('Abriu ' + (labels[target] || target) + '.'); } // Fecha automaticamente a gaveta no mobile
        if (subTab) {
          if (target === 'lotes') this.subTabLotes = subTab;
          if (target === 'racao') this.subTabRacao = subTab;
          if (target === 'vendas') this.subTabVendas = subTab;
          if (target === 'financas') this.subTabFinancas = subTab;
          if (target === 'clientes') this.subTabClientes = subTab;
          if (target === 'equipa') this.subTabEquipa = subTab;
          if (target === 'despesas') this.subTabDespesas = subTab;
          if (target === 'stock') this.subTabStock = subTab;
          if (target === 'planilha') this.subTabPlanilha = subTab;
          if (target === 'relatorios') this.subTabRelatorios = subTab;
          if (target === 'configuracoes') this.subTabConfiguracoes = subTab;
        }
        if (this._diagnosticTimer) clearTimeout(this._diagnosticTimer);
        var self = this;
        this._diagnosticTimer = setTimeout(function(){ try { self.runAiDiagnostics(); } catch(e) {} }, 100);
        window.scrollTo(0, 0);
      },
};
