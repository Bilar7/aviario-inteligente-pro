# PWA — Aviário Inteligente Pro

## O que foi preparado
- Web App Manifest em `public/manifest.json`.
- Service Worker em `public/sw.js` com cache do shell e fallback offline.
- Registo automático do Service Worker apenas em produção.
- Botão de instalação nativa aparece no cabeçalho quando o navegador disponibiliza `beforeinstallprompt`.
- Suporte de instalação pelo navegador em HTTPS/GitHub Pages.
- `start_url` e `scope` relativos (`./`) para funcionar também em repositórios GitHub Pages com subpasta.
- Ícones PWA reais em 192x192, 512x512 e Apple Touch Icon 180x180.
- Manifesto configurado para `standalone`, para abrir como aplicação sem a barra normal do navegador quando instalado.

## Como o utilizador instala
### Android / Chrome / Edge
Abrir o endereço HTTPS publicado e usar o botão de instalação do cabeçalho quando aparecer, ou o menu do navegador > Instalar aplicação.

### iPhone / iPad
No Safari: Partilhar > Adicionar ao Ecrã Principal.

### Windows / Edge / Chrome
Abrir o site HTTPS e escolher Instalar aplicação / Instalar Aviário Pro no menu do navegador. Depois a aplicação abre numa janela própria.

## Nota
A instalação PWA não exige Node.js no dispositivo do utilizador. Node/npm são necessários apenas durante o desenvolvimento/build do projecto.
