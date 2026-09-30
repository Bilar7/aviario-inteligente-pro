const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBYo282UmcHzr4DdrihKy8XzGyaAQ184oA',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'aviario-inteligente-ofic-df9b0.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'aviario-inteligente-ofic-df9b0',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'aviario-inteligente-ofic-df9b0.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '528447820620',
  appId: env.VITE_FIREBASE_APP_ID || '1:528447820620:web:ad17d8d281523ff3cb35e9'
};
