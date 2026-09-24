# Correcção final — Download da factura

## Problema encontrado
O gerador anterior tentava converter a pré-visualização HTML da factura para SVG usando `foreignObject`. O Edge/Chromium pode recusar essa renderização, produzindo:

> Não foi possível gerar a factura: O navegador não conseguiu renderizar a pré-visualização da factura.

## Correcção
O fluxo foi alterado para utilizar `html2canvas` directamente sobre a própria pré-visualização DOM da factura.

Fluxo agora:

Pré-visualização da factura no sistema
→ clone controlado da mesma factura
→ html2canvas
→ imagem da factura
→ PDF A4
→ download automático

Não existe mais uma segunda factura desenhada em SVG para o download.

## Logo
O logo que aparece na factura é preservado no render da factura. A regra continua:

1. logo configurado pela empresa;
2. se não existir, logo padrão do sistema.

## Impressão
A impressão continua a utilizar a pré-visualização da factura, sem criar outro layout.

## Responsividade
Mantidas as regras para adaptar modal, texto, tabela, botões e factura a ecrãs pequenos.

## Dependência nova
Foi adicionada `html2canvas ^1.4.1` ao `package.json`. É necessário executar `npm install` antes do próximo `npm run build`.

## Validação
`node --check` passou para `src/services/pdf.js` e `src/app/methods_ops_exports.js`.
O `npm install` não terminou dentro do limite desta execução; portanto o build completo não foi declarado como validado.
