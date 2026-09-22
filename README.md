# Aviário Inteligente Pro

Sistema profissional de gestão avícola para produção, vendas, stock, finanças, relatórios e equipa.

## Acesso local

1. Execute `iniciar-aviario.bat`.
2. Abra `http://127.0.0.1:5641/`.

## Firebase

O sistema utiliza Firebase Authentication para contas e autenticação por e-mail + palavra-passe e Firestore para os dados da aplicação.

## Estrutura

- `src/app/` — estado e regras da aplicação
- `src/services/` — Firebase, exportações, PDF e armazenamento
- `src/views/` — interface
- `src/styles/` — estilos
- `public/` — recursos públicos

## Publicação

O projecto está preparado para gerar uma build de produção com `npm run build` e ser publicado num serviço compatível com aplicações Vite.

## Versão

1.0.0 — versão de lançamento do Aviário Inteligente Pro.
