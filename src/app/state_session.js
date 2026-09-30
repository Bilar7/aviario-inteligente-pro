// Estado do módulo: session
export const state = {
  cloudStatus: 'ready',
  cloudLastSyncAt: 0,
  cloudLastSyncError: '',
  _isCloudSynced: false,

  // Sessão e Identificação
      currentUser: null,
  currentFarmId: 'farm_principal',
  db: null,
  isCloudLoaded: false,
  _farmUnsubscribe: null,
  _persistTimeout: null,
  syncBusy: false,
  _localDataUpdatedAt: 0,
  _autoSyncTimer: null,
  _firebaseAuthReadyPromise: null,
  _resolveFirebaseAuthReady: null,
  _firebaseAuthReadyResolved: false,
  _firebaseAuthUser: null,
  _localSessionProvisional: false,
  _intentionalLogout: false,
  _cloudOutbox: [],
  _cloudOutboxBusy: false,
  _farmUnsubscribes: [],
  _profileLoadPromises: {},
};
