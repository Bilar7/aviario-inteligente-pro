const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCJwxA-0yIT2sZm8Y-QlINQKkA961sIiXo',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'aviario-inteligente-pro.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'aviario-inteligente-pro',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'aviario-inteligente-pro.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '44357764376',
  appId: env.VITE_FIREBASE_APP_ID || '1:44357764376:web:2b9f3a2ad438a86769ca6d',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-QLZ9KCTZYC'
};

export const firestoreDatabaseId = env.VITE_FIREBASE_DATABASE_ID || 'default';
