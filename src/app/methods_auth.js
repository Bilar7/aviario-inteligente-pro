import "../services/firebase.js";
import * as SafeStorage from "../services/storage.js";
export const methods = {
      // Única porta de entrada da sessão da aplicação. Mantém o estado local
      // e o perfil Firebase sincronizados sem depender de métodos removidos.
      _setSession: function(profile, farmId, persist) {
        var normalized = this._normalizeUserProfile(profile || {}, null);
        var targetFarmId = farmId || normalized.farmId || 'farm_principal';
        normalized.farmId = targetFarmId;
        this.currentUser = normalized;
        this.currentFarmId = targetFarmId;
        this._localSessionProvisional = false;
        this._intentionalLogout = false;
        this.isCloudLoaded = true;
        if (persist !== false) {
          SafeStorage.setItem('aviario_sess', JSON.stringify({ user: normalized, farmId: targetFarmId }));
        }
        if (typeof this._loadOutbox === 'function') this._loadOutbox(targetFarmId);
        if (typeof this.listenFarm === 'function' && navigator.onLine) {
          Promise.resolve(this.listenFarm(targetFarmId)).catch(function() {});
        }
        return normalized;
      },
      logout: async function() {
        if (this.authBusy) return;
        this.authBusy = true;
        this._intentionalLogout = true;
        try {
          if (Array.isArray(this._farmUnsubscribes)) {
            this._farmUnsubscribes.forEach(function(unsub) { try { unsub(); } catch (_) {} });
          }
          this._farmUnsubscribes = [];
          var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
          if (auth) await auth.signOut();
        } catch (e) {
          console.warn('[Aviário] logout:', e);
        } finally {
          this.currentUser = null;
          this.currentFarmId = 'farm_principal';
          this.isCloudLoaded = false;
          this._firebaseAuthUser = null;
          this._localSessionProvisional = false;
          this._cloudOutbox = [];
          this.cloudStatus = navigator.onLine ? 'ready' : 'offline';
          this.cloudLastSyncError = '';
          SafeStorage.removeItem('aviario_sess');
          this.loginSenha = '';
          this.loginError = '';
          this.authBusy = false;
          this.view = 'dashboard';
          this.showSignup = false;
          this.toast('Sessão terminada.');
        }
      },
      detectCredentialType: function(secret) {
        var v = String(secret || '').trim();
        return /^\d{4,8}$/.test(v) ? 'pin' : 'password';
      },
      _companyAcronym: function() {
        var raw = String((this.settings && (this.settings.companyLegalName || this.settings.companyName || this.settings.farmName)) || 'Aviário Inteligente Pro').trim();
        var words = raw.normalize ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/) : raw.split(/\s+/);
        var ignored = { 'de':1, 'da':1, 'do':1, 'das':1, 'dos':1, 'e':1, 'em':1, 'para':1, 'por':1, 'the':1, 'of':1, 'and':1 };
        var letters = words.filter(function(w){ return w && !ignored[String(w).toLowerCase()]; }).map(function(w){ return String(w).replace(/[^A-Za-z0-9]/g,'').charAt(0); }).join('').toUpperCase();
        letters = letters.replace(/[^A-Z0-9]/g,'');
        if (!letters) letters = 'AIP';
        return letters.slice(0, 4);
      },
      generateStaffCredential: function(name) {
        var raw = String(name || '').trim();
        var normalized = raw.normalize ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : raw;
        var parts = normalized.split(/\s+/).filter(Boolean);
        var initial = String(parts[0] || 'U').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'U';
        var digits;
        if (window.crypto && window.crypto.getRandomValues) {
          var bytes = new Uint32Array(1);
          window.crypto.getRandomValues(bytes);
          digits = String(1000 + (bytes[0] % 9000));
        } else {
          digits = String(Math.floor(1000 + Math.random() * 9000));
        }
        var prefix = this._companyAcronym ? this._companyAcronym() : 'AIP';
        return prefix + digits + initial;
      },
      generateAccessCode: function() {
        var prefix = this._companyAcronym ? this._companyAcronym() : 'AIP';
        var used = (this.staff || []).map(function(u){ return String(u.accessCode || '').trim().toUpperCase(); });
        var code = '';
        for (var attempt = 0; attempt < 100; attempt += 1) {
          code = prefix + '-' + String(Math.floor(100000 + Math.random() * 900000));
          if (used.indexOf(code) === -1) return code;
        }
        return prefix + '-' + Date.now().toString().slice(-6);
      },
      generateInitialCredential: function() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        var out = 'Av#';
        if (window.crypto && window.crypto.getRandomValues) {
          var bytes = new Uint8Array(10);
          window.crypto.getRandomValues(bytes);
          for (var i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
        } else {
          for (var j = 0; j < 10; j++) out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
      },
      _normalizeUserProfile: function(profile, authUser) {
        var p = Object.assign({}, profile || {});
        var roles = Array.isArray(p.roles) ? p.roles.slice() : [];
        var roleType = p.roleType || roles[0] || (p.role === 'Administrador' ? 'admin' : (p.role === 'Vendedor / Caixa' ? 'seller' : 'employee'));
        if (roleType === 'super_admin' && roles.indexOf('admin') === -1) roles.push('admin');
        if (roles.indexOf(roleType) === -1) roles.unshift(roleType);
        p.roleType = roleType;
        p.roles = roles;
        p.role = p.role || this.roleDisplayName(roleType);
        p.nome = p.nome || p.name || p.displayName || (authUser && authUser.displayName) || 'Utilizador';
        p.name = p.name || p.nome;
        p.username = p.username || (p.email ? String(p.email).split('@')[0] : '');
        p.authEmail = p.authEmail || (authUser && authUser.email) || '';
        p.phone = p.phone || p.telefone || '';
        p.telefone = p.telefone || p.phone || '';
        p.status = p.status || 'active';
        if (authUser) p._authUid = authUser.uid;
        return p;
      },
      roleDisplayName: function(roleType) {
        if (roleType === 'super_admin') return 'Super Admin';
        if (roleType === 'admin') return 'Administrador';
        if (roleType === 'seller') return 'Vendedor / Caixa';
        return 'Funcionário';
      },
      canManageAccessRole: function(roleType) {
        if (this.isSuperAdmin()) return roleType !== 'super_admin';
        return this.isAdmin() && (roleType === 'employee' || roleType === 'seller');
      },
      canAccessView: function(view) {
        if (!this.currentUser) return false;
        var roleType = this.currentUser.roleType || (Array.isArray(this.currentUser.roles) ? this.currentUser.roles[0] : '') || '';
        if (roleType === 'super_admin' || this.isSuperAdmin()) return true;
        if (roleType === 'admin' || this.hasRole('admin')) {
          return ['dashboard','controlo','lotes','racao','vendas','financas','clientes','equipa','stock','despesas','planilha','relatorios','configuracoes'].indexOf(view) !== -1;
        }
        if (roleType === 'employee') {
          return ['dashboard','controlo','lotes','racao','vendas','clientes','stock','equipa','planilha','relatorios'].indexOf(view) !== -1;
        }
        if (roleType === 'seller') {
          return ['dashboard','vendas','clientes','equipa','planilha','relatorios'].indexOf(view) !== -1;
        }
        return ['dashboard'].indexOf(view) !== -1;
      },
      canCreateOperationalLote: function() {
        return this.isAdmin() || (this.currentUser && this.currentUser.roleType === 'employee');
      },
  _normalizeFirebaseErrorCode: function(error) {
        var code = String(error && error.code || '').toLowerCase();
        var message = String(error && error.message || error || '').toLowerCase();
        var source = code + ' ' + message;
        if (source.includes('email-already-in-use')) return 'auth/email-already-in-use';
        if (source.includes('invalid-email')) return 'auth/invalid-email';
        if (source.includes('invalid-argument')) return 'auth/invalid-argument';
        if (source.includes('argument-error')) return 'auth/argument-error';
        if (source.includes('invalid-password')) return 'auth/invalid-password';
        if (source.includes('invalid-api-key')) return 'auth/invalid-api-key';
        if (source.includes('app-not-authorized')) return 'auth/app-not-authorized';
        if (source.includes('internal-error')) return 'auth/internal-error';
        if (source.includes('invalid-credential')) return 'auth/invalid-credential';
        if (source.includes('wrong-password')) return 'auth/wrong-password';
        if (source.includes('user-not-found')) return 'auth/user-not-found';
        if (source.includes('weak-password')) return 'auth/weak-password';
        if (source.includes('operation-not-allowed')) return 'auth/operation-not-allowed';
        if (source.includes('unauthorized-domain')) return 'auth/unauthorized-domain';
        if (source.includes('too-many-requests')) return 'auth/too-many-requests';
        if (source.includes('user-disabled')) return 'auth/user-disabled';
        if (/network-request-failed|name_not_resolved|quic|transport/.test(source)) return 'auth/network-request-failed';
        if (/permission-denied|missing or insufficient permissions/.test(source)) return 'permission-denied';
        return code || 'unknown';
      },
  _logFirebaseAuthError: function(operation, error) {
        var code = this._normalizeFirebaseErrorCode ? this._normalizeFirebaseErrorCode(error) : (error && error.code ? String(error.code) : 'unknown');
        var rawCode = String(error && error.code || '');
        var rawMessage = String(error && error.message || error || '');
        if (import.meta.env.DEV) console.warn('[Aviário] ' + operation + ': ' + code + (rawCode && rawCode !== code ? ' [' + rawCode + ']' : '') + (rawMessage ? ' — ' + rawMessage : ''));
        return code;
      },
  _friendlyAuthError: function(error) {
        var code = this._normalizeFirebaseErrorCode ? this._normalizeFirebaseErrorCode(error) : String(error && error.code || 'unknown');
        if (code === 'auth/email-already-in-use') return 'Este e-mail já está registado. Use Entrar com a conta existente.';
        if (code === 'auth/username-already-in-use') return 'Este nome de utilizador já está registado. Escolha outro.';
        if (code === 'auth/invalid-email') return 'Introduza um endereço de e-mail válido.';
        if (code === 'auth/weak-password' || code === 'auth/invalid-password') return 'A palavra-passe deve ter pelo menos 6 caracteres.';
        if (code === 'auth/operation-not-allowed') return 'Email/Password não está activado no Firebase Authentication.';
        if (code === 'auth/unauthorized-domain') return 'Este domínio não está autorizado no Firebase Authentication.';
        if (code === 'auth/network-request-failed') return 'Não foi possível contactar o Firebase. Verifique a ligação à Internet.';
        if (code === 'auth/invalid-api-key') return 'A configuração Web do Firebase está inválida.';
        if (code === 'permission-denied') return 'Authentication funcionou, mas o Firestore recusou a gravação. Publique as regras de teste/produção correspondentes.';
        if (code === 'cloud/verification-failed') return 'O Firebase não confirmou todos os dados após o cadastro.';
        if (code === 'cloud/cleanup-failed') return 'O cadastro falhou e a conta incompleta não pôde ser limpa. Tente novamente.';
        if (code === 'auth/invalid-credential') return 'O Firebase não aceitou o e-mail e a palavra-passe/PIN. Confirme os dados iniciais da conta ou use “Esqueceu a palavra-passe?” para redefinir.';
        if (code === 'profile/already-exists') return 'Já existe um perfil para esta conta. Volte ao login normal.';
        if (code === 'profile/recovery-linked') return 'Esta conta já está associada a uma exploração. Não foi criada outra para evitar duplicar dados; é necessária recuperação administrativa do perfil existente.';
        if (code === 'auth/requires-recent-login') return 'Por segurança, confirme a sua palavra-passe actual para alterar a credencial.';
        var raw = String(error && error.message || '').replace(/^Firebase:\s*/i,'').trim();
        return raw && !/^failed to get document|^could not reach cloud firestore|^firebase/i.test(raw) ? 'Não foi possível concluir a operação. Tente novamente.' : 'Não foi possível concluir a operação. Tente novamente.';
      },
  normalizeUsername: function(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
      },
      makeUsernameAuthEmail: function(username) {
        var safe = this.normalizeUsername(username).replace(/[^a-z0-9._-]/g, '');
        return safe + '.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '@aviario.local';
      },
      _loginIdentifierKey: function(identifier, kind) {
        var value = String(identifier || '').trim().toLowerCase();
        if (kind === 'email') return 'email_' + encodeURIComponent(value);
        return this.normalizeUsername(value);
      },
      resolveLoginIdentifier: async function(identifier) {
        var db = this.getDb();
        if (!db) return null;
        var raw = String(identifier || '').trim().toLowerCase();
        if (!raw) return null;
        var kind = raw.includes('@') ? 'email' : 'username';
        var key = this._loginIdentifierKey(raw, kind);
        var snap = await db.collection('loginIdentifiers').doc(key).get();
        if (!snap.exists && kind === 'email') return null;
        if (!snap.exists) return null;
        var data = snap.data() || {};
        if (data.status === 'blocked') throw Object.assign(new Error('USER_BLOCKED'), { code: 'auth/user-disabled' });
        return { authEmail: data.authEmail || null, uid: data.uid || '', credentialType: data.credentialType || 'password' };
      },
  login: async function() {
        if (this.authBusy) return;
        var input = String(this.loginUsername || '').trim().toLowerCase();
        var secret = String(this.loginSenha || '').trim();
        var credentialType = /^\d{4,8}$/.test(secret) ? 'pin' : 'password';
        this.loginError = '';
        this.profileRecoveryAvailable = false;
        this.profileRecoveryEmail = '';
        if (!input || !secret) { this.loginError = 'Introduza o nome de utilizador ou e-mail e a senha/PIN.'; return; }
        var authIdentifier = input;
        var identifierData = null;
        try {
          // Login por e-mail vai diretamente ao Firebase Authentication.
          // Assim, uma leitura lenta/offline do Firestore não atrasa o acesso.
          if (input.includes('@')) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) { this.loginError = 'Introduza um e-mail válido.'; return; }
            authIdentifier = input;
          } else {
            identifierData = await this.resolveLoginIdentifier(input);
            if (identifierData && identifierData.authEmail) authIdentifier = identifierData.authEmail;
            else { this.loginError = 'Utilizador não encontrado. Confirme o nome de utilizador.'; return; }
          }
          if (identifierData && identifierData.credentialType && identifierData.credentialType !== 'both') credentialType = identifierData.credentialType === 'pin' ? 'pin' : 'password';
          if (credentialType === 'pin' && !/^\d{4,8}$/.test(secret)) { this.loginError = 'Introduza o PIN correcto.'; return; }
          if (credentialType === 'password' && secret.length < 6) { this.loginError = 'A palavra-passe deve ter pelo menos 6 caracteres.'; return; }
        } catch (resolveError) {
          this.loginError = this._friendlyAuthError(resolveError); return;
        }
        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        if (!auth) { this.loginError = 'O Firebase Authentication não está disponível.'; return; }
        this.authBusy = true;
        try {
          if (typeof auth.setPersistence === 'function') await auth.setPersistence('local');
          var cloudSecret = this._cloudPasswordForSecret ? this._cloudPasswordForSecret(secret, credentialType) : secret;
          var cred;
          try {
            cred = await auth.signInWithEmailAndPassword(authIdentifier, cloudSecret);
          } catch (credentialError) {
            var canTryNumericPassword = input.includes('@') && !identifierData && credentialType === 'pin' && /^\d{4,8}$/.test(secret);
            var credentialErrorCode = this._normalizeFirebaseErrorCode(credentialError);
            if (!canTryNumericPassword || credentialErrorCode !== 'auth/invalid-credential') throw credentialError;
            cred = await auth.signInWithEmailAndPassword(authIdentifier, secret);
          }
          var profile = await this._finalizeSignedInProfile(cred.user, secret);
          this.authBusy = false;
          this.toast('Bem-vindo, ' + (profile.nome || profile.name || 'utilizador') + '!');
          this.speak('Bem-vindo, ' + (profile.nome || profile.name || 'utilizador') + '.');
        } catch (e) {
          var code = this._logFirebaseAuthError('login', e);
          this.authBusy = false;
          this.loginError = this._friendlyAuthError(e);
          if (code === 'profile/not-found') {
            this.loginError = 'A conta existe no Authentication, mas ainda não existe perfil no Firestore.';
            this.profileRecoveryAvailable = true;
            this.profileRecoveryEmail = authIdentifier;
          }
        }
      },
      startProfileRecovery: function() {
        if (!this.profileRecoveryAvailable) return;
        this.signupError = '';
        this.profileRecoveryMode = true;
        this.showSignup = true;
        this.suNome = '';
        this.suFarmName = '';
        this.suUsername = String(this.loginUsername || '').includes('@') ? '' : this.normalizeUsername(this.loginUsername);
        this.suEmail = this.profileRecoveryEmail || '';
        this.suSenha = '';
        this.suSenhaConfirm = '';
      },
      requestPasswordReset: async function() {
        if (this.authBusy) return;
        var email = String(this.loginUsername || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          this.loginError = 'Introduza primeiro o e-mail da conta para receber a ligação de reposição.';
          return;
        }
        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        if (!auth || typeof auth.sendPasswordResetEmail !== 'function') {
          this.loginError = 'A recuperação de palavra-passe não está disponível neste momento.';
          return;
        }
        this.authBusy = true;
        this.loginError = '';
        try {
          await auth.sendPasswordResetEmail(email);
          this.toast('Se existir uma conta associada a este e-mail, será enviada uma ligação de reposição.');
        } catch (error) {
          var code = this._logFirebaseAuthError('password-reset', error);
          this.loginError = code === 'auth/network-request-failed'
            ? 'Não foi possível contactar o Firebase. Verifique a ligação à Internet e tente novamente.'
            : 'Não foi possível enviar a ligação de reposição. Confirme o e-mail e tente novamente.';
        } finally {
          this.authBusy = false;
        }
      },
  _completeFirstAdminRegistration: async function(authUser, payload, preserveAuthOnFailure) {
        var db = this.getDb();
        if (!db || !authUser) throw Object.assign(new Error('Firebase indisponível.'), { code: 'cloud/unavailable' });
        var uid = authUser.uid;
        var farmId = payload.farmId;
        var profileRef = db.collection('users').doc(uid);
        var farmRef = db.collection('farms').doc(farmId);
        var profile = {
          id: uid, _authUid: uid, farmId: farmId, nome: payload.name, name: payload.name,
          username: payload.username, email: payload.email || '', authEmail: payload.authEmail || authUser.email || '', roleType: 'super_admin',
          roles: ['super_admin','admin'], role: 'Proprietário / Administrador', status: 'active',
          credentialType: payload.credentialType || 'password', phone: '', salary: 0
        };
        var settings = Object.assign({}, this.settings || {}, { farmName: payload.farmName, companyLegalName: payload.farmName });
        var farmData = { farmId: farmId, ownerUid: uid, settings: settings, lotes: [], mortalityLogs: [], weightLogs: [], feedLogs: [], clients: [], energyLogs: [], attendance: [], stockItems: [], suppliers: [], priceTable: [], healthLogs: [], notifications: [], updatedAt: new Date().toISOString() };
        var batch = db.batch();
        batch.set(profileRef, profile, { merge: false });
        batch.set(farmRef, farmData, { merge: false });
        batch.set(db.collection('loginIdentifiers').doc(payload.username), { username: payload.username, authEmail: payload.authEmail || authUser.email, uid: uid, farmId: farmId, credentialType: payload.credentialType || 'password', status: 'active', createdAt: new Date().toISOString() }, { merge: false });
        if (payload.email) batch.set(db.collection('loginIdentifiers').doc(this._loginIdentifierKey(payload.email, 'email')), { email: payload.email, username: payload.username, authEmail: payload.authEmail || authUser.email, uid: uid, farmId: farmId, credentialType: payload.credentialType || 'password', status: 'active', createdAt: new Date().toISOString() }, { merge: false });
        try {
          // Uma única gravação. As leituras de verificação anteriores acrescentavam
          // duas viagens à rede e podiam deixar o primeiro registo muito lento.
          await batch.commit();
        } catch (e) {
          if (!preserveAuthOnFailure) {
            try { await authUser.delete(); } catch (cleanupErr) { throw Object.assign(new Error('Falha ao gravar Firestore e a conta Authentication não pôde ser limpa.'), { code: 'cloud/cleanup-failed', cause: e }); }
          }
          throw e;
        }
        profile._authUid = uid;
        this.currentFarmId = farmId; this.currentUser = profile; this.settings = settings; this.staff = [profile];
        SafeStorage.setItem('aviario_sess', JSON.stringify({ user: profile, farmId: farmId }));
        if (typeof this._cacheFarmPayload === 'function') this._cacheFarmPayload(farmId, farmData);
        return profile;
      },
  _finalizeSignedInProfile: async function(authUser, secret) {
        var profile = await this._loadCloudUserProfile(authUser);
        if (!profile) throw Object.assign(new Error('Perfil da conta não foi encontrado no Firestore.'), { code: 'profile/not-found' });
        // Migra/garante o índice de login por utilizador para contas antigas.
        try {
          var db = this.getDb();
          var username = this.normalizeUsername(profile.username);
          if (db && username) {
            await db.collection('loginIdentifiers').doc(username).set({ username: username, authEmail: profile.authEmail || authUser.email || '', uid: authUser.uid, farmId: profile.farmId, status: profile.status || 'active', credentialType: profile.credentialType || 'password', updatedAt: new Date().toISOString() }, { merge: true });
          }
        } catch (_) {}
        SafeStorage.setItem('aviario_sess', JSON.stringify({ user: profile, farmId: profile.farmId }));
        this._setSession(profile, profile.farmId, true);
        return profile;
      },
  signupAdmin: async function() {
        if (this.authBusy) return;
        this.signupError = '';
        var recoveryMode = this.profileRecoveryMode === true;
        var name = String(this.suNome || '').trim();
        var farmName = String(this.suFarmName || '').trim();
        var username = this.normalizeUsername ? this.normalizeUsername(this.suUsername) : String(this.suUsername || '').trim().toLowerCase();
        var email = String(this.suEmail || '').trim().toLowerCase();
        var secret = String(this.suSenha || '').trim();
        var confirmSecret = String(this.suSenhaConfirm || '').trim();
        var credentialType = /^\d{4,8}$/.test(secret) ? 'pin' : 'password';
        if (!name || !farmName || !username || !email || !secret || !confirmSecret) { this.signupError = 'Preencha nome, exploração, nome de utilizador, e-mail e a sua credencial.'; return; }
        if (secret !== confirmSecret) { this.signupError = 'A confirmação da credencial não coincide.'; return; }
        if (credentialType === 'pin' && !/^\d{4,8}$/.test(secret)) { this.signupError = 'O PIN deve conter entre 4 e 8 dígitos.'; return; }
        if (credentialType === 'password' && secret.length < 6) { this.signupError = 'A palavra-passe deve ter pelo menos 6 caracteres.'; return; }
        if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) { this.signupError = 'O nome de utilizador deve ter 3–30 caracteres e usar letras, números, ponto, hífen ou sublinhado.'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.signupError = 'Introduza um endereço de e-mail válido para criar a conta no Firebase.'; return; }
        if (!navigator.onLine) { this.signupError = 'O primeiro cadastro precisa de Internet para criar a conta no Firebase.'; return; }
        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        if (!auth) { this.signupError = 'Firebase Authentication não está disponível.'; return; }
        this.authBusy = true;
        var farmId = 'farm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        try {
          var authEmail = email;
          var cloudSecret = this._cloudPasswordForSecret ? this._cloudPasswordForSecret(secret, credentialType) : secret;
          var db = this.getDb();
          if (!db) throw Object.assign(new Error('Firestore indisponível.'), { code: 'cloud/unavailable' });
          var authUser;
          if (recoveryMode) {
            var existingCredential = await auth.signInWithEmailAndPassword(authEmail, cloudSecret);
            authUser = existingCredential.user;
            if (!authUser || !authUser.uid) throw Object.assign(new Error('Firebase não devolveu o UID.'), { code: 'auth/not-ready' });
            var profileSnapshot = await db.collection('users').doc(authUser.uid).get();
            if (profileSnapshot.exists) throw Object.assign(new Error('Já existe um perfil para esta conta.'), { code: 'profile/already-exists' });
            var emailIdentifier = await db.collection('loginIdentifiers').doc(this._loginIdentifierKey(authEmail, 'email')).get();
            var usernameIdentifier = await db.collection('loginIdentifiers').doc(username).get();
            if (emailIdentifier.exists || usernameIdentifier.exists) throw Object.assign(new Error('Esta conta já está associada a uma exploração.'), { code: 'profile/recovery-linked' });
          } else {
            var credential = await auth.createUserWithEmailAndPassword(authEmail, cloudSecret);
            authUser = credential.user;
          }
          if (!authUser || !authUser.uid) throw Object.assign(new Error('Firebase não devolveu o UID.'), { code: 'auth/not-ready' });
          var profile = await this._completeFirstAdminRegistration(authUser, { farmId, name, farmName, username, email, authEmail, credentialType }, recoveryMode);
          if (!recoveryMode) {
            this.lastGeneratedAccess = { username: username, accessCode: this.generateAccessCode ? this.generateAccessCode() : ('AIP-' + Date.now().toString().slice(-6)), email: email, authEmail: authEmail, credential: secret, credentialType: credentialType, roleType: 'super_admin', nome: name, phone: '' };
            this.shareText = 'ACESSO AO AVIÁRIO INTELIGENTE PRO\n\n' + farmName + '\n\nUtilizador: ' + username + '\n' + (email ? 'E-mail: ' + email + '\n' : '') + (credentialType === 'pin' ? 'PIN inicial: ' : 'Palavra-passe inicial: ') + secret + '\n\nNo primeiro acesso, altere a credencial no seu perfil.';
          }
          this._setSession(profile, farmId, true);
          this.authBusy = false; this.showSignup = false; this.profileRecoveryMode = false; this.profileRecoveryAvailable = false; this.goTo('dashboard');
          this.toast(recoveryMode ? 'Perfil recuperado e nova exploração criada.' : 'Conta criada. Os dados do primeiro acesso estão visíveis para partilhar.');
          this.speak('Bem-vindo, ' + (profile.nome || name) + '.');
          this.listenFarm(farmId);
        } catch (e) {
          if (recoveryMode) { try { if (auth.currentUser) await auth.signOut(); } catch (_) {} }
          this.authBusy = false;
          this._logFirebaseAuthError('signup', e);
          this.signupError = this._friendlyAuthError(e);
        }
      },
  hasRole: function(role) {
        if (!this.currentUser) return false;
        var roles = Array.isArray(this.currentUser.roles) && this.currentUser.roles.length ? this.currentUser.roles : [this.currentUser.roleType];
        return roles.indexOf(role) !== -1;
      },
  isSuperAdmin: function() {
        return this.hasRole('super_admin');
      },
  isAdmin: function() {
        return this.isSuperAdmin() || this.hasRole('admin');
      },
  userRoleBadge: function(roleType) {
        if (roleType === 'super_admin') return { label: ' Super Admin', class: 'badge-info' };
        if (roleType === 'admin') return { label: ' Gestor', class: 'badge-warning' };
        if (roleType === 'seller') return { label: ' Vendedor', class: 'badge-normal' };
        return { label: ' Funcionário', class: 'badge-normal' };
      },
  editStaffAccess: function(user) {
        if (!user || !this.isAdmin()) return;
        if (user.roleType === 'super_admin' && !this.isSuperAdmin()) {
          this.toast('Não pode alterar o Super Admin.', 'error'); return;
        }
        this.editingAccessUser = user;
        this.accessEditRoleType = user.roleType || 'employee';
        this.accessEditStatus = user.status || 'active';
      },
  saveStaffAccess: async function() {
        var u = this.editingAccessUser;
        if (!u || this.authBusy) return;
        if (u.roleType === 'super_admin' && !this.isSuperAdmin()) { this.toast('Sem permissão.', 'error'); return; }
        if (this.accessEditRoleType === 'admin' && !this.isSuperAdmin()) { this.toast('Apenas o Super Admin pode atribuir Administrador.', 'error'); return; }
        var db = this.getDb();
        var auth = window.getFirebaseAuth ? window.getFirebaseAuth() : null;
        if (!db || !auth || !auth.currentUser) { this.toast('Firebase não está disponível.', 'error'); return; }

        var oldRole = u.roleType;
        u.roleType = this.accessEditRoleType;
        u.roles = u.roleType === 'super_admin' ? ['super_admin','admin'] : (u.roleType === 'seller' ? ['employee','seller'] : [u.roleType]);
        u.role = this.roleDisplayName(u.roleType);
        u.status = this.accessEditStatus;
        u.credentialType = 'password';
        this.authBusy = true;
        this.operationBusy = true;
        this.operationLabel = 'A actualizar a conta…';
        this.operationStep = '1/1';
        try {
          // A alteração de palavra-passe feita pelo próprio utilizador continua
          // no perfil. O administrador altera aqui os dados administrativos
          // (função/estado) e nunca grava palavras-passe no Firestore.
          var batch = db.batch();
          var profileData = { roleType: u.roleType, roles: u.roles, role: u.role, status: u.status, credentialType: 'password', updatedAt: new Date().toISOString() };
          batch.set(db.collection('users').doc(u.uid || u._authUid || u.id), profileData, { merge: true });
          batch.set(db.collection('farms').doc(u.farmId || this.currentFarmId).collection('staff').doc(u.uid || u._authUid || u.id), profileData, { merge: true });
          await batch.commit();
          this.logAudit('ALTERAR_ACESSO', 'Alterado acesso de ' + (u.email || u.name || u.nome));
          this.persistFarm();
          this.editingAccessUser = null;
          this.authBusy = false;
          this.operationBusy = false;
          this.operationLabel = '';
          this.operationStep = '';
          this.toast('Dados da conta actualizados. A palavra-passe do utilizador é alterada pelo próprio no seu perfil.');
        } catch (e) {
          this.operationBusy = false;
          this.operationLabel = '';
          this.operationStep = '';
          u.roleType = oldRole;
          u.roles = oldRole === 'seller' ? ['employee','seller'] : [oldRole];
          u.role = this.roleDisplayName(oldRole);
          this.authBusy = false;
          this._logFirebaseAuthError('staff-update', e);
          this.toast(this._friendlyCloudError ? this._friendlyCloudError(e) : 'Não foi possível actualizar a conta.', 'error');
        }
      },
};
