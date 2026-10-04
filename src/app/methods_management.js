// Gestão profissional: agenda, alertas e saúde do lote.
export const methods = {
  openHealthModal: function() {
    this.showHealthModal = true;
    this.newHealthLoteId = (this.getActiveLote() || {}).id || '';
    this.newHealthDate = this.todayStr();
    this.newHealthProduct = '';
    this.newHealthQty = '';
    this.newHealthCost = '';
    this.newHealthNextDate = '';
    this.newHealthNotes = '';
  },
  saveHealthLog: function() {
    var lote = (this.lotes || []).find(function(l){ return l.id === this.newHealthLoteId; }) || this.getActiveLote();
    if (!lote) { this.toast('Selecione um lote.', 'error'); return; }
    if (!String(this.newHealthProduct || '').trim()) { this.toast('Indique o medicamento, vacina ou tratamento.', 'error'); return; }
    var record = {
      id: 'health_' + Date.now().toString(36), loteId: lote.id, loteCode: lote.code,
      type: this.newHealthType || 'Tratamento', date: this.newHealthDate || this.todayStr(),
      product: String(this.newHealthProduct).trim(), quantity: Number(this.newHealthQty) || 0,
      cost: Number(this.newHealthCost) || 0, nextDate: this.newHealthNextDate || '',
      notes: String(this.newHealthNotes || '').trim(),
      recordedBy: this.currentUser ? this.currentUser.nome : 'Sistema'
    };
    if (!Array.isArray(this.healthLogs)) this.healthLogs = [];
    this.healthLogs.unshift(record);
    if (record.cost > 0) {
      if (!Array.isArray(this.expenses)) this.expenses = [];
      var expId = 'e_health_' + Date.now().toString(36);
      var cashId = 'csh_health_' + Date.now().toString(36);
      record.expenseId = expId;
      record.cashEntryId = cashId;
      if (!Array.isArray(this.cashLogs)) this.cashLogs = [];
      this.expenses.unshift({id:expId,loteId:lote.id,loteCode:lote.code,category:'Medicamentos & Vacinas',description:record.type+' — '+record.product+' ('+lote.code+')',amount:record.cost,date:record.date,paymentMethod:'Dinheiro',supplier:'',responsible:record.recordedBy});
      this.cashLogs.unshift({id:cashId,date:record.date,time:new Date().toTimeString().slice(0,5),type:'OUT',category:'Medicamentos & Vacinas',description:record.type+' — '+record.product+' ('+lote.code+')',amount:record.cost,paymentMethod:'Dinheiro',responsible:record.recordedBy,referenceId:expId});
    }
    this.persistFarm();
    this.showHealthModal = false;
    this.toast(record.type + ' registada no lote ' + lote.code + '.');
    this.runAiDiagnostics();
  },
  deleteHealthLog: function(record) {
    if (!record) return;
    var role=this.currentUser&&(this.currentUser.roleType||this.currentUser.role);
    if (role!=='admin'&&role!=='super_admin'&&role!=='employee') { this.toast('Não tem permissão para apagar registos de saúde.', 'error'); return; }
    var self=this;
    this.confirm('Apagar o registo de '+(record.type||'saúde')+' — '+(record.product||'tratamento')+'?',function(){
      self.archiveDeletedRecord('Saúde',record,'Registo de saúde eliminado');
      var description=(record.type||'Tratamento')+' — '+(record.product||'')+' ('+(record.loteCode||'')+')';
      var linkedExpense=(self.expenses||[]).find(function(expense){return expense.id===record.expenseId||(expense.category==='Medicamentos & Vacinas'&&expense.date===record.date&&expense.description===description);});
      var expenseId=linkedExpense?linkedExpense.id:record.expenseId;
      self.healthLogs=(self.healthLogs||[]).filter(function(item){return item.id!==record.id;});
      if(expenseId){
        if(self._queueCloudDelete)self._queueCloudDelete(self.currentFarmId,'expenses',expenseId);
        (self.cashLogs||[]).filter(function(item){return item.id===record.cashEntryId||item.referenceId===expenseId;}).forEach(function(item){if(self._queueCloudDelete)self._queueCloudDelete(self.currentFarmId,'cashEntries',item.id);});
        self.expenses=(self.expenses||[]).filter(function(item){return item.id!==expenseId;});
        self.cashLogs=(self.cashLogs||[]).filter(function(item){return item.id!==record.cashEntryId&&item.referenceId!==expenseId;});
      }
      self.persistFarm();
      self.runAiDiagnostics();
      self.toast('Registo de saúde eliminado e arquivado.');
    });
  },
  getDailyAgenda: function() {
    var today = this.todayStr(), items = [];
    (this.lotes || []).filter(function(l){ return l.status === 'active'; }).forEach(function(l) {
      var age = this.getLoteAgeDays(l), target = Number(this.settings.cycleDays) || 38;
      if (age >= target - 3) items.push({type:'warning',date:today,title:'Preparar saída do lote '+l.code,detail:'O lote está com '+age+' dias. Meta: '+target+' dias.',view:'lotes'});
    }, this);
    (this.healthLogs || []).forEach(function(h){ if(h.nextDate && h.nextDate <= today) items.push({type:'warning',date:h.nextDate,title:h.type+' pendente — '+h.loteCode,detail:h.product,view:'lotes'}); });
    if (this.getActiveLote()) items.push({type:'info',date:today,title:'Registar rotina diária',detail:'Mortalidade, ração e peso devem ser atualizados hoje.',view:'controlo'});
    return items.slice(0,6);
  },
  getProfessionalAlerts: function() {
    var alerts = [], k = this.getSmartKPIs(), p = k.projection;
    if (Number(k.mortalityRate) > (Number(this.settings.maxMortalityPercent)||3)) alerts.push({type:'critical',title:'Mortalidade acima do limite',detail:k.mortalityRate+'% no lote ativo.'});
    if (k.feedStockDays > 0 && k.feedStockDays < 3) alerts.push({type:'warning',title:'Stock de ração crítico',detail:k.feedStockDays.toFixed(1)+' dias de cobertura estimada.'});
    if (p.weight > 0 && p.weightGap > 0.25) alerts.push({type:'warning',title:'Peso abaixo da meta',detail:p.weightGap.toFixed(2)+' kg abaixo da meta.'});
    if (Number(k.accountsReceivable) > 0) alerts.push({type:'info',title:'Existem valores a receber',detail:this.fmtMT(k.accountsReceivable)+' em dívidas de clientes.'});
    return alerts.slice(0,5);
  }
};
