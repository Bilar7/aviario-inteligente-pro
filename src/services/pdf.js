function cp1252Bytes(value) {
  var map = {
    '€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,
    '‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159,
    ' ':32,'¡':161,'¢':162,'£':163,'¤':164,'¥':165,'¦':166,'§':167,'¨':168,'©':169,'ª':170,'«':171,'¬':172,
    '®':174,'¯':175,'°':176,'±':177,'²':178,'³':179,'´':180,'µ':181,'¶':182,'·':183,'¸':184,'¹':185,'º':186,
    '»':187,'¼':188,'½':189,'¾':190,'¿':191,'À':192,'Á':193,'Â':194,'Ã':195,'Ä':196,'Å':197,'Æ':198,'Ç':199,
    'È':200,'É':201,'Ê':202,'Ë':203,'Ì':204,'Í':205,'Î':206,'Ï':207,'Ð':208,'Ñ':209,'Ò':210,'Ó':211,'Ô':212,
    'Õ':213,'Ö':214,'×':215,'Ø':216,'Ù':217,'Ú':218,'Û':219,'Ü':220,'Ý':221,'Þ':222,'ß':223,'à':224,'á':225,
    'â':226,'ã':227,'ä':228,'å':229,'æ':230,'ç':231,'è':232,'é':233,'ê':234,'ë':235,'ì':236,'í':237,'î':238,
    'ï':239,'ð':240,'ñ':241,'ò':242,'ó':243,'ô':244,'õ':245,'ö':246,'÷':247,'ø':248,'ù':249,'ú':250,'û':251,
    'ü':252,'ý':253,'þ':254,'ÿ':255
  };
  var out=[];
  for (var i=0;i<value.length;i++) {
    var cp=value.charCodeAt(i);
    if (cp < 128) out.push(cp);
    else if (map[value[i]] !== undefined) out.push(map[value[i]]);
    else out.push(63);
  }
  return new Uint8Array(out);
}

function concatBytes(parts) {
  var total=0;
  parts.forEach(function(p){ total += p.length; });
  var out=new Uint8Array(total), off=0;
  parts.forEach(function(p){ out.set(p,off); off += p.length; });
  return out;
}

function ascii(value) { return new TextEncoder().encode(String(value)); }
function pdfHex(value) {
  var bytes=cp1252Bytes(String(value || ''));
  var h='';
  for (var i=0;i<bytes.length;i++) h += bytes[i].toString(16).padStart(2,'0');
  return '<'+h.toUpperCase()+'>';
}

function safePdfText(value, fallback) {
  return String(value === undefined || value === null || value === '' ? (fallback || '') : value)
    .replace(/\r?\n/g,' ');
}

function pdfMoney(value) {
  return Number(value || 0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' MT';
}

function pdfWrap(text, maxChars) {
  var words=safePdfText(text,'').split(/\s+/), lines=[], line='';
  words.forEach(function(word){
    if (!word) return;
    if ((line+' '+word).trim().length > maxChars && line) { lines.push(line); line=word; }
    else line=(line+' '+word).trim();
  });
  if (line || !lines.length) lines.push(line);
  return lines;
}

function pdfDrawText(ops, x, y, size, text, bold, rgb) {
  var c=rgb||[0,0,0];
  ops.push(c[0].toFixed(3)+' '+c[1].toFixed(3)+' '+c[2].toFixed(3)+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x.toFixed(2)+' '+y.toFixed(2)+' Td '+pdfHex(text)+' Tj ET');
}

function pdfDrawRule(ops, x1, y1, x2, y2, width) {
  ops.push((width||0.7)+' w '+x1.toFixed(2)+' '+y1.toFixed(2)+' m '+x2.toFixed(2)+' '+y2.toFixed(2)+' l S');
}

function pdfFillRect(ops, x, y, w, h, rgb) {
  var c=rgb||[0.16,0.19,0.18];
  ops.push(c[0].toFixed(3)+' '+c[1].toFixed(3)+' '+c[2].toFixed(3)+' rg '+x.toFixed(2)+' '+y.toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)+' re f');
}

function pdfSetFill(ops, rgb) { var c=rgb||[0,0,0]; ops.push(c[0].toFixed(3)+' '+c[1].toFixed(3)+' '+c[2].toFixed(3)+' rg'); }


function hexRgb(value, fallback) {
  var v=String(value||'').trim();
  if(/^#[0-9a-f]{6}$/i.test(v)){
    return [parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];
  }
  return fallback||[0.16,0.19,0.18];
}

function mixRgb(a,b,ratio){
  var r=Math.max(0,Math.min(1,Number(ratio)||0));
  return [a[0]*(1-r)+b[0]*r,a[1]*(1-r)+b[1]*r,a[2]*(1-r)+b[2]*r];
}

