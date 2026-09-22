# Publicacao online — Aviario Inteligente Pro

## GitHub Pages

Esta aplicacao deve ser publicada pelo **GitHub Actions**, usando a pasta `dist/` criada pelo Vite.

No GitHub:

1. Abra o repositorio `aviario-inteligente-pro`.
2. Va a **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **GitHub Actions**.
4. Va a **Actions** e abra `Publicar Aviario Inteligente Pro`.
5. Execute `Run workflow` ou faca um novo push para `main`.
6. Espere o workflow terminar com sucesso.

O utilizador final deve receber apenas o link publicado. Nao deve abrir `src/main.js` nem os ficheiros-fonte diretamente.

## Erro importante a evitar

Se o navegador mostrar:

`Failed to resolve module specifier "alpinejs"`

ou se `/assets/icon-192.png` der 404, o GitHub esta a servir o **codigo-fonte**, e nao o `dist/` construido. Nessa situacao, volte a **Settings → Pages → Source → GitHub Actions** e publique novamente pelo workflow.

A versao publicada corretamente transforma o import `alpinejs` num ficheiro do bundle e copia os icones para `dist/assets/`.
