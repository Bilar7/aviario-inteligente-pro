import html2canvas from "html2canvas";
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

function pdfDrawText(ops, x, y, size, text, bold) {
  ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x.toFixed(2)+' '+y.toFixed(2)+' Td '+pdfHex(text)+' Tj ET');
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

function resolvePdfAsset(src) {
  if (!src) return '';
  if (typeof document === 'undefined') return src;
  try { return new URL(src, document.baseURI).href; } catch (e) { return src; }
}

function pdfBrandLogo(settings) {
  settings = settings || {};
  var custom = settings.companyLogo ? resolvePdfAsset(settings.companyLogo) : '';
  var fallback = resolvePdfAsset('./assets/icon-192.png');
  if (!custom || custom === fallback) return pdfImageData(fallback);
  return pdfImageData(custom).then(function(image){
    return image || pdfImageData(fallback);
  });
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
    Object.keys(imageIds).forEach(function(key){
      var resourceName = key === 'logo' ? 'ImLogo' : (key === 'signature' ? 'ImSig' : ('Im'+String(key).replace(/[^A-Za-z0-9_]/g,'')));
      xo += '/'+resourceName+' '+imageIds[key]+' 0 R ';
    });
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

export function generateProfessionalAviarioPDF(farmData, title) {
  farmData=farmData||{};
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
  var neutralDark=[0.16,0.19,0.18];
  var neutralSoft=[0.96,0.97,0.97];
  var pages=[], page={ops:[],y:795};
  var logoPromise=pdfBrandLogo(settings);
  var sigPromise=pdfImageData(resolvePdfAsset(settings.signatureImage||''));
  function newPage(){ pages.push(page); page={ops:[],y:795}; }
  function ensure(h){ if(page.y-h<45) newPage(); }
  function text(text,size,bold){
    var lines=pdfWrap(text, Math.max(28,Math.floor(535/(size*0.5))));
    lines.forEach(function(line){ ensure(size+5); pdfDrawText(page.ops,40,page.y,size,line,bold); page.y-=size+4; });
  }
  function heading(t){ ensure(32); page.y-=3; pdfSetFill(page.ops,neutralDark); pdfDrawText(page.ops,40,page.y,15,t,true); pdfSetFill(page.ops,[0,0,0]); page.y-=8; pdfFillRect(page.ops,40,page.y,515,3,neutralDark); page.y-=12; }
  function kv(label,value){ ensure(20); pdfDrawText(page.ops,40,page.y,9,label,true); pdfDrawText(page.ops,180,page.y,9,safePdfText(value,'—'),false); page.y-=15; }
  function table(headers,rows){
    var cols=headers.length, width=515/cols, x0=40;
    function drawHeader(){
      ensure(42);
      pdfFillRect(page.ops,40,page.y-5,515,23,neutralDark);
      pdfSetFill(page.ops,[1,1,1]);
      headers.forEach(function(h,i){ pdfDrawText(page.ops,x0+i*width,page.y+2,7.7,safePdfText(h,''),true); });
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

  // Cabeçalho limpo com a identidade da empresa. A logo é inserida no mesmo cabeçalho.
  pdfDrawRule(page.ops,40,748,555,748,0.9);
  pdfDrawText(page.ops,112,724,18,company,true);
  pdfDrawText(page.ops,112,707,9.5,subtitle,true);
  if(settings.tagline && settings.tagline !== subtitle) pdfDrawText(page.ops,112,693,8.2,safePdfText(settings.tagline,''),false);
  if(meta) pdfDrawText(page.ops,112,679,7.4,meta,false);
  pdfDrawText(page.ops,112,664,7.6,'Relatório: '+safePdfText(title,'Relatório de Gestão Avícola'),false);
  pdfDrawText(page.ops,470,724,8,'Emitido',true);
  pdfDrawText(page.ops,470,710,8,new Date().toLocaleDateString('pt-PT'),false);
  page.y=640;
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
  table(['Código','Entrada','Raça','Inicial','Mortes','Restantes','Estado'],arrays.lotes.map(function(l){var rest=(Number(l.initialBirds)||0)-(Number(l.deaths)||0)-(Number(l.soldBirds)||0);return [l.code,l.entryDate,l.breed,l.initialBirds||0,l.deaths||0,rest,l.status||'Ativo'];}));
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
    if(refs.logo){ pages.forEach(function(pg){ pg.ops.unshift('q 58 0 0 58 42 675 cm /ImLogo Do Q'); }); }
    if(refs.signature){ pages[pages.length-1].ops.unshift('q 220 0 0 70 187 610 cm /ImSig Do Q'); }
    var bytes=buildPdfDocument(pages,refs);
    var blob=new Blob([bytes],{type:'application/pdf'});
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=(title||'Relatorio_Aviario').replace(/[^\w\-]+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},3000);
    return {success:true};
  });
}
function dataUrlFromBlob(blob) {
  return new Promise(function(resolve, reject){
    try {
      var reader=new FileReader();
      reader.onload=function(){resolve(reader.result);};
      reader.onerror=reject;
      reader.readAsDataURL(blob);
    } catch(e){ reject(e); }
  });
}

