# Publicação — Aviário Inteligente Pro

## Preparação

```bash
npm install
npm run build
```

A pasta `dist/` é o resultado da publicação.

## Firebase

O projecto usa o Firebase configurado em `src/services/firebase-config.js` e no `.env` quando forem fornecidas variáveis `VITE_FIREBASE_*`.

Antes de publicar, confirme no Firebase Authentication que o acesso por e-mail e palavra-passe está activo e que o domínio de produção está autorizado.

## Desenvolvimento local

Use `iniciar-aviario.bat` e a porta 5641.
