import "../services/firebase.js";
import * as SafeStorage from "../services/storage.js";

// Persistência local + Firebase com separação entre operação e finanças.
export const methods = {
  getDb: function() {
    if (this.db) return this.db;
    if (typeof window.initFirebaseApp === 'function') this.db = window.initFirebaseApp();
    return this.db;
  },

  _outboxKey: function(farmId) {
    return 'aviario_outbox_' + String(farmId || 'farm_principal');
  },

  _secureCacheKey: function(farmId) {
    return 'aviario_secure_cache_' + String(farmId || 'farm_principal');
  },

  _loadSecureCacheLocal: function(farmId) {
    try {
      var raw = SafeStorage.getItem(this._secureCacheKey(farmId));
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.staff)) this.staff = data.staff;
      if (Array.isArray(data.sales)) this.sales = data.sales;
      if (Array.isArray(data.receipts)) this.receipts = data.receipts;
      if (this._isAdminRole()) {
        if (Array.isArray(data.expenses)) this.expenses = data.expenses;
        if (Array.isArray(data.cashEntries)) this.cashLogs = data.cashEntries;
        if (Array.isArray(data.financialAudits)) this.financialAudits = data.financialAudits;
      }
    } catch (e) {}
  },

  _cacheSecureCollectionsLocal: function(farmId) {
    try {
      SafeStorage.setItem(this._secureCacheKey(farmId), JSON.stringify({
        staff: this.staff || [],
        sales: this.sales || [],
        receipts: this.receipts || [],
        expenses: this._isAdminRole() ? (this.expenses || []) : [],
        cashEntries: this._isAdminRole() ? (this.cashLogs || []) : [],
        financialAudits: this._isAdminRole() ? (this.financialAudits || []) : []
      }));
    } catch (e) {}
  },

  _loadOutbox: function(farmId) {
    try {
      var raw = SafeStorage.getItem(this._outboxKey(farmId));
      var rows = raw ? JSON.parse(raw) : [];
      this._cloudOutbox = Array.isArray(rows) ? rows : [];
    } catch (e) {
      this._cloudOutbox = [];
    }
    return this._cloudOutbox;
  },

  _saveOutbox: function(farmId) {
    try { SafeStorage.setItem(this._outboxKey(farmId), JSON.stringify(this._cloudOutbox || [])); } catch (e) {}
  },

  _queueFarmRootSnapshot: function(farmId, payload) {
    if (!farmId || !payload) return;
    this._loadOutbox(farmId);
    var existing = this._cloudOutbox.find(function(op) { return op && op.collection === '__farm_root__' && op.id === 'root'; });
    var operation = {
      id: 'root',
      collection: '__farm_root__',
      data: Object.assign({}, payload, { farmId: farmId }),
      queuedAt: Date.now()
    };
    if (existing) Object.assign(existing, operation);
    else this._cloudOutbox.push(operation);
    this._saveOutbox(farmId);
    this._flushCloudOutbox(farmId).catch(function(){});
  },

  _queueCloudMutation: function(farmId, collectionName, item) {
    if (!farmId || !collectionName || !item || !item.id) return;
    this._loadOutbox(farmId);
    var id = String(item.id);
    var existing = this._cloudOutbox.find(function(op) {
      return op && op.collection === collectionName && op.id === id;
    });
    var operation = {
      id: id,
      collection: collectionName,
      data: Object.assign({}, item, { farmId: farmId }),
      queuedAt: Date.now()
    };
    if (existing) Object.assign(existing, operation);
    else this._cloudOutbox.push(operation);
    this._saveOutbox(farmId);
    this._flushCloudOutbox(farmId).catch(function(){});
  },

  _flushCloudOutbox: async function(farmId) {
    if (this._cloudOutboxBusy || !farmId || !navigator.onLine) return false;
    this._cloudOutboxBusy = true;
    try {
      var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
      if (auth && !auth.currentUser) {
        await this._awaitFirebaseAuthReady(7000);
        auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
      }
      if (auth && !auth.currentUser) return false;
      var db = this.getDb();
      if (!db) return false;
      this._loadOutbox(farmId);
      var pending = this._cloudOutbox.slice();
      for (var i = 0; i < pending.length; i++) {
        var op = pending[i];
        if (!op || !op.collection || !op.data) continue;
        if (op.collection === '__farm_root__') {
          await db.collection('farms').doc(farmId).set(op.data, { merge: true });
        } else {
          if (!op.id) continue;
          await db.collection('farms').doc(farmId).collection(op.collection).doc(String(op.id)).set(op.data, { merge: true });
        }
        this._cloudOutbox = this._cloudOutbox.filter(function(x) {
          return !(x.collection === op.collection && String(x.id || '') === String(op.id || '') && Number(x.queuedAt || 0) === Number(op.queuedAt || 0));
        });
        this._saveOutbox(farmId);
      }
      return true;
    } finally {
      this._cloudOutboxBusy = false;
    }
  },

  _isAdminRole: function() {
    var role = this.currentUser && (this.currentUser.roleType || this.currentUser.role);
    return role === 'admin' || role === 'super_admin';
  },

  _buildFarmPayload: function() {
    var stamp = Number(this._localDataUpdatedAt) || Date.now();
    var settings = Object.assign({}, this.settings || {});
    return {
      updatedAt: new Date(stamp).toISOString(),
      settings: settings,
      lotes: this.lotes,
      mortalityLogs: this.mortalityLogs,
      weightLogs: this.weightLogs,
      feedLogs: this.feedLogs,
      clients: this.clients,
      energyLogs: this.energyLogs,
      attendance: this.attendance,
      stockItems: this.stockItems,
      suppliers: this.suppliers,
      priceTable: this.priceTable,
      healthLogs: this.healthLogs || [],
      notifications: this.notifications || []
    };
  },

  _buildSensitiveCollections: function() {
    return {
      sales: Array.isArray(this.sales) ? this.sales : [],
      receipts: Array.isArray(this.receipts) ? this.receipts : [],
      expenses: Array.isArray(this.expenses) ? this.expenses : [],
      cashEntries: Array.isArray(this.cashLogs) ? this.cashLogs : [],
      financialAudits: Array.isArray(this.financialAudits) ? this.financialAudits : []
    };
  },

  _cacheFarmPayload: function(farmId, payload) {
    try {
      SafeStorage.setItem('aviario_cache_' + farmId, JSON.stringify(payload));
      this._cacheSecureCollectionsLocal(farmId);
      if (this.currentUser) SafeStorage.setItem('aviario_sess', JSON.stringify({ user: this.currentUser, farmId: farmId, credentialHash: this.currentUser._credentialHash || '' }));
      return JSON.parse(JSON.stringify(payload));
    } catch (e) { return null; }
  },

  _writeFarmCloud: function(farmId, payload) {
    var self = this, db = this.getDb();
    if (!db || !farmId || !payload) return Promise.reject(Object.assign(new Error('CLOUD_UNAVAILABLE'), { code: 'cloud/unavailable' }));
    return db.collection('farms').doc(farmId).set(payload, { merge: true }).then(function() {
      self._isCloudSynced = true;
      self.cloudStatus = 'synced';
      self.cloudLastSyncAt = Date.now();
      self.cloudLastSyncError = '';
      return true;
    }).catch(function(err) {
      self._isCloudSynced = false;
      self.cloudStatus = navigator.onLine ? 'error' : 'offline';
      self.cloudLastSyncError = self._friendlyCloudError(err);
      throw err;
    });
  },

  _syncSubcollection: async function(farmId, name, items, allowWrite, reconcileDeletes) {
    if (!allowWrite) return;
    var db = this.getDb();
    if (!db) throw Object.assign(new Error('CLOUD_UNAVAILABLE'), { code: 'cloud/unavailable' });
    var col = db.collection('farms').doc(farmId).collection(name);
    var safeItems = Array.isArray(items) ? items.filter(function(x) { return x && x.id; }) : [];
    await Promise.all(safeItems.map(function(item) { return col.doc(String(item.id)).set(Object.assign({}, item, { farmId: farmId }), { merge: true }); }));
    if (reconcileDeletes) {
      var snap = await col.get();
      var ids = new Set(safeItems.map(function(item) { return String(item.id); }));
      await Promise.all((snap.docs || []).filter(function(d) { return !ids.has(d.id); }).map(function(d) { return d.ref && d.ref.delete ? d.ref.delete() : col.doc(d.id).delete(); }));
    }
  },

  _loadSubcollection: async function(farmId, name) {
    var db = this.getDb();
    if (!db) return [];
    var snap = await db.collection('farms').doc(farmId).collection(name).get();
    return (snap.docs || []).map(function(d) { return Object.assign({ id: d.id }, d.data() || {}); });
  },

  _loadSecureCollections: async function(farmId, cloudRoot) {
    var self = this;
    var staffRows = [];
    try { staffRows = await this._loadSubcollection(farmId, 'staff'); } catch (e) {}
    if (!staffRows.length && cloudRoot && Array.isArray(cloudRoot.staff)) staffRows = cloudRoot.staff;
    this.staff = staffRows;
    var sales = [];
    try { sales = await this._loadSubcollection(farmId, 'sales'); } catch (e) { sales = []; }
    if (!sales.length && cloudRoot && Array.isArray(cloudRoot.sales)) sales = cloudRoot.sales;
    this.sales = sales;
    var receipts = [];
    try { receipts = await this._loadSubcollection(farmId, 'receipts'); } catch (e) { receipts = []; }
    if (!receipts.length && this._cloudOutbox) receipts = (this._cloudOutbox || []).filter(function(op){ return op.collection === 'receipts'; }).map(function(op){ return op.data; });
    this.receipts = receipts;

    // Somente administradores consultam dados financeiros sensíveis.
    if (this._isAdminRole()) {
      var expenses = [], cashEntries = [], audits = [];
      try { expenses = await this._loadSubcollection(farmId, 'expenses'); } catch (e) {}
      try { cashEntries = await this._loadSubcollection(farmId, 'cashEntries'); } catch (e) {}
      try { audits = await this._loadSubcollection(farmId, 'financialAudits'); } catch (e) {}
      if (!expenses.length && cloudRoot && Array.isArray(cloudRoot.expenses)) expenses = cloudRoot.expenses;
      if (!cashEntries.length && cloudRoot && Array.isArray(cloudRoot.cashLogs)) cashEntries = cloudRoot.cashLogs;
      if (!audits.length && cloudRoot && Array.isArray(cloudRoot.financialAudits)) audits = cloudRoot.financialAudits;
      this.expenses = expenses;
      this.cashLogs = cashEntries;
      this.financialAudits = audits;
    } else {
      this.expenses = [];
      this.cashLogs = [];
      this.financialAudits = [];
    }
  },

  _syncSecureCollections: async function(farmId) {
    // O outbox é a fonte das mutações operacionais feitas offline/online.
    // Funcionários/vendedores nunca fazem reconciliação total de vendas,
    // evitando que uma venda existente seja interpretada como update proibido.
    await this._flushCloudOutbox(farmId);

    // Administradores podem reconciliar as coleções financeiras completas.
    if (this._isAdminRole()) {
      var staffRows = (Array.isArray(this.staff) ? this.staff : []).filter(function(item) {
        var uid = String(item && (item._authUid || item.uid || item.id || '') || '');
        return uid && uid.indexOf('local_') !== 0 && uid.indexOf('usr_local_') !== 0;
      });
      await this._syncSubcollection(farmId, 'staff', staffRows, true, false);
      var sensitive = this._buildSensitiveCollections();
      await this._syncSubcollection(farmId, 'sales', sensitive.sales, true, false);
      await this._syncSubcollection(farmId, 'receipts', sensitive.receipts, true, false);
      await this._syncSubcollection(farmId, 'cashEntries', sensitive.cashEntries, true, false);
      await this._syncSubcollection(farmId, 'expenses', sensitive.expenses, true, false);
      await this._syncSubcollection(farmId, 'financialAudits', sensitive.financialAudits, true, false);
    }
  },

  persistFarm: function() {
    var self = this;
    var farmId = this.currentFarmId || 'farm_principal';
    this._localDataUpdatedAt = Date.now();
    var payload = this._cacheFarmPayload(farmId, this._buildFarmPayload());
    this._loadOutbox(farmId);
    if (!payload) return;
    this._queueFarmRootSnapshot(farmId, payload);
    if (!navigator.onLine) {
      this.cloudStatus = 'offline';
      return;
    }
    this.cloudStatus = 'syncing';
    if (this._persistTimeout) clearTimeout(this._persistTimeout);
    this._persistTimeout = setTimeout(async function() {
      try {
        var authUser = await self._ensureCloudSessionReady();
        if (!authUser) throw Object.assign(new Error('AUTH_NOT_READY'), { code: 'auth/not-ready' });
        await self._writeFarmCloud(farmId, payload);
        self._loadOutbox(farmId);
        self._cloudOutbox = self._cloudOutbox.filter(function(op) { return !(op && op.collection === '__farm_root__' && op.id === 'root'); });
        self._saveOutbox(farmId);
        await self._syncSecureCollections(farmId);
        self._pendingCloudPayload = null;
        self.cloudStatus = 'synced';
      } catch (err) {
        self._pendingCloudPayload = { farmId: farmId, payload: payload, error: self._friendlyCloudError(err) };
        self.cloudStatus = navigator.onLine ? 'error' : 'offline';
        self.cloudLastSyncError = self._friendlyCloudError(err);
      }
    }, 180);
  },

  _ensureCloudSessionReady: async function() {
    var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;
    return this._awaitFirebaseAuthReady(7000);
  },


  _mergeFarmPayload: function(local, cloud, preferLocal) {
    var result = Object.assign({}, cloud || {}, local || {});
    var arrays = ['lotes','mortalityLogs','weightLogs','feedLogs','clients','energyLogs','staff','attendance','stockItems','notifications','suppliers','priceTable','healthLogs','auditLogs'];
    arrays.forEach(function(key) {
      var l = Array.isArray(local && local[key]) ? local[key] : [];
      var c = Array.isArray(cloud && cloud[key]) ? cloud[key] : [];
      var map = new Map();
      c.forEach(function(item, index) {
        if (!item) return;
        var id = item.id != null ? String(item.id) : ('cloud_' + index + '_' + key);
        map.set(id, item);
      });
      l.forEach(function(item, index) {
        if (!item) return;
        var id = item.id != null ? String(item.id) : ('local_' + index + '_' + key);
        var existing = map.get(id);
        if (!existing || preferLocal || (Number(item.updatedAt) || 0) >= (Number(existing.updatedAt) || 0)) map.set(id, item);
      });
      result[key] = Array.from(map.values());
    });
    if (preferLocal && local && local.settings) result.settings = local.settings;
    else if (cloud && cloud.settings) result.settings = cloud.settings;
    result.updatedAt = new Date(Math.max(localTimeSafe(local), localTimeSafe(cloud))).toISOString();
    return result;

    function localTimeSafe(obj) {
      return obj ? (Date.parse(obj.updatedAt || '') || 0) : 0;
    }
  },

  syncNow: async function(options) {
    var self = this;
    options = options || {};
    var silent = Boolean(options.silent);
    var farmId = this.currentFarmId;
    if (!this.currentUser || !farmId) { if (!silent) this.toast('Entre no sistema para sincronizar os dados.', 'error'); return false; }
    if (this.syncBusy) return false;
    if (!navigator.onLine) { this.cloudStatus = 'offline'; if (!silent) this.toast('Sem ligação. Os dados continuam guardados neste dispositivo.', 'error'); return false; }
    this.syncBusy = true; this.cloudStatus = 'syncing'; this.cloudLastSyncError = '';
    if (this._persistTimeout) { clearTimeout(this._persistTimeout); this._persistTimeout = null; }
    try {
      var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
      if (auth && !auth.currentUser) {
        await this._awaitFirebaseAuthReady(5500);
        auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
      }
      if (auth && !auth.currentUser) throw Object.assign(new Error('AUTH_NOT_READY'), { code: 'auth/not-ready' });
      var db = this.getDb();
      if (!db) throw Object.assign(new Error('CLOUD_UNAVAILABLE'), { code: 'cloud/unavailable' });
      await this._flushCloudOutbox(farmId);
      var snap = await db.collection('farms').doc(farmId).get();
      var cloud = snap.exists ? (snap.data() || {}) : null;
      var local = this._buildFarmPayload();
      var localTime = Date.parse(local.updatedAt || '') || 0;
      var cloudTime = Date.parse((cloud && cloud.updatedAt) || '') || 0;
      if (cloud) {
        var merged = this._mergeFarmPayload(local, cloud, localTime >= cloudTime);
        this._applyFarmData(merged, farmId);
        await this._writeFarmCloud(farmId, merged);
      } else {
        await this._writeFarmCloud(farmId, local);
      }
      await this._loadSecureCollections(farmId, cloud || {});
      await this._syncSecureCollections(farmId);
      this._cacheFarmPayload(farmId, this._buildFarmPayload());
      this._cacheSecureCollectionsLocal(farmId);
      this.syncBusy = false; this.cloudStatus = 'synced'; this.cloudLastSyncAt = Date.now();
      if (!silent) this.toast('Dados actualizados com sucesso.');
      return true;
    } catch (err) {
      this.syncBusy = false; this.cloudStatus = navigator.onLine ? 'error' : 'offline';
      this.cloudLastSyncError = this._friendlyCloudError(err);
      if (!silent) this.toast(this._friendlyCloudError(err), 'error');
      return false;
    }
  },

  _friendlyCloudError: function(err) {
    var code = String((err && err.code) || '');
    var msg = String((err && err.message) || '');
    if (!navigator.onLine || /offline|client is offline/i.test(msg) || code.indexOf('offline') !== -1) return 'Sem ligação. Os dados ficam guardados neste dispositivo e serão sincronizados depois.';
    if (code.indexOf('permission-denied') !== -1) return 'A sincronização foi recusada pelas regras do Firestore. Publique as regras da versão actual e entre novamente na conta.';
    if (code.indexOf('auth/not-ready') !== -1) return 'A sessão Firebase ainda não ficou pronta. Tente novamente em alguns segundos.';
    if (code.indexOf('unavailable') !== -1) return 'O Firebase está temporariamente indisponível. Tente novamente em instantes.';
    if (code.indexOf('failed-precondition') !== -1) return 'O Firebase informou que falta concluir uma configuração necessária.';
    return 'Não foi possível actualizar os dados online neste momento.';
  },

  listenFarm: async function(farmId) {
    var self = this, db = this.getDb();
    this.cloudStatus = navigator.onLine ? 'connecting' : 'offline';
    if (!db || !farmId) return;
    if (navigator.onLine) {
      var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
      if (auth && !auth.currentUser) {
        await this._awaitFirebaseAuthReady(5500);
      }
      auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
      if (auth && !auth.currentUser) {
        this.cloudStatus = 'connecting';
        return;
      }
    }
    try {
      if (Array.isArray(this._farmUnsubscribes)) this._farmUnsubscribes.forEach(function(u) { try { u(); } catch (e) {} });
      this._farmUnsubscribes = [];
      this._farmUnsubscribes.push(db.collection('farms').doc(farmId).onSnapshot(function(doc) {
        if (!doc.exists) return;
        var data = doc.data() || {};
        self._applyFarmData(data, farmId);
        self._isCloudSynced = true; self.cloudStatus = 'synced'; self.cloudLastSyncAt = Date.now(); self.cloudLastSyncError = '';
      }, function(err) { self.cloudStatus = 'error'; self.cloudLastSyncError = self._friendlyCloudError(err); self._isCloudSynced = false; }));

      this._farmUnsubscribes.push(db.collection('farms').doc(farmId).collection('staff').onSnapshot(function(snap) {
        self.staff = (snap.docs || []).map(function(d) { return Object.assign({ id: d.id }, d.data() || {}); });
      }, function(err) { self.cloudLastSyncError = self._friendlyCloudError(err); }));

      this._farmUnsubscribes.push(db.collection('farms').doc(farmId).collection('sales').onSnapshot(function(snap) {
        var remote = (snap.docs || []).map(function(d) { return Object.assign({ id: d.id }, d.data() || {}); });
        var pendingIds = new Set((self._cloudOutbox || []).filter(function(op){ return op.collection === 'sales'; }).map(function(op){ return String(op.id); }));
        var localPending = (self.sales || []).filter(function(s){ return s && pendingIds.has(String(s.id)); });
        var merged = new Map();
        remote.forEach(function(s){ merged.set(String(s.id), s); });
        localPending.forEach(function(s){ merged.set(String(s.id), s); });
        self.sales = Array.from(merged.values());
        self._isCloudSynced = true;
        self._loadOutbox(farmId);
      }, function(err) { self.cloudLastSyncError = self._friendlyCloudError(err); }));

      this._farmUnsubscribes.push(db.collection('farms').doc(farmId).collection('receipts').onSnapshot(function(snap) {
        var remote = (snap.docs || []).map(function(d) { return Object.assign({ id: d.id }, d.data() || {}); });
        var pendingIds = new Set((self._cloudOutbox || []).filter(function(op){ return op.collection === 'receipts'; }).map(function(op){ return String(op.id); }));
        var localPending = (self.receipts || []).filter(function(r){ return r && pendingIds.has(String(r.id)); });
        var merged = new Map();
        remote.forEach(function(r){ merged.set(String(r.id), r); });
        localPending.forEach(function(r){ merged.set(String(r.id), r); });
        self.receipts = Array.from(merged.values());
      }, function(err) { self.cloudLastSyncError = self._friendlyCloudError(err); }));

      if (this._isAdminRole()) {
        ['cashEntries', 'expenses', 'financialAudits'].forEach(function(name) {
          self._farmUnsubscribes.push(db.collection('farms').doc(farmId).collection(name).onSnapshot(function(snap) {
            var rows = (snap.docs || []).map(function(d) { return Object.assign({ id: d.id }, d.data() || {}); });
            if (name === 'cashEntries') self.cashLogs = rows;
            else if (name === 'expenses') self.expenses = rows;
            else self.financialAudits = rows;
          }, function(err) { self.cloudLastSyncError = self._friendlyCloudError(err); }));
        });
      }
    } catch (e) {
      this.cloudStatus = 'error';
      this.cloudLastSyncError = this._friendlyCloudError(e);
    }
  }
};
