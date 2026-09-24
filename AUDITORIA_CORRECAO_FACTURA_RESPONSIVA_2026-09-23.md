# Auditoria — Factura, PDF, impressão e responsividade — 23/09/2026

## Problemas encontrados
- O gerador de PDF tentava transformar a factura DOM em SVG através de `data:image/svg+xml`, uma abordagem que pode ser recusada pelo Edge/Chromium em documentos maiores com `foreignObject`.
- A responsividade existente não cobria de forma suficiente cartões, tipografia fluida e o modal da factura em ecrãs muito pequenos.
- A impressão já usava a pré-visualização, mas o caminho de download precisava de uma alternativa robusta.

## Correcções
- Troca de `data:` SVG por `Blob URL` para renderização da mesma pré-visualização.
- Limpeza segura da URL temporária após `onload`/`onerror`.
- Mensagem de erro orienta para `Imprimir > Guardar como PDF` sem inventar outro layout.
- Tipografia, cartões, botões, inputs, grids e modais passam a usar dimensões fluidas em mobile.
- Factura mantém a tabela com scroll interno quando necessário, sem criar scroll horizontal na página inteira.
- Modal da factura adapta-se a 360/430/767px.
- Menu lateral e conteúdo principal mantêm scrolls independentes.

## Validação
- Verificação de sintaxe JavaScript executada após as alterações.
- Build deve ser executado na máquina do projecto após `npm install`, pois `node_modules` não é incluído neste ZIP.
