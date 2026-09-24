# Auditoria — Factura profissional e PDF

## Problema encontrado
O PDF anterior estava visualmente desestruturado: elementos do cabeçalho, tabela e informação financeira apareciam sobrepostos.

## Causa técnica
A rotina de captura clonava a factura, removia elementos e depois aplicava estilos computados por posição dos filhos. Ao remover o primeiro filho antes da cópia, os estilos podiam ser aplicados aos elementos errados. Isso podia deslocar cabeçalho, tabela e blocos financeiros.

## Correcção
- A factura foi reconstruída como uma única folha documental (`.invoice-sheet`).
- O PDF agora captura directamente essa folha.
- O código antigo baseado em SVG/foreignObject foi eliminado da geração da factura.
- A função de cópia de estilos por posição foi eliminada.
- O PDF não cria uma segunda factura com layout diferente.
- A folha contém cabeçalho, número/data, cliente, lote/produto, tabela, pagamento, total, emitido por, assinatura e rodapé.
- O logo configurado pela empresa continua a ser usado; se não existir, permanece o logo padrão do sistema.
- Impressão e PDF usam a mesma folha documental.
- O layout foi preparado para desktop, tablet e telemóvel.

## Validação realizada
- `node --check src/services/pdf.js` — OK
- `node scripts/smoke-test.mjs` — OK
- Pesquisa de lógica antiga `foreignObject`, `data:image/svg`, `copyComputedStyles` no código activo — removida; apenas comentário explicativo permanece.
- `npm install --no-audit --no-fund` não terminou dentro do limite de execução desta sessão; por isso o `npm run build` não foi declarado como validado nesta entrega.
