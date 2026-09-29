import * as SafeStorage from "../services/storage.js";

// Métodos: ui
export const methods = {
  getCloudSyncTitle: function(){
    var map={synced:'Dados actualizados. Clique para confirmar a actualização.',syncing:'A actualizar automaticamente…',connecting:'A verificar a ligação…',ready:'Actualizar dados agora',offline:'Sem ligação. A actualização será retomada automaticamente.',error:'Tentar actualizar novamente'};
    return map[this.cloudStatus||'ready'] || 'Actualizar dados';
  },
  openProfile: function() {
    if (this.currentUser) {
          this.profNome = this.currentUser.nome;
          this.profTelefone = this.currentUser.phone || '';
          this.profUsername = this.currentUser.username;
          this.profCredentialType = this.currentUser.credentialType || 'password';
          this.profSenha = ''; this.profSenhaConfirm = ''; this.profSenhaAtual = ''; this.profPin = ''; this.profPinConfirm = '';
    }
    this.showProfile = true;
  },
  // INTERFACE, VOZ, IDIOMA & TEMA
      t: function(key) {
        var lang = this.currentLang || 'pt';
        var dict = (window.I18N && window.I18N[lang]) || (window.I18N && window.I18N.pt) || {};
        var pt = (window.I18N && window.I18N.pt) || {};
        return dict[key] || pt[key] || key;
      },
  setLang: function(lang) {
        var allowed = ['pt', 'en', 'fr', 'sen', 'cga', 'emk'];
        this.currentLang = allowed.indexOf(lang) !== -1 ? lang : 'pt';
        SafeStorage.setItem('aviario_lang', this.currentLang);
        document.documentElement.lang = this.currentLang === 'pt' ? 'pt-PT' : this.currentLang;
        if (window.applyI18n) window.applyI18n();
        if (this.$nextTick) this.$nextTick(function(){ if (window.applyI18n) window.applyI18n(); });
        this.toast(window.t ? window.t('idiomaActualizado') : 'Idioma actualizado.');
      },
  applyTheme: function() {
        var mode = this.darkMode ? 'dark' : 'light';
        document.documentElement.dataset.theme = mode;
        document.documentElement.classList.toggle('theme-dark', mode === 'dark');
        document.documentElement.classList.toggle('theme-light', mode === 'light');
        if (document.body) {
          document.body.classList.toggle('dark', mode === 'dark');
          document.body.classList.toggle('light', mode === 'light');
          document.body.dataset.theme = mode;
        }
      },
  toggleTheme: function() {
        this.darkMode = !this.darkMode;
        SafeStorage.setItem('aviario_theme', this.darkMode ? 'dark' : 'light');
        this.applyTheme();
      },
  openVoiceSettings: function() {
        this.showVoiceSettings = true;
        if (typeof window.speechSynthesis !== 'undefined' && window.speechSynthesis.getVoices) window.speechSynthesis.getVoices();
      },
  setVoiceEnabled: function(value) {
        this.voiceEnabled = value === true || value === 'true';
        SafeStorage.setItem('aviario_voice', this.voiceEnabled ? 'on' : 'off');
        if (this.voiceEnabled) this.speak('Assistente de voz activado.');
      },
  setVoiceGender: function(value) {
        this.voiceGender = value === 'masculina' ? 'masculina' : 'feminina';
        SafeStorage.setItem('aviario_voice_gender', this.voiceGender);
        if (this.voiceEnabled) this.speak('Voz ' + (this.voiceGender === 'masculina' ? 'masculina' : 'feminina') + ' seleccionada.');
      },
  speak: function(text) {
        if (!this.voiceEnabled || typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false;
        try {
          var synth = window.speechSynthesis;
          synth.cancel();
          var utter = new SpeechSynthesisUtterance(String(text || ''));
          var speechLangs = { pt: 'pt-PT', en: 'en-US', fr: 'fr-FR', cga: 'pt-PT', emk: 'pt-PT', sen: 'pt-PT' };
          utter.lang = speechLangs[this.currentLang] || 'pt-PT';
          utter.rate = 1.02;
          utter.pitch = this.voiceGender === 'feminina' ? 1.05 : 0.92;
          var voices = synth.getVoices ? synth.getVoices() : [];
          var langBase = utter.lang.toLowerCase().split('-')[0];
          var sameLang = voices.filter(function(v){ return String(v.lang||'').toLowerCase().indexOf(langBase) === 0; });
          var genderRegex = this.voiceGender === 'masculina' ? /male|homem|masc|jorge|david|daniel|ricardo|carlos|joao|joão/ : /female|woman|fem|helena|maria|sofia|ana|beatriz|clara/;
          var preferred = sameLang.find(function(v){ return genderRegex.test(String(v.name||'').toLowerCase()); });
          if (!preferred) preferred = sameLang[0] || voices.find(function(v){ return String(v.lang||'').toLowerCase().indexOf('pt')===0; }) || voices[0];
          if (preferred) utter.voice = preferred;
          synth.speak(utter);
          return true;
        } catch(e) {
          return false;
        }
      },
  getLoteHealthBadge: function(lote) {
        var initial = lote.initialBirds || 1;
        var deaths = this.getLoteMortality(lote.id);
        var rate = (deaths / initial) * 100;
        if (rate <= 3.0) return { label: ' Saudável', class: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', rate: rate.toFixed(1) };
        if (rate <= 5.0) return { label: ' Atenção', class: 'bg-amber-500/20 text-amber-300 border border-amber-500/30', rate: rate.toFixed(1) };
        return { label: ' Crítico', class: 'bg-red-500/20 text-red-400 border border-red-500/30', rate: rate.toFixed(1) };
      },
  getLoteGrowthLogs: function(loteId) {
        return (this.weightLogs || []).filter(function(w) { return w.loteId === loteId; })
          .sort(function(a, b) { return a.ageDays - b.ageDays; });
      },
  openLoteDetails: function(lote) {
        this.selectedLote = lote;
        this.selectedLoteId = lote.id;
        this.loteDetailTab = 'resumo';
        this.newWeightAgeDays = this.getLoteAgeDays(lote);
      },
};