async function inlineInvoiceImages(root) {
  var images=Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(async function(img){
    var src=img.getAttribute('src');
    if(!src || src.indexOf('data:')===0) return;
    try {
      var response=await fetch(resolvePdfAsset(src), {cache:'no-store'});
      if(!response.ok) return;
      var blob=await response.blob();
      img.setAttribute('src', await dataUrlFromBlob(blob));
    } catch(e) {
      // A remote logo without CORS must not block the document. The visible DOM print still works.
    }
  }));
}

async function captureRenderedInvoice() {
  var live=document.querySelector('.invoice-sheet');
  if (!live) throw new Error('Pré-visualização da factura não encontrada.');
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch(e) {} }

  // O PDF usa directamente a folha da factura que está no ecrã.
  // Não há SVG, foreignObject ou um segundo modelo de factura.
  var clone=live.cloneNode(true);
  clone.style.width=Math.max(live.clientWidth,794)+'px';
  clone.style.maxWidth='none';
  clone.style.margin='0';
  clone.style.boxShadow='none';
  clone.style.border='0';
  clone.style.borderRadius='0';
  clone.style.transform='none';
  await inlineInvoiceImages(clone);

  var holder=document.createElement('div');
  holder.style.position='fixed';
  holder.style.left='-10000px';
  holder.style.top='0';
  holder.style.width=clone.style.width;
  holder.style.background='#fff';
  holder.style.zIndex='-1';
  holder.style.pointerEvents='none';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});

  var canvas;
  try {
    canvas=await html2canvas(clone,{
      backgroundColor:'#ffffff',
      scale:2,
      useCORS:true,
      allowTaint:false,
      logging:false,
      imageTimeout:10000,
      width:Math.max(clone.scrollWidth,794),
      height:Math.max(clone.scrollHeight,1),
      windowWidth:Math.max(clone.scrollWidth,794),
      windowHeight:Math.max(clone.scrollHeight,1)
    });
  } catch (err) {
    throw new Error('Não foi possível preparar a factura para PDF. Use Imprimir para guardar a mesma factura em PDF.');
  } finally {
    if (holder.parentNode) holder.parentNode.removeChild(holder);
  }
  if (!canvas || !canvas.width || !canvas.height) {
    throw new Error('A pré-visualização da factura ficou vazia.');
  }
  return canvas;
}

function canvasPageImage(canvas, y, sliceHeight) {
  var slice=document.createElement('canvas');
  slice.width=canvas.width;
  slice.height=Math.min(sliceHeight, canvas.height-y);
  var ctx=slice.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,slice.width,slice.height);
  ctx.drawImage(canvas,0,y,canvas.width,slice.height,0,0,slice.width,slice.height);
  var jpeg=slice.toDataURL('image/jpeg',0.94);
  var b64=jpeg.split(',')[1]||'';
  var bin=atob(b64), bytes=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return {bytes:bytes,width:slice.width,height:slice.height};
}

export async function generateSaleInvoicePDF(saleData) {
  var s=saleData||{};
  var ref=safePdfText(s.invoiceNumber||('FT-'+String(s.id||Date.now()).replace(/[^A-Za-z0-9]+/g,'').slice(-12).toUpperCase()),'FT-—');
  var canvas=await captureRenderedInvoice();
  var a4WidthPx=canvas.width;
  var a4HeightPx=Math.round(a4WidthPx*(842/595));
  var pages=[];
  var pageCount=Math.max(1,Math.ceil(canvas.height/a4HeightPx));
  var images={};
  for(var p=0;p<pageCount;p++){
    var key='page'+p;
    images[key]=canvasPageImage(canvas,p*a4HeightPx,a4HeightPx);
    var ops=[];
    var drawH=842;
    if(images[key].height < a4HeightPx) drawH=842*(images[key].height/a4HeightPx);
    ops.push('q 595 0 0 '+drawH.toFixed(2)+' 0 '+(842-drawH).toFixed(2)+' cm /Im'+key+' Do Q');
    pages.push({ops:ops,y:0});
  }
  var bytes=buildPdfDocument(pages,images);
  var blob=new Blob([bytes],{type:'application/pdf'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;
  a.download='Factura_'+ref.replace(/[^A-Za-z0-9_-]+/g,'_')+'.pdf';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},3000);
  return {success:true, exactPreview:true};
}
