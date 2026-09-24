import "../services/firebase.js";
import { createSecondaryUser, deleteSecondaryUser } from "../services/firebase.js";
import * as SafeStorage from "../services/storage.js";
// Métodos: misc
export const methods = {
  _loadCloudUserProfile: async function(authUser) {
        var self = this;
        var db = this.getDb();
        if (!db || !authUser) return null;
        this._profileLoadPromises = this._profileLoadPromises || {};
        var key = String(authUser.uid || '');
        if (this._profileLoadPromises[key]) return this._profileLoadPromises[key];
        this._profileLoadPromises[key] = (async function() {
          try {
            var ref = db.collection('users').doc(authUser.uid);
            var snap = await ref.get();
            var raw = snap.exists ? (snap.data() || {}) : null;
            if (!raw) return null;
            var profile = self._normalizeUserProfile(raw, authUser);
            if (!profile.farmId || !profile.roleType) return null;
            if (profile.status === 'blocked') {
              await window.getFirebaseAuth().signOut();
              self.loginError = 'Esta conta está bloqueada.';
              return null;
            }
            profile._authUid = authUser.uid;
            if (typeof self._loadOutbox === 'function') self._loadOutbox(profile.farmId);
            self._setSession(profile, profile.farmId, true);
            self.cloudStatus = 'synced';
            self.cloudLastSyncAt = Date.now();
            self.isCloudLoaded = true;
            if (typeof self.syncNow === 'function') setTimeout(function(){ self.syncNow({silent:true, automatic:true}).catch(function(){}); }, 250);
            return profile;
          } finally {
            delete self._profileLoadPromises[key];
          }
        })();
        return this._profileLoadPromises[key];
      },
      // OPERAÇÕES: CONTAS DOS COLABORADORES
      // Fluxo único e simples: Firebase Authentication é a fonte de verdade
      // para e-mail + palavra-passe. Não existe username/loginIdentifier para
      // colaboradores, evitando leituras Firestore desnecessárias e colisões falsas.
      addStaff: async function() {
        if (!this.isAdmin()) {
          this.toast('Sem permissão para criar contas.', 'error');
          return;
        }
        if (!navigator.onLine) {
          this.toast('É necessária Internet para criar a conta no Firebase.', 'error');
          return;
        }

        var roleType = this.newStaffRoleType || 'employee';
        if (!this.canManageAccessRole(roleType)) {
          this.toast('Sem permissão para criar este tipo de conta.', 'error');
          return;
        }
        var name = String(this.newStaffName || '').trim();
        var email = String(this.newStaffEmail || '').trim().toLowerCase();
        var phone = String(this.newStaffPhone || '').trim();
        if (!name) { this.toast('Introduza o nome completo.', 'error'); return; }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          this.toast('Introduza um e-mail válido para criar a conta no Firebase.', 'error');
          return;
        }

        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        var db = this.getDb();
        var farmId = this.currentFarmId || 'farm_principal';
        if (!auth || !auth.currentUser || !db) {
          this.toast('A ligação ao Firebase ainda não está pronta. Tente novamente.', 'error');
          return;
        }

        // A palavra-passe é criada uma única vez e é exatamente a mesma enviada
        // ao Firebase Authentication e apresentada ao administrador.
        var password = this.generateStaffCredential(name);
        if (password.length < 6) password = 'AIP' + String(Date.now()).slice(-6);
        this.authBusy = true;
        this.operationBusy = true;
        this.operationLabel = 'A criar conta no Firebase…';
        this.operationStep = '1/3';
        try {
          var created = await createSecondaryUser(email, password);
          if (!created || !created.uid) throw Object.assign(new Error('Firebase não devolveu o UID da conta.'), { code: 'auth/not-ready' });

          var member = {
            id: 'usr_' + created.uid, uid: created.uid, _authUid: created.uid,
            farmId: farmId, name: name, nome: name,
            username: '', email: email, authEmail: created.email || email,
            credentialType: 'password', roleType: roleType,
            roles: roleType === 'seller' ? ['employee','seller'] : [roleType],
            role: this.roleDisplayName(roleType), salary: Number(this.newStaffSalary) || 0,
            phone: phone, telefone: phone, entryDate: this.todayStr(), status: 'active',
            firstAccess: true, paidThisMonth: 0, advance: 0, createdAt: new Date().toISOString()
          };

          this.operationLabel = 'A guardar o perfil do colaborador…';
          this.operationStep = '2/3';
          // Apenas duas gravações de dados, num único commit. O e-mail já está
          // no Firebase Auth, portanto não criamos índices duplicados.
          var batch = db.batch();
          batch.set(db.collection('users').doc(created.uid), member, { merge: false });
          batch.set(db.collection('farms').doc(farmId).collection('staff').doc(created.uid), member, { merge: false });
          try {
            await batch.commit();
          } catch (writeError) {
            try { await deleteSecondaryUser(created.idToken, created.uid); } catch (_) {}
            throw writeError;
          }

          this.staff = [member].concat((this.staff || []).filter(function(item) { return item && item.id !== member.id && item.uid !== member.uid; }));
          if (typeof this.logAudit === 'function') this.logAudit('CRIAR_CONTA_COLABORADOR', 'Criada conta ' + email + ' (' + member.role + ')');

          this.lastGeneratedAccess = {
            uid: created.uid, email: created.email || email, authEmail: created.email || email,
            credential: password, credentialType: 'password', roleType: roleType,
            nome: name, phone: phone
          };
          var farmDisplay = ((this.settings && (this.settings.farmName || this.settings.companyLegalName)) || 'Aviário Inteligente Pro').trim();
          var appUrl = (window.location && /^https?:$/.test(window.location.protocol)) ? window.location.origin + window.location.pathname : 'Abra a aplicação pelo endereço oficial da empresa.';
          this.shareText = 'ACESSO AO AVIÁRIO INTELIGENTE PRO\n\n' + farmDisplay + '\n\nOlá, ' + name + '.\n\nFoi criada uma conta pessoal para si.\n\nE-mail: ' + (created.email || email) + '\nPalavra-passe inicial: ' + password + '\nFunção: ' + this.roleDisplayName(roleType) + '\n' + (phone ? 'Contacto: ' + phone + '\n' : '') + '\nAcesso: ' + appUrl + '\n\nNo primeiro acesso, pode alterar a sua palavra-passe no perfil.\n\n' + farmDisplay + '\nBilar DigitalTech Solutions';

          this.operationLabel = 'A preparar os dados de primeiro acesso…';
          this.operationStep = '3/3';
          this.newStaffName = '';
          this.newStaffPhone = '';
          this.newStaffEmail = '';
          this.newStaffSalary = 0;
          this.newStaffRoleType = 'employee';
          this.authBusy = false;
          this.operationBusy = false;
          this.operationLabel = '';
          this.operationStep = '';
          this.toast('Conta criada com sucesso. E-mail e palavra-passe estão prontos para partilhar.');
        } catch (e) {
          this.authBusy = false;
          this.operationBusy = false;
          this.operationLabel = '';
          this.operationStep = '';
          this._logFirebaseAuthError('staff-create', e);
          if (e && e.code === 'auth/email-already-in-use') {
            this.toast('Este e-mail já possui uma conta no Firebase. Use o e-mail da pessoa ou a conta existente.', 'error');
          } else if (e && e.code === 'auth/network-request-failed') {
            this.toast('O Firebase não respondeu. Verifique a Internet e tente novamente.', 'error');
          } else {
            this.toast(this._friendlyCloudError ? this._friendlyCloudError(e) : 'Não foi possível criar a conta no Firebase.', 'error');
          }
        }
      },
  showFirstAccess: function(user) {
        if (!user) return;
        var access = (this.lastGeneratedAccess && ((this.lastGeneratedAccess.uid && this.lastGeneratedAccess.uid === user.uid) || (this.lastGeneratedAccess.email && this.lastGeneratedAccess.email === user.email))) ? this.lastGeneratedAccess : null;
        if (!access) {
          this.toast('Por segurança, a palavra-passe inicial só é mostrada no momento em que o acesso é criado. Para um acesso antigo, use “Criar nova conta de colaborador” para gerar um novo acesso.', 'info');
          return;
        }
        this.lastGeneratedAccess = Object.assign({}, access);
        this.sharingUser = null;
      },
  getVisibleTeamMembers: function() {
        var rows = Array.isArray(this.staff) ? this.staff : [];
        if (this.isAdmin()) return rows;
        var me = this.currentUser || {};
        var myUid = String(me._authUid || me.uid || me.id || '');
        var myEmail = String(me.authEmail || me.email || '').toLowerCase();
        return rows.filter(function(row) {
          if (!row) return false;
          var uid = String(row._authUid || row.uid || row.id || '');
          var email = String(row.authEmail || row.email || '').toLowerCase();
          return (myUid && uid === myUid) || (myEmail && email === myEmail);
        });
      },
  openSalaryPayment: function(staffMember) {
        if (!staffMember) return;
        this.salaryPaymentStaff = staffMember;
        this.salaryPaymentAmount = '';
        this.salaryPaymentDescription = 'Pagamento de salário';
        this.salaryPaymentMethod = 'Caixa / Numerário';
        this.showSalaryPaymentModal = true;
      },
  closeSalaryPayment: function() {
        this.showSalaryPaymentModal = false;
        this.salaryPaymentStaff = null;
        this.salaryPaymentAmount = '';
      },
  confirmSalaryPayment: function() {
        if (!this.salaryPaymentStaff) return;
        var amount = Number(this.salaryPaymentAmount);
        if (!Number.isFinite(amount) || amount <= 0) { this.toast('Introduza um valor de pagamento válido.', 'error'); return; }
        this.paySalaryAdvance(this.salaryPaymentStaff, amount, this.salaryPaymentDescription || 'Pagamento de salário', this.salaryPaymentMethod || 'Caixa / Numerário');
        this.closeSalaryPayment();
      },
  _hashLocalCredential: async function(value) {
        var data = new TextEncoder().encode(String(value || ''));
        if (window.crypto && window.crypto.subtle) {
          var digest = await window.crypto.subtle.digest('SHA-256', data);
          return Array.from(new Uint8Array(digest)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
        }
        var h = 2166136261;
        for (var i = 0; i < String(value || '').length; i++) h = Math.imul(h ^ String(value || '').charCodeAt(i), 16777619);
        return (h >>> 0).toString(16);
      },
  handleCompanySignature: function(event) {
        var file = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/i.test(String(file.type || ''))) { this.toast('Seleccione uma imagem PNG, JPG ou WebP para a assinatura.', 'error'); return; }
        if (file.size > 1024 * 1024) { this.toast('A assinatura deve ter no máximo 1 MB.', 'error'); return; }
        var self = this, reader = new FileReader();
        reader.onload = function(e) {
          var img = new Image();
          img.onload = function() {
            var maxW = 420, maxH = 180, ratio = Math.min(1, maxW / Math.max(img.width, 1), maxH / Math.max(img.height, 1));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * ratio));
            canvas.height = Math.max(1, Math.round(img.height * ratio));
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            self.settings.signatureImage = canvas.toDataURL('image/png');
            self.persistFarm();
            self.toast('Assinatura guardada no perfil da empresa.');
          };
          img.onerror = function() { self.toast('Não foi possível ler a assinatura.', 'error'); };
          img.src = e.target.result;
        };
        reader.onerror = function() { self.toast('Não foi possível carregar a assinatura.', 'error'); };
        reader.readAsDataURL(file);
  },
  removeCompanySignature: function() {
        this.settings.signatureImage = '';
        this.persistFarm();
        this.toast('Assinatura removida do perfil.');
  },
  handleCompanyLogo: function(event) {
        var file = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) { this.toast('Seleccione uma imagem válida para o logotipo.', 'error'); return; }
        if (file.size > 3 * 1024 * 1024) { this.toast('O logotipo deve ter no máximo 3 MB.', 'error'); return; }
        var self = this;
        var reader = new FileReader();
        reader.onload = function(e) {
          var img = new Image();
          img.onload = function() {
            var max = 320, ratio = Math.min(1, max / Math.max(img.width, img.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * ratio));
            canvas.height = Math.max(1, Math.round(img.height * ratio));
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            self.settings.companyLogo = canvas.toDataURL('image/png');
            
            self.persistFarm();
            self.toast('Logotipo da empresa guardado no perfil.');
          };
          img.onerror = function() { self.toast('Não foi possível ler o logotipo.', 'error'); };
          img.src = e.target.result;
        };
        reader.onerror = function() { self.toast('Não foi possível carregar o logotipo.', 'error'); };
        reader.readAsDataURL(file);
  },
  removeCompanyLogo: function() {
        this.settings.companyLogo = '';
        
        this.persistFarm();
        this.toast('Logotipo removido do perfil.');
  },
  saveProfile: async function() {
        if (this.currentUser) {
          this.currentUser.nome = this.profNome;
          this.currentUser.phone = this.profTelefone;
          var profSecret = String(this.profSenha || this.profPin || '').trim();
          var profConfirm = String(this.profSenhaConfirm || this.profPinConfirm || '').trim();
          if (profSecret) this.profCredentialType = this.detectCredentialType(profSecret);
          if (profSecret) {
            if (profSecret !== profConfirm) { this.toast('A confirmação da credencial não coincide.', 'error'); return; }
            if (this.profCredentialType === 'pin' && !/^\d{4,8}$/.test(profSecret)) { this.toast('O PIN deve conter entre 4 e 8 dígitos.', 'error'); return; }
            if (this.profCredentialType === 'password' && profSecret.length < 6) { this.toast('A palavra-passe deve ter pelo menos 6 caracteres.', 'error'); return; }
            this.currentUser.credentialType = this.profCredentialType;
            // Nunca guardar a palavra-passe/PIN no perfil, localStorage ou Firestore.
          }
          var stored = (this.staff || []).find(function(x) { return x.id === this.currentUser.id; }.bind(this));
          if (stored) { stored.nome = this.currentUser.nome; stored.name = this.currentUser.nome; stored.phone = this.currentUser.phone; }
          SafeStorage.setItem('aviario_sess', JSON.stringify({ user: this.currentUser, farmId: this.currentFarmId, credentialHash: this.currentUser && this.currentUser._credentialHash ? this.currentUser._credentialHash : undefined }));
          var authProfile = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
          if (authProfile && this.currentUser._authUid) {
            try {
              var authUser = authProfile.currentUser;
              if (!authUser) throw Object.assign(new Error('Sessão indisponível.'), { code: 'auth/not-ready' });
              if (profSecret) {
                var currentSecret = String(this.profSenhaAtual || '').trim();
                if (!currentSecret) { this.toast('Introduza a palavra-passe actual para definir uma nova palavra-passe.', 'error'); return; }
                var currentCloudSecret = this._cloudPasswordForSecret ? this._cloudPasswordForSecret(currentSecret, this.detectCredentialType(currentSecret)) : currentSecret;
                if (typeof authProfile.reauthenticateWithPassword === 'function') await authProfile.reauthenticateWithPassword(authUser.email, currentCloudSecret);
                var newCloudSecret = this._cloudPasswordForSecret ? this._cloudPasswordForSecret(profSecret, this.profCredentialType) : profSecret;
                if (typeof authProfile.updatePassword === 'function') await authProfile.updatePassword(authUser, newCloudSecret);
              }
              var profileData = { nome: this.currentUser.nome, name: this.currentUser.nome, phone: this.currentUser.phone, username: this.currentUser.username, farmId: this.currentFarmId, roleType: this.currentUser.roleType, roles: this.currentUser.roles || [this.currentUser.roleType], status: this.currentUser.status || 'active', credentialType: this.currentUser.credentialType, updatedAt: new Date().toISOString() };
              await this.getDb().collection('users').doc(this.currentUser._authUid).set(profileData, { merge: true });
              await this.getDb().collection('farms').doc(this.currentFarmId).collection('staff').doc(this.currentUser._authUid).set(Object.assign({}, profileData, { id: 'usr_' + this.currentUser._authUid, uid: this.currentUser._authUid, _authUid: this.currentUser._authUid, email: this.currentUser.authEmail || authUser.email || '' }), { merge: true });
            } catch (e) {
              var code = this._normalizeFirebaseErrorCode ? this._normalizeFirebaseErrorCode(e) : '';
              if (code === 'auth/requires-recent-login') this.toast('Por segurança, introduza a sua palavra-passe actual e tente novamente.', 'error');
              else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') this.toast('A palavra-passe actual não está correcta.', 'error');
              else this.toast('Não foi possível guardar as alterações. Verifique a ligação e tente novamente.', 'error');
              return;
            }
          }
          this.profSenhaAtual = ''; this.profSenha = ''; this.profSenhaConfirm = '';
          this.persistFarm();
          this.toast('Perfil actualizado com sucesso.');
        }
        this.showProfile = false;
      },
  copyShareText: async function() {
        try { await navigator.clipboard.writeText(this.shareText || ''); this.toast('Credenciais copiadas.'); } catch(e) { this.toast('Não foi possível copiar automaticamente.', 'error'); }
      },
  shareCredentials: async function(user) {
        if (!user) return;
        var access = (this.lastGeneratedAccess && ((this.lastGeneratedAccess.uid && this.lastGeneratedAccess.uid === user.uid) || (this.lastGeneratedAccess.email && this.lastGeneratedAccess.email === user.email))) ? this.lastGeneratedAccess : null;
        var type = access ? (access.credentialType || 'password') : (user.credentialType || 'password');
        var secret = access ? access.credential : '';
        var farm = ((this.settings && (this.settings.companyLegalName || this.settings.farmName)) || 'Aviário Inteligente Pro').trim();
        var subtitle = (this.settings && (this.settings.companySubtitle || this.settings.tagline)) || 'Gestão Avícola';
        var responsible = (this.settings && this.settings.signatureName) || (this.currentUser && this.currentUser.nome) || 'Responsável';
        var contact = (this.settings && (this.settings.phone || this.settings.companyEmail)) || '';
        var appUrl = (window.location && /^https?:$/.test(window.location.protocol)) ? window.location.origin + window.location.pathname : 'Abra a aplicação pelo endereço oficial da empresa.';
        if (!secret) {
          this.toast('A credencial original não é recuperada por segurança. Use “Criar nova conta de colaborador” para gerar um novo acesso e partilhe-a em seguida.', 'info');
          this.editStaffAccess(user);
          return;
        }
        var accessEmail = user.email || user.authEmail || '';
        var text = 'ACESSO AO AVIÁRIO INTELIGENTE PRO\n\n' +
          farm + '\n' + subtitle + '\n\n' +
          'Olá, ' + (user.nome || user.name || 'colaborador') + '!\n\n' +
          'Foi criado um acesso pessoal para si no sistema.\n\n' +
          'E-mail de acesso: ' + accessEmail + '\n' +
          'Palavra-passe: ' + secret + '\n' +
          'Função: ' + this.roleDisplayName(user.roleType || 'employee') + '\n' +
          (user.phone ? 'Contacto: ' + user.phone + '\n' : '') +
          (contact ? 'Contacto da empresa: ' + contact + '\n' : '') + '\n' +
          'Acesso: ' + appUrl + '\n\n' +
          'No primeiro acesso, pode alterar a palavra-passe no seu perfil.\n\n' +
          'Responsável: ' + responsible + '\n' +
          'Mensagem automática — ' + farm + '\n' +
          'Bilar DigitalTech Solutions';
        this.shareText = text;
        this.sharingUser = user;
        if (navigator.share) {
          try { await navigator.share({ title: 'Acesso — ' + farm, text: text }); this.sharingUser = null; return; } catch (e) {}
        }
        if (navigator.clipboard) {
          try { await navigator.clipboard.writeText(text); this.toast('Mensagem personalizada copiada. Pode enviar por WhatsApp, SMS ou e-mail.'); } catch(e) {}
        }
      },
};
