# AUDITORIA FINAL — DOCUMENTOS, LOGOTIPO, EXPORTAÇÕES E SCROLL

Data: 2026-09-23

## Resultado

Foi feita uma nova auditoria do ZIP `Aviario_Inteligente_Pro_V1_0_DOCUMENTOS_LOGO_EXATO.zip`.

### 1. Factura
- A pré-visualização da factura é a origem do PDF.
- O PDF não usa mais um segundo desenho/vector de factura separado.
- O PDF é uma captura/renderização da própria factura apresentada no sistema.
- A impressão usa a mesma pré-visualização.
- O cabeçalho contém o logotipo da empresa.
- Quando não existe logo configurado, usa `./assets/aviario-inteligente-pro-logo.png`.
- Foi acrescentado fallback para o logo padrão caso a imagem personalizada falhe no carregamento da pré-visualização.
- A área de acções (`Imprimir` / `Baixar PDF`) não aparece no documento impresso/PDF.
- O cabeçalho técnico do modal também não aparece na impressão/PDF.

### 2. PDFs de relatórios
- Existe um único gerador principal para relatórios: `generateProfessionalAviarioPDF`.
- O logo é resolvido por uma função única `pdfBrandLogo()`.
- Primeiro tenta o logo configurado pela empresa.
- Se falhar, tenta automaticamente o logo padrão do sistema.
- A identidade da empresa permanece nos documentos.

### 3. Excel
Foram encontrados três pontos de escrita Excel e foram centralizados:
- relatório consolidado;
- gestão financeira;
- Controlo do Dia.

Os métodos de Financeiro e Controlo do Dia já não possuem a implementação própria de `XLSX.writeFile`.
Eles chamam funções do serviço `src/services/exports.js`.

Todos os três livros recebem a folha `00_Perfil_Empresa` com a identidade empresarial.

Nota técnica: a biblioteca `xlsx` actualmente usada pelo projecto não incorpora a imagem PNG do logotipo dentro das células do Excel. Por isso, a identidade no Excel é textual/metadados; PDFs e impressão usam a imagem real.

### 4. Impressão
Existe apenas uma chamada `window.print()` no projecto e ela é usada pela factura.
A regra de impressão foi reforçada para remover o fundo/modal e imprimir apenas o documento.

### 5. Código duplicado/antigo
- Removida a implementação Excel duplicada do módulo financeiro.
- Removida a implementação Excel duplicada do Controlo do Dia.
- Mantido um único serviço para as três exportações Excel.
- Mantido um único gerador de relatório PDF.
- Mantido um único gerador de factura PDF.
- Não foi encontrado um segundo gerador antigo de factura no código auditado.

### 6. Scroll independente
O CSS já contém áreas de scroll independentes:
- `.app-sidebar` → scroll vertical próprio;
- `.app-content` → scroll vertical próprio;
- `html/body` bloqueados no eixo da aplicação;
- `overscroll-behavior: contain` para impedir que o scroll do menu arraste a página principal.

### 7. Verificação JavaScript
Passaram:
- `src/services/exports.js`
- `src/app/methods_finance_actions.js`
- `src/app/methods_day.js`
- `src/app/methods_ops_exports.js`
- `src/services/pdf.js`
- `src/main.js`

Resultado: `ALL_JS_CHECK_OK`

### 8. Limitação da auditoria
O ZIP não contém `node_modules` e a instalação de dependências (`npm install --no-audit --no-fund`) excedeu o tempo disponível nesta execução. Portanto, o `npm run build` não pôde ser executado nesta auditoria.

Isso significa que a verificação de sintaxe JavaScript passou, mas o build completo ainda precisa ser executado no ambiente de desenvolvimento com as dependências instaladas.
