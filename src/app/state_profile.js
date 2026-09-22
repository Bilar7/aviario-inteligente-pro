// Estado do módulo: profile
export const state = {
  // Form Perfil
      profNome: '',
  profTelefone: '',
  profUsername: '',
  profSenha: '',
  profSenhaConfirm: '',
  profSenhaAtual: '',
  profCredentialType: 'password',
  profPin: '',
  profPinConfirm: '',
  sharingUser: null,
  shareText: '',
  lastGeneratedAccess: null,
  voiceGender: 'feminina',
  showVoiceSettings: false,
  // Visibilidade das credenciais (um controlo por campo)
      showProfConfirmCredential: false,
  showStaffConfirmCredential: false,
};