function pdfStrokeRect(ops, x, y, w, h, rgb, width) {
  var c=rgb||[0.78,0.85,0.82];
  ops.push(c[0].toFixed(3)+' '+c[1].toFixed(3)+' '+c[2].toFixed(3)+' RG '+(width||0.6)+' w '+x.toFixed(2)+' '+y.toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)+' re S');
}

function pdfImageData(dataUrl) {
  if (!dataUrl || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise(function(resolve){
    try {
      var img=new Image();
      img.onload=function(){
        try {
          var canvas=document.createElement('canvas');
          var scale=Math.min(1, 700/Math.max(img.naturalWidth||1,img.naturalHeight||1));
          canvas.width=Math.max(1,Math.round((img.naturalWidth||1)*scale));
          canvas.height=Math.max(1,Math.round((img.naturalHeight||1)*scale));
          var ctx=canvas.getContext('2d');
          ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          var jpeg=canvas.toDataURL('image/jpeg',0.9);
          var b64=jpeg.split(',')[1]||'';
          var bin=atob(b64), bytes=new Uint8Array(bin.length);
          for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
          resolve({bytes:bytes,width:canvas.width,height:canvas.height});
        } catch(e){ resolve(null); }
      };
      img.onerror=function(){ resolve(null); };
      img.src=dataUrl;
    } catch(e){ resolve(null); }
  });
}

function buildPdfDocument(pages, imageRefs) {
  var objects=[];
  function obj(body){ objects.push({type:'text',body:body}); return objects.length; }
  function stream(streamBytes, extra){ objects.push({type:'stream',body:streamBytes,extra:extra||''}); return objects.length; }
  var catalogId=obj('');
  var pagesId=obj('');
  var fontId=obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  var boldFontId=obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  var imageIds={};
  Object.keys(imageRefs||{}).forEach(function(key){
    var im=imageRefs[key];
    imageIds[key]=stream(im.bytes,'<< /Type /XObject /Subtype /Image /Width '+im.width+' /Height '+im.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+im.bytes.length+' >>');
  });
  var pageIds=[];
  pages.forEach(function(page){
    var contentId=stream(new TextEncoder().encode(page.ops.join('\n')+'\n'),'<< /Length '+ascii(page.ops.join('\n')+'\n').length+' >>');
    var xo='';
    if (imageIds.logo) xo += '/ImLogo '+imageIds.logo+' 0 R ';
    if (imageIds.signature) xo += '/ImSig '+imageIds.signature+' 0 R ';
    var res='<< /Font << /F1 '+fontId+' 0 R /F2 '+boldFontId+' 0 R >>'+(xo?' /XObject << '+xo+'>>':'')+' >>';
    pageIds.push(obj('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 595 842] /Resources '+res+' /Contents '+contentId+' 0 R >>'));
  });
  objects[pagesId-1].body='<< /Type /Pages /Kids ['+pageIds.map(function(id){return id+' 0 R';}).join(' ') +'] /Count '+pageIds.length+' >>';
  objects[catalogId-1].body='<< /Type /Catalog /Pages '+pagesId+' 0 R >>';

  var parts=[ascii('%PDF-1.4\n%AVIARIO-PRO\n')];
  var offsets=[0], current=parts[0].length;
  objects.forEach(function(o,idx){
    var id=idx+1;
    offsets[id]=current;
    var head=ascii(id+' 0 obj\n'); parts.push(head); current+=head.length;
    if(o.type==='stream'){
      var eh=ascii(o.extra+'\nstream\n'); parts.push(eh); current+=eh.length;
      parts.push(o.body); current+=o.body.length;
      var tail=ascii('\nendstream\nendobj\n'); parts.push(tail); current+=tail.length;
    } else {
      var body=ascii(o.body+'\nendobj\n'); parts.push(body); current+=body.length;
    }
  });
  var xrefStart=current;
  var xref='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(var i=1;i<=objects.length;i++) xref += String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref += 'trailer\n<< /Size '+(objects.length+1)+' /Root '+catalogId+' 0 R >>\nstartxref\n'+xrefStart+'\n%%EOF';
  parts.push(ascii(xref));
  return concatBytes(parts);
}

function firstArray(source, keys) {
  source=source||{};
  for (var i=0;i<keys.length;i++) {
    var value=source[keys[i]];
    if (Array.isArray(value) && value.length) return value;
  }
  for (var j=0;j<keys.length;j++) {
    var empty=source[keys[j]];
    if (Array.isArray(empty)) return empty;
  }
  return [];
}

function normalizePdfData(input) {
  var root=input||{};
  var sources=[root,root.data,root.farmData,root.payload].filter(function(v){ return v && typeof v==='object'; });
  function pick(keys){
    for(var i=0;i<sources.length;i++){
      var a=firstArray(sources[i],keys);
      if(a.length) return a;
    }
    return [];
  }
  var out=Object.assign({},root);
  out.settings=root.settings || (root.data&&root.data.settings) || (root.farmData&&root.farmData.settings) || {};
  out.lotes=pick(['lotes','lots','batches']);
  out.sales=pick(['sales','vendas']);
  out.mortalityLogs=pick(['mortalityLogs','mortality','mortalidade','mortes']);
  out.feedLogs=pick(['feedLogs','feed','racao','alimentacao']);
  out.clients=pick(['clients','clientes']);
  out.expenses=pick(['expenses','despesas']);
  out.receipts=pick(['receipts','recebimentos','payments','pagamentos']);
  out.stockItems=pick(['stockItems','stock','estoque','inventario']);
  out.healthLogs=pick(['healthLogs','health','saude','vaccinations','vacinacoes']);
  out.attendance=pick(['attendance','presenca','ponto']);
  out.energyLogs=pick(['energyLogs','energy','energia']);
  out.suppliers=pick(['suppliers','fornecedores']);
  out.notifications=pick(['notifications','notificacoes']);
  out.cashTransactions=pick(['cashTransactions','cashLogs','cashEntries','movimentosCaixa','extrato']);
  out.priceTable=pick(['priceTable','prices','precos','tabelaPrecos']);
  out.alerts=pick(['alerts','alertas']);
  out.agenda=pick(['agenda','tasks','tarefas']);
  // Secure collections can also arrive as nested objects in an export payload.
  if(!out.sales.length && Array.isArray(root.salesSecure)) out.sales=root.salesSecure;
  if(!out.expenses.length && Array.isArray(root.expensesSecure)) out.expenses=root.expensesSecure;
  if(!out.receipts.length && Array.isArray(root.receiptsSecure)) out.receipts=root.receiptsSecure;
  return out;
}

export function generateProfessionalAviarioPDF(farmData, title) {
  farmData=normalizePdfData(farmData);
  var settings=farmData.settings||{};
  var k=farmData.kpis||{};
  var arrays={
    sales:Array.isArray(farmData.sales)?farmData.sales:[],
    lotes:Array.isArray(farmData.lotes)?farmData.lotes:[],
    feed:Array.isArray(farmData.feedLogs)?farmData.feedLogs:[],
    mortality:Array.isArray(farmData.mortalityLogs)?farmData.mortalityLogs:[],
    clients:Array.isArray(farmData.clients)?farmData.clients:[],
    expenses:Array.isArray(farmData.expenses)?farmData.expenses:[],
    receipts:Array.isArray(farmData.receipts)?farmData.receipts:[],
    stock:Array.isArray(farmData.stockItems)?farmData.stockItems:[],
    health:Array.isArray(farmData.healthLogs)?farmData.healthLogs:[],
    attendance:Array.isArray(farmData.attendance)?farmData.attendance:[],
    energy:Array.isArray(farmData.energyLogs)?farmData.energyLogs:[],
    suppliers:Array.isArray(farmData.suppliers)?farmData.suppliers:[],
    notifications:Array.isArray(farmData.notifications)?farmData.notifications:[],
    cashTransactions:Array.isArray(farmData.cashTransactions)?farmData.cashTransactions:[],
    priceTable:Array.isArray(farmData.priceTable)?farmData.priceTable:[]
  };
  var finance=farmData.financeSummary||{};
  var projection=farmData.financeProjection||{};
  var alerts=Array.isArray(farmData.alerts)?farmData.alerts:[];
  var agenda=Array.isArray(farmData.agenda)?farmData.agenda:[];
  var company=safePdfText(settings.companyLegalName||settings.farmName,'Aviário Inteligente Pro');
  var subtitle=safePdfText(settings.companySubtitle||settings.tagline,'Gestão Avícola');
  var meta=[settings.companyAddress||settings.location,settings.phone,settings.companyEmail].filter(Boolean).join(' · ');
  var neutralDark=[0.12,0.16,0.15];
  var neutralSoft=[0.965,0.975,0.97];
  var pages=[], page={ops:[],y:795};
  var logoPromise=pdfImageData(settings.companyLogo || './assets/icon-192.png');
  var sigPromise=pdfImageData(settings.signatureImage||'');
  function newPage(){ pages.push(page); page={ops:[],y:795}; }
  function ensure(h){ if(page.y-h<45) newPage(); }
  function text(text,size,bold){
    var lines=pdfWrap(text, Math.max(28,Math.floor(535/(size*0.5))));
    lines.forEach(function(line){ ensure(size+5); pdfDrawText(page.ops,40,page.y,size,line,bold); page.y-=size+4; });
  }
  function heading(t){ ensure(32); page.y-=3; pdfSetFill(page.ops,neutralDark); pdfDrawText(page.ops,40,page.y,15,t,true); pdfSetFill(page.ops,[0,0,0]); page.y-=8; pdfFillRect(page.ops,40,page.y,515,3,brand); page.y-=12; }
  function kv(label,value){ ensure(20); pdfDrawText(page.ops,40,page.y,9,label,true); pdfDrawText(page.ops,180,page.y,9,safePdfText(value,'—'),false); page.y-=15; }
  function table(headers,rows){
    var cols=headers.length, width=515/cols, x0=40;
    function drawHeader(){
      ensure(42);
      pdfFillRect(page.ops,40,page.y-5,515,23,neutralDark);
      pdfSetFill(page.ops,[1,1,1]);
      headers.forEach(function(h,i){ pdfDrawText(page.ops,x0+i*width,page.y+2,7.7,safePdfText(h,''),true,[1,1,1]); });
      pdfSetFill(page.ops,[0,0,0]);
      page.y-=31;
    }
    drawHeader();
    rows.forEach(function(r,rowIndex){
      var cells=r.map(function(v){return safePdfText(v,'—');});
      var wrapped=cells.map(function(v){return pdfWrap(v,Math.max(8,Math.floor(width/(6*0.48))));});
      var lines=Math.max.apply(null,wrapped.map(function(a){return a.length;}));
      var rowH=Math.max(17,lines*9+7);
      if(page.y-rowH<45){ pages.push(page); page={ops:[],y:795}; drawHeader(); }
      if(rowIndex%2===0) pdfFillRect(page.ops,40,page.y-rowH+8,515,rowH,neutralSoft);
      pdfStrokeRect(page.ops,40,page.y-rowH+8,515,rowH,[0.82,0.88,0.85],0.35);
      // O preenchimento do fundo da linha altera o estado gráfico do PDF.
      // Repor o texto a preto antes de desenhar as células evita que os dados
      // fiquem praticamente invisíveis sobre o fundo claro.
      pdfSetFill(page.ops,[0,0,0]);
      for(var li=0;li<lines;li++){
        wrapped.forEach(function(w,i){ pdfDrawText(page.ops,x0+i*width,page.y-li*9,7.15,w[li]||'',false); });
      }
      page.y-=rowH;
    });
    if(!rows.length){
      ensure(30);
      pdfFillRect(page.ops,40,page.y-17,515,20,[0.97,0.98,0.98]);
      pdfDrawText(page.ops,48,page.y-4,8,'Nenhum registo disponível.',false);
      page.y-=28;
    }
  }
  function simpleList(label,items){ heading(label); if(!items.length) { text('Nenhum registo disponível.',9,false); return; } items.forEach(function(v){ text('• '+v,9,false); }); }

  // Capa personalizada: visual leve e editorial, com a identidade do aviário
  // em primeiro plano e os indicadores reais do sistema em cartões.
  var cover={ops:[],y:795,isCover:true};
  var brand=hexRgb(settings.brandColor || settings.primaryColor || '#10b981',[0.06,0.62,0.39]);
  var brandDark=mixRgb(brand,[0.05,0.09,0.08],0.70);
  var ink=[0.10,0.14,0.13], muted=[0.38,0.44,0.41], white=[1,1,1], paper=[0.985,0.99,0.987];
  pdfFillRect(cover.ops,0,0,595,842,paper);
  pdfFillRect(cover.ops,0,832,595,10,brand);
  pdfFillRect(cover.ops,40,92,515,650,[1,1,1]);
  pdfStrokeRect(cover.ops,40,92,515,650,[0.86,0.91,0.88],0.8);
  pdfFillRect(cover.ops,40,650,515,92,mixRgb(brand,white,0.91));
  pdfFillRect(cover.ops,40,92,6,558,brand);
  pdfDrawText(cover.ops,70,704,8,'DOCUMENTO PERSONALIZADO DA EXPLORAÇÃO',true,brandDark);
  pdfDrawText(cover.ops,70,668,25,company,true,ink);
  pdfDrawText(cover.ops,70,647,10,subtitle,true,brandDark);
  pdfDrawText(cover.ops,70,625,8,safePdfText(title,'Relatório de Gestão Avícola'),false,muted);
  pdfDrawText(cover.ops,70,608,8,'Emitido em '+new Date().toLocaleDateString('pt-PT'),false,muted);
  var coverCards=[
    ['AVES DISPONÍVEIS',String(k.remainingBirds||0)],
    ['RECEITA',pdfMoney(k.totalRevenue)],
    ['LUCRO LÍQUIDO',pdfMoney(k.netProfit)],
    ['MORTALIDADE',String(k.mortalityRate||0)+'%']
  ];
  coverCards.forEach(function(c,i){
    var cx=70+(i%2)*250, cy=505-Math.floor(i/2)*112;
    pdfFillRect(cover.ops,cx,cy,230,82,mixRgb(brand,white,0.94));
    pdfStrokeRect(cover.ops,cx,cy,230,82,mixRgb(brand,[0.82,0.88,0.85],0.45),0.6);
    pdfDrawText(cover.ops,cx+14,cy+58,7,c[0],true,muted);
    pdfDrawText(cover.ops,cx+14,cy+29,17,c[1],true,brandDark);
  });
  pdfDrawText(cover.ops,70,230,8,'DADOS REAIS REGISTADOS NO SISTEMA',true,brandDark);
  pdfDrawText(cover.ops,70,211,8,safePdfText(meta || 'Documento personalizado da exploração'),false,muted);
  pdfDrawText(cover.ops,70,190,8,safePdfText(settings.reportFooter || 'Emitido pelo Aviário Inteligente Pro.'),false,muted);
  pdfDrawText(cover.ops,70,130,8,'Gestão · Produção · Finanças · Operação',true,ink);
  pages.push(cover);

  // Cabeçalho das páginas internas: branco, elegante e reconhecível como parte do sistema.
  pdfFillRect(page.ops,0,785,595,57,white);
  pdfFillRect(page.ops,0,785,8,57,brand);
  pdfDrawText(page.ops,112,814,17,company,true,ink);
  pdfDrawText(page.ops,112,798,9,subtitle,true,brandDark);
  if(meta) pdfDrawText(page.ops,112,781,7.3,meta,false,muted);
  pdfDrawText(page.ops,430,814,7.5,'DOCUMENTO',true,brandDark);
  pdfDrawText(page.ops,430,799,7.5,safePdfText(title,'Relatório'),false,muted);
  pdfDrawText(page.ops,430,785,7.2,new Date().toLocaleDateString('pt-PT'),false,muted);
  pdfFillRect(page.ops,40,770,515,1.5,mixRgb(brand,white,0.15));
  page.y=744;
  if(settings.reportFooter) { pdfDrawText(page.ops,40,page.y,7.5,safePdfText(settings.reportFooter,''),false); page.y-=14; }

  heading('Resumo Executivo');
  [
    ['Aves disponíveis',k.remainingBirds||0],['Mortalidade',String(k.mortalityRate||0)+'%'],['Receita',pdfMoney(k.totalRevenue)],['Lucro líquido',pdfMoney(k.netProfit)],
    ['Saldo em caixa',pdfMoney(finance.saldoCaixa!=null?finance.saldoCaixa:k.cashBalance)],['A receber',pdfMoney(finance.totalAReceber!=null?finance.totalAReceber:k.accountsReceivable)]
  ].forEach(function(v){ kv(v[0],v[1]); });

  if (farmData.financeSummary) {
    heading('Resumo Financeiro');
    kv('Período',finance.periodo||farmData.finPeriod||'Actual');
    kv('Entradas',pdfMoney(finance.periodReceitas));
    kv('Saídas',pdfMoney(finance.periodDespesas));
    kv('Resultado',pdfMoney(finance.lucro));
    kv('Margem',String(Number(finance.margemLucro||0).toFixed(1))+'%');
    kv('A pagar',pdfMoney(finance.totalAPagar));
    heading('Métodos de Pagamento');
    var methodRows=Object.keys(finance.methods||{}).map(function(m){return [m,pdfMoney(finance.methods[m])];});
    table(['Método','Total'],methodRows);
    if(projection && (projection.revenue!=null || projection.profit!=null)){
      heading('Projecção de Gestão');
      kv('Receita projectada',pdfMoney(projection.revenue));
      kv('Custo projectado',pdfMoney(projection.costs));
      kv('Resultado projectado',pdfMoney(projection.profit));
      kv('Margem projectada',String(Number(projection.margin||0).toFixed(1))+'%');
      if(projection.targetDate) kv('Data estimada',projection.targetDate);
    }
  }

  heading('Vendas de Frangos');
  table(['Data','Cliente','Lote','Qtd.','Total','Pagamento','Estado'],arrays.sales.map(function(v){return [v.date,v.clientName||'Cliente',v.loteCode||'—',v.qty||0,pdfMoney(v.totalAmount),v.paymentMethod||'—',v.paymentStatus||((Number(v.debtAmount)||0)>0?'Pendente':'Pago')];}));
  heading('Lotes');
  table(['Código','Entrada','Raça','Inicial','Mortes','Restantes','Estado'],arrays.lotes.map(function(l){
    var deaths=Number(l.deaths);
    if(!Number.isFinite(deaths)) deaths=arrays.mortality.filter(function(m){return String(m.loteId||'')===String(l.id||'') || String(m.loteCode||'')===String(l.code||'');}).reduce(function(a,m){return a+(Number(m.qty)||0);},0);
    var sold=Number(l.soldBirds);
    if(!Number.isFinite(sold)) sold=arrays.sales.filter(function(v){return String(v.loteId||'')===String(l.id||'') || String(v.loteCode||'')===String(l.code||'');}).reduce(function(a,v){return a+(Number(v.qty)||0);},0);
    var initial=Number(l.initialBirds)||0;
    var rest=Math.max(0,initial-deaths-sold);
    return [l.code||l.id||'—',l.entryDate||l.date||'—',l.breed||l.lineage||'—',initial,deaths,rest,l.status||'Ativo'];
  }));
  heading('Ração & Alimentação');
  table(['Data','Lote','Movimento','Qtd. kg','Custo'],arrays.feed.map(function(f){return [f.date,f.loteCode||'Geral',f.movement||f.type||'',f.qtyKg||0,pdfMoney(f.totalCost)];}));
  heading('Mortalidade');
  table(['Data','Lote','Qtd.','Motivo'],arrays.mortality.map(function(m){return [m.date,m.loteCode,m.qty||0,m.reason||''];}));
  heading('Clientes & Dívidas');
  table(['Cliente','Contacto','Compras','Pago','Dívida'],arrays.clients.map(function(c){return [c.name,c.phone,pdfMoney(c.totalBought),pdfMoney(c.totalPaid),pdfMoney(c.debt)];}));
  heading('Despesas');
  table(['Data','Categoria','Descrição','Valor','Pagamento'],arrays.expenses.map(function(e){return [e.date,e.category,e.description||e.desc,pdfMoney(e.amount),e.paymentMethod||'—'];}));
  heading('Recebimentos');
  table(['Data','Cliente','Valor','Método','Referência'],arrays.receipts.map(function(r){return [r.date,r.clientName,pdfMoney(r.amount),r.paymentMethod||'—',r.referenceId||r.saleId||''];}));
  heading('Stock');
  table(['Item','Categoria','Qtd.','Unidade','Valor'],arrays.stock.map(function(s){return [s.name,s.category,s.qty||0,s.unit||'un',pdfMoney((Number(s.qty)||0)*(Number(s.unitPrice)||0))];}));
  heading('Saúde & Vacinação');
  table(['Data','Lote','Tipo','Produto','Qtd.','Próxima'],arrays.health.map(function(h){return [h.date,h.loteCode,h.type,h.product,h.quantity||h.qty||0,h.nextDate||''];}));
  heading('Presença & Equipa');
  table(['Data','Funcionário','Estado','Entrada','Saída'],arrays.attendance.map(function(a){return [a.date,a.staffName||a.name,a.status,a.checkIn,a.checkOut];}));
  heading('Extrato de Caixa');
  table(['Data','Tipo','Categoria','Descrição','Valor','Método'],arrays.cashTransactions.map(function(t){return [t.date,t.type,t.category,t.desc||t.description,pdfMoney(t.amount),t.paymentMethod||'—'];}));
  heading('Energia');
  table(['Data','Anterior','Actual','Consumo','Custo'],arrays.energy.map(function(e){return [e.date,e.previous||e.prev||e.prevReading||0,e.current||e.curr||e.currReading||0,e.consumption||e.kwh||0,pdfMoney(e.amount||e.cost)];}));
  heading('Fornecedores');
  table(['Fornecedor','Contacto','Categoria','Saldo/Obs.'],arrays.suppliers.map(function(s){return [s.name,s.phone||s.contact,s.category,s.balance!=null?pdfMoney(s.balance):(s.notes||'')];}));
  heading('Tabela de Preços');
  table(['Produto/Serviço','Unidade','Preço'],arrays.priceTable.map(function(p){return [p.name||p.product||p.label,p.unit||p.unitType,pdfMoney(p.price||p.amount)];}));
  simpleList('Alertas',alerts.map(function(a){return safePdfText(a.title||a.type)+' — '+safePdfText(a.detail||a.message);}));
  simpleList('Agenda',agenda.map(function(a){return safePdfText(a.date)+' — '+safePdfText(a.title)+': '+safePdfText(a.detail);}));
  heading('Informação da Empresa');
  kv('Empresa',company); kv('Actividade',subtitle); kv('Responsável',settings.signatureName||settings.ownerName||'—'); kv('Cargo',settings.signatureTitle||'—');
  text(settings.reportFooter||'Documento gerado automaticamente pelo Aviário Inteligente Pro.',8,false);
  if(settings.tagline && settings.tagline !== subtitle) text(settings.tagline,8,true);
  newPage();
  // Última página dedicada à assinatura, evitando que ela seja cortada em tabelas longas.
  heading('Assinatura e Validação');
  text('Responsável pela emissão: '+safePdfText(settings.signatureName||settings.ownerName,'Não configurado'),9,true);
  text('Cargo: '+safePdfText(settings.signatureTitle,'Responsável'),9,false);
  if(meta) text(meta,8,false);
  if(!settings.signatureImage) { page.y-=15; pdfDrawRule(page.ops,180,page.y,415,page.y,0.8); page.y-=14; text('Assinatura',8,false); }
  else { page.y-=30; text('Assinatura digital configurada no perfil da empresa.',8,false); }
  pages.push(page);

  return Promise.all([logoPromise,sigPromise]).then(function(images){
    var refs={};
    if(images[0]) refs.logo=images[0];
    if(images[1]) refs.signature=images[1];
    // Colocar as imagens no cabeçalho/assinatura através do próprio conteúdo da página.
    if(refs.logo){ pages.forEach(function(pg){ pg.ops.unshift(pg.isCover ? 'q 72 0 0 72 48 625 cm /ImLogo Do Q' : 'q 48 0 0 48 50 790 cm /ImLogo Do Q'); }); }
    if(refs.signature){ pages[pages.length-1].ops.unshift('q 220 0 0 70 187 610 cm /ImSig Do Q'); }
    var bytes=buildPdfDocument(pages,refs);
    var blob=new Blob([bytes],{type:'application/pdf'});
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=(title||'Relatorio_Aviario').replace(/[^\w\-]+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},3000);
    return {success:true};
  });
}
export function generateSaleInvoicePDF(saleData) {
  var s=Object.assign({},(saleData&&saleData.sale)||{},saleData||{}), settings=s.settings||{}, company=safePdfText(settings.companyLegalName||settings.farmName,'Aviário Inteligente Pro');
  var subtitle=safePdfText(settings.companySubtitle||settings.tagline,'Gestão Avícola');
  var meta=[settings.companyAddress||settings.location,settings.phone,settings.companyEmail].filter(Boolean).join(' · ');
  var neutralDark=[0.16,0.19,0.18], neutralSoft=[0.96,0.97,0.97];
  var accent=hexRgb(settings.brandColor || settings.primaryColor || '#10b981',[0.06,0.62,0.39]);
  var brandDark=mixRgb(accent,[0.04,0.08,0.07],0.58), white=[1,1,1], softWhite=[0.93,0.97,0.95];
  var logoPromise=pdfImageData(settings.companyLogo || './assets/icon-192.png');
  var sigPromise=pdfImageData(settings.signatureImage||'');
  var pages=[], page={ops:[],y:795};
  function newPage(){pages.push(page);page={ops:[],y:795};}
  function ensure(h){if(page.y-h<52)newPage();}
  function txt(v,size,bold){ensure(size+8);pdfDrawText(page.ops,42,page.y,size,safePdfText(v,''),!!bold);page.y-=size+6;}
  function row(label,value){ensure(22);pdfDrawText(page.ops,48,page.y,9,label,true);pdfDrawText(page.ops,210,page.y,9,safePdfText(value,'—'),false);page.y-=18;}
  function table(headers,rows){
    var x=40,w=515/headers.length;
    function header(){
      ensure(34);
      pdfFillRect(page.ops,40,page.y-6,515,25,neutralDark);
      pdfSetFill(page.ops,[1,1,1]);
      headers.forEach(function(h,i){pdfDrawText(page.ops,x+i*w+6,page.y+1,7.8,safePdfText(h,''),true,[1,1,1]);});
      pdfSetFill(page.ops,[0,0,0]);
      page.y-=34;
    }
    header();
    rows.forEach(function(r,idx){
      var cells=r.map(function(v){return safePdfText(v,'—');});
      var wrapped=cells.map(function(v){return pdfWrap(v,Math.max(10,Math.floor(w/4.2)));});
      var lines=Math.max.apply(null,wrapped.map(function(a){return a.length;}));
      var rh=Math.max(26,lines*10+8);
      if(page.y-rh<52){newPage();header();}
      var rowBottom=page.y-rh+8;
      if(idx%2===0) pdfFillRect(page.ops,40,rowBottom,515,rh,neutralSoft);
      pdfStrokeRect(page.ops,40,rowBottom,515,rh,[0.80,0.86,0.83],0.45);
      // Draw every cell value explicitly in black, well inside the row.
      pdfSetFill(page.ops,[0,0,0]);
      for(var li=0;li<lines;li++) wrapped.forEach(function(wr,i){
        var cellX=x+i*w+6;
        var cellY=page.y-7-li*10;
        pdfDrawText(page.ops,cellX,cellY,7.3,wr[li]||'—',false);
      });
      // Vertical guides make columns and their values easy to read in light mode.
      for(var ci=1;ci<headers.length;ci++){
        var vx=x+ci*w;
        pdfDrawRule(page.ops,vx,rowBottom,vx,rowBottom+rh,0.35);
      }
      page.y-=rh;
    });
  }
  var ref=safePdfText(s.invoiceNumber||('FT-'+String(s.id||Date.now()).replace(/[^A-Za-z0-9]+/g,'').slice(-12).toUpperCase()),'FT-—');
  var qty=Math.max(0,Number(s.qty)||0);
  var weightKg=Math.max(0,Number(s.weightKg)||0);
  var total= Math.max(0,Number(s.totalAmount)||0);
  var paid=Math.max(0,Number(s.paidAmount)||0);
  var debt=Math.max(0,Number(s.debtAmount)||Math.max(0,total-paid));
  var unit=Number(s.priceUnit)||0;
  if(!unit){
    if(s.type==='weight' && weightKg>0 && total>0) unit=total/weightKg;
    else if(qty>0 && total>0) unit=total/qty;
  }
  var quantityLabel=s.type==='weight' && weightKg>0 ? (weightKg.toLocaleString('pt-PT',{maximumFractionDigits:2})+' kg') : (qty+' un.');
  var product=safePdfText(s.product,'Frango Vivo');
  var lot=safePdfText(s.loteCode,'—');

  // Cabeçalho da factura: mantém a linguagem visual do sistema sem parecer um modelo genérico.
  pdfFillRect(page.ops,0,785,595,57,white);
  pdfFillRect(page.ops,0,785,8,57,accent);
  pdfDrawText(page.ops,135,814,17,company,true,neutralDark);
  pdfDrawText(page.ops,135,798,9,subtitle,true,brandDark);
  if(meta) pdfDrawText(page.ops,135,781,7.3,meta,false,[0.38,0.44,0.41]);
  pdfDrawText(page.ops,455,814,7.5,'FACTURA',true,brandDark);
  pdfDrawText(page.ops,455,799,7.5,ref,false,[0.38,0.44,0.41]);
  pdfFillRect(page.ops,40,770,515,1.5,mixRgb(accent,white,0.15));
  page.y=748;

  // Client and sale identification.
  row('Número da factura',ref);
  row('Data / hora',safePdfText(s.date,'—')+' '+safePdfText(s.time,''));
  row('Cliente',safePdfText(s.clientName,'Cliente não identificado'));
  row('Contacto',safePdfText(s.clientPhone,''));
  row('Lote',lot);
  row('Produto',product);
  page.y-=5;

  // Filled sale table: never leave the only row empty; values come from the saved sale.
  table(['Descrição','Quantidade','Preço unitário','Total'],[[
    product+' · Lote '+lot,
    quantityLabel,
    unit>0 ? pdfMoney(unit) : '—',
    total>0 ? pdfMoney(total) : '—'
  ]]);

  page.y-=14;
  ensure(100);
  pdfFillRect(page.ops,318,page.y-72,237,80,mixRgb(accent,[1,1,1],0.88));
  pdfStrokeRect(page.ops,318,page.y-72,237,80,mixRgb(accent,[0.8,0.86,0.83],0.35),0.7);
  pdfSetFill(page.ops,[0,0,0]);
  pdfDrawText(page.ops,334,page.y-10,9,'Total da factura',true);
  pdfDrawText(page.ops,334,page.y-31,18,total>0 ? pdfMoney(total) : '—',true);
  pdfDrawText(page.ops,334,page.y-52,8,'Valor pago: '+(paid>0 ? pdfMoney(paid) : '0,00 MT'),false);
  pdfDrawText(page.ops,334,page.y-66,8,'Saldo em dívida: '+(debt>0 ? pdfMoney(debt) : '0,00 MT'),false);
  page.y-=99;

  row('Método de pagamento',safePdfText(s.paymentMethod,'—'));
  row('Estado do pagamento',safePdfText(s.paymentStatus,debt>0?'Pendente':'Pago'));
  row('Responsável',safePdfText(s.responsible||settings.signatureName||settings.ownerName,'—'));
  if(settings.reportFooter) txt(settings.reportFooter,8,false);
  page.y-=16;
  ensure(88);
  pdfDrawText(page.ops,42,page.y,8,'Agradecemos a preferência.',true);
  page.y-=26;
  pdfDrawText(page.ops,42,page.y,8,'Assinatura da empresa',true);
  if(!settings.signatureImage){
    page.y-=18;pdfDrawRule(page.ops,42,page.y,235,page.y,0.7);page.y-=12;
    pdfDrawText(page.ops,42,page.y,7,safePdfText(settings.signatureName,'Responsável'),false);
    pdfDrawText(page.ops,42,page.y-10,7,safePdfText(settings.signatureTitle,''),false);
  }
  pages.push(page);

  return Promise.all([logoPromise,sigPromise]).then(function(images){
    var refs={}; if(images[0]) refs.logo=images[0]; if(images[1]) refs.signature=images[1];
    if(refs.logo) pages.forEach(function(pg){pg.ops.unshift('q 66 0 0 66 50 788 cm /ImLogo Do Q');});
    if(refs.signature) pages[pages.length-1].ops.unshift('q 190 0 0 58 255 575 cm /ImSig Do Q');
    var bytes=buildPdfDocument(pages,refs),blob=new Blob([bytes],{type:'application/pdf'});
    var url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='Factura_'+ref.replace(/[^A-Za-z0-9_-]+/g,'_')+'.pdf';
    document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},3000);
    return {success:true};
  });
}
