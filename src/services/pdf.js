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

async function generateBrandedDocumentPDF(data) {
  data=data||{};
  var settings=data.settings||{};
  var columns=['Data','Tipo','Registo','Detalhes','Valor'];
  var sectionMarkup=(Array.isArray(data.sections)?data.sections:[]).map(function(section){
    var headers=Array.isArray(section.columns)?section.columns:[];
    var rows=Array.isArray(section.rows)?section.rows:[];
    var headerMarkup=headers.map(function(header){ return '<th>'+financeReportEscape(header)+'</th>'; }).join('');
    var bodyMarkup=rows.map(function(row){
      return '<tr>'+row.map(function(value){ return '<td>'+financeReportEscape(value)+'</td>'; }).join('')+'</tr>';
    }).join('');
    return '<section class="invoice-items-section"><h2 style="margin:0 0 10px;font-size:13px;color:#0f172a;text-transform:uppercase">'+financeReportEscape(section.title||'Registos')+'</h2><table class="invoice-items-table"><thead><tr>'+headerMarkup+'</tr></thead><tbody>'+(bodyMarkup||'<tr><td colspan="'+Math.max(1,headers.length)+'">Nenhum registo neste período.</td></tr>')+'</tbody></table></section>';
  }).join('');
  var title=financeReportEscape(data.title||'Relatório');
  var period=financeReportEscape(data.period||'Todos os períodos');
  var company=financeReportEscape(settings.companyLegalName||settings.farmName||'Aviário Inteligente Pro');
  var subtitle=financeReportEscape(settings.companySubtitle||settings.tagline||'Gestão Avícola');
  var metadata=financeReportEscape([settings.companyAddress||settings.location,settings.phone,settings.companyEmail].filter(Boolean).join(' · '));
  var logo=financeReportEscape(settings.companyLogo||'./assets/icon-192.png');
  var holder=document.createElement('div');
  holder.style.position='fixed'; holder.style.left='-12000px'; holder.style.top='0'; holder.style.width='794px'; holder.style.zIndex='-1'; holder.style.pointerEvents='none';
  holder.innerHTML='<article class="invoice-sheet" style="width:794px;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none"><header class="invoice-sheet-header"><div class="invoice-company-block"><div class="invoice-logo-box"><img src="'+logo+'" alt=""></div><div class="invoice-company-info"><h1>'+company+'</h1><p class="invoice-company-subtitle">'+subtitle+'</p><p class="invoice-company-contact">'+metadata+'</p></div></div><div class="invoice-number-block"><span>'+title+'</span><strong>'+period+'</strong><small>Emitido em '+financeReportEscape(new Date().toLocaleString('pt-PT'))+'</small></div></header>'+sectionMarkup+'<footer class="invoice-sheet-footer"><span>'+financeReportEscape(settings.reportFooter||'Documento emitido pelo Aviário Inteligente Pro.')+'</span><span>'+title+'</span></footer></article>';
  document.body.appendChild(holder);
  try {
    await inlineInvoiceImages(holder);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    var sheet=holder.querySelector('.invoice-sheet');
    await new Promise(function(resolve){ requestAnimationFrame(function(){ requestAnimationFrame(resolve); }); });
    var canvas=await html2canvas(sheet,{backgroundColor:'#ffffff',scale:2,useCORS:true,allowTaint:false,logging:false,imageTimeout:10000,width:794,height:sheet.scrollHeight,windowWidth:794,windowHeight:Math.max(sheet.scrollHeight,1000)});
    if (!canvas||!canvas.width||!canvas.height) throw new Error('O documento PDF ficou vazio.');
    var pageHeight=Math.round(canvas.width*(842/595)), pages=[], images={}, count=Math.max(1,Math.ceil(canvas.height/pageHeight));
    for (var index=0;index<count;index++) {
      var key='document'+index;
      images[key]=canvasPageImage(canvas,index*pageHeight,pageHeight);
      var drawHeight=images[key].height<pageHeight?842*(images[key].height/pageHeight):842;
      pages.push({ops:['q 595 0 0 '+drawHeight.toFixed(2)+' 0 '+(842-drawHeight).toFixed(2)+' cm /Im'+key+' Do Q'],y:0});
    }
    var bytes=buildPdfDocument(pages,images), blob=new Blob([bytes],{type:'application/pdf'}), url=URL.createObjectURL(blob), link=document.createElement('a');
    var filename=String(data.filename||data.title||'Relatorio').replace(/[^A-Za-z0-9_-]+/g,'_');
    link.href=url; link.download=filename+'_'+new Date().toISOString().slice(0,10)+'.pdf'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },3000);
    return {success:true,pages:pages.length};
  } finally { holder.remove(); }
}

export function generateProfessionalAviarioPDF(farmData, title) {
  farmData=farmData||{};
  var arrays={
    sales:farmData.sales||[],lotes:farmData.lotes||[],feed:farmData.feedLogs||[],mortality:farmData.mortalityLogs||[],
    clients:farmData.clients||[],expenses:farmData.expenses||[],receipts:farmData.receipts||[],stock:farmData.stockItems||[],
    health:farmData.healthLogs||[],attendance:farmData.attendance||[],energy:farmData.energyLogs||[],suppliers:farmData.suppliers||[],
    notifications:farmData.notifications||[],cash:farmData.cashTransactions||[],priceTable:farmData.priceTable||[]
  };
  var k=farmData.kpis||{}, finance=farmData.financeSummary||{}, projection=farmData.financeProjection||{};
  var sections=[{title:'Resumo Executivo',columns:['Indicador','Resultado'],rows:[
    ['Aves disponíveis',k.remainingBirds||0],['Mortalidade',String(k.mortalityRate||0)+'%'],['Receita',pdfMoney(k.totalRevenue)],['Lucro líquido',pdfMoney(k.netProfit)],
    ['Saldo em caixa',pdfMoney(finance.saldoCaixa!=null?finance.saldoCaixa:k.cashBalance)],['A receber',pdfMoney(finance.totalAReceber!=null?finance.totalAReceber:k.accountsReceivable)]
  ]}];
  if (farmData.financeSummary) {
    sections.push({title:'Resumo Financeiro',columns:['Indicador','Resultado'],rows:[['Período',finance.periodo||farmData.finPeriod||'Actual'],['Entradas',pdfMoney(finance.periodReceitas)],['Saídas',pdfMoney(finance.periodDespesas)],['Resultado',pdfMoney(finance.lucro)],['Margem',String(Number(finance.margemLucro||0).toFixed(1))+'%'],['A pagar',pdfMoney(finance.totalAPagar)]]});
    sections.push({title:'Métodos de Pagamento',columns:['Método','Total'],rows:Object.keys(finance.methods||{}).map(function(method){return [method,pdfMoney(finance.methods[method])];})});
    if (projection && (projection.revenue!=null || projection.profit!=null)) sections.push({title:'Projecção de Gestão',columns:['Indicador','Resultado'],rows:[['Receita projectada',pdfMoney(projection.revenue)],['Custo projectado',pdfMoney(projection.costs)],['Resultado projectado',pdfMoney(projection.profit)],['Margem projectada',String(Number(projection.margin||0).toFixed(1))+'%'],['Data estimada',projection.targetDate||'—']]});
  }
  sections.push(
    {title:'Vendas de Frangos',columns:['Data','Cliente','Lote','Qtd.','Total','Pagamento','Estado'],rows:arrays.sales.map(function(item){return [item.date,item.clientName||'Cliente',item.loteCode||'—',item.qty||0,pdfMoney(item.totalAmount),item.paymentMethod||'—',item.paymentStatus||((Number(item.debtAmount)||0)>0?'Pendente':'Pago')];})},
    {title:'Lotes',columns:['Código','Entrada','Raça','Inicial','Mortes','Estado'],rows:arrays.lotes.map(function(item){return [item.code,item.entryDate,item.breed,item.initialBirds||0,item.deaths||0,item.status||'Ativo'];})},
    {title:'Ração & Alimentação',columns:['Data','Lote','Movimento','Qtd. kg','Custo'],rows:arrays.feed.map(function(item){return [item.date,item.loteCode||'Geral',item.movement||item.type||'',item.qtyKg||0,pdfMoney(item.totalCost)];})},
    {title:'Mortalidade',columns:['Data','Lote','Qtd.','Motivo'],rows:arrays.mortality.map(function(item){return [item.date,item.loteCode,item.qty||0,item.reason||''];})},
    {title:'Clientes & Dívidas',columns:['Cliente','Contacto','Compras','Pago','Dívida'],rows:arrays.clients.map(function(item){return [item.name,item.phone,pdfMoney(item.totalBought),pdfMoney(item.totalPaid),pdfMoney(item.debt)];})},
    {title:'Despesas',columns:['Data','Categoria','Descrição','Valor','Pagamento'],rows:arrays.expenses.map(function(item){return [item.date,item.category,item.description||item.desc,pdfMoney(item.amount),item.paymentMethod||'—'];})},
    {title:'Recebimentos',columns:['Data','Cliente','Valor','Método','Referência'],rows:arrays.receipts.map(function(item){return [item.date,item.clientName,pdfMoney(item.amount),item.paymentMethod||'—',item.referenceId||item.saleId||''];})},
    {title:'Stock',columns:['Item','Categoria','Qtd.','Unidade','Valor'],rows:arrays.stock.map(function(item){return [item.name,item.category,item.qty||0,item.unit||'un',pdfMoney((Number(item.qty)||0)*(Number(item.unitPrice)||0))];})},
    {title:'Saúde & Vacinação',columns:['Data','Lote','Tipo','Produto','Qtd.','Próxima'],rows:arrays.health.map(function(item){return [item.date,item.loteCode,item.type,item.product,item.quantity||item.qty||0,item.nextDate||''];})},
    {title:'Presença & Equipa',columns:['Data','Funcionário','Estado','Entrada','Saída'],rows:arrays.attendance.map(function(item){return [item.date,item.staffName||item.name,item.status,item.checkIn,item.checkOut];})},
    {title:'Extrato de Caixa',columns:['Data','Tipo','Categoria','Descrição','Valor','Método'],rows:arrays.cash.map(function(item){return [item.date,item.type,item.category,item.desc||item.description,pdfMoney(item.amount),item.paymentMethod||'—'];})},
    {title:'Energia',columns:['Data','Anterior','Actual','Consumo','Custo'],rows:arrays.energy.map(function(item){return [item.date,item.previous||item.prev||item.prevReading||0,item.current||item.curr||item.currReading||0,item.consumption||item.kwh||0,pdfMoney(item.amount||item.cost)];})},
    {title:'Fornecedores',columns:['Fornecedor','Contacto','Categoria','Saldo/Obs.'],rows:arrays.suppliers.map(function(item){return [item.name,item.phone||item.contact,item.category,item.balance!=null?pdfMoney(item.balance):(item.notes||'')];})},
    {title:'Tabela de Preços',columns:['Produto/Serviço','Unidade','Preço'],rows:arrays.priceTable.map(function(item){return [item.name||item.product||item.label,item.unit||item.unitType,pdfMoney(item.price||item.amount)];})}
  );
  var alerts=farmData.alerts||[], agenda=farmData.agenda||[];
  sections.push({title:'Alertas e Agenda',columns:['Grupo','Data','Descrição'],rows:alerts.map(function(item){return ['Alerta','',safePdfText(item.title||item.type)+' — '+safePdfText(item.detail||item.message)];}).concat(agenda.map(function(item){return ['Agenda',item.date,safePdfText(item.title)+': '+safePdfText(item.detail)];}))});
  return generateBrandedDocumentPDF({settings:farmData.settings||{},title:title||'Relatório de Gestão Avícola',period:farmData.period||'Todos os períodos',sections:sections,filename:title||'Relatorio_Aviario'});
}

function financeReportMoney(value) {
  return Number(value || 0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' MT';
}

function financeReportEscape(value) {
  return String(value === undefined || value === null ? '—' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
}

async function captureFinanceReport(farmData) {
  farmData=farmData||{};
  var settings=farmData.settings||{};
  var sum=farmData.financeSummary||{};
  var methods=Object.assign({'Dinheiro':0,'M-Pesa':0,'e-Mola':0,'Transferência':0,'Cartão':0,'Crédito':0,'Outros':0},sum.methods||{});
  var transactions=Array.isArray(farmData.cashTransactions)?farmData.cashTransactions:[];
  var company=financeReportEscape(settings.companyLegalName||settings.farmName||'Aviário Inteligente Pro');
  var subtitle=financeReportEscape(settings.companySubtitle||settings.tagline||'Gestão Avícola');
  var meta=financeReportEscape([settings.companyAddress||settings.location,settings.phone,settings.companyEmail].filter(Boolean).join(' · '));
  var period=financeReportEscape(sum.periodo||farmData.period||'Todo o histórico');
  var logo=resolvePdfAsset(settings.companyLogo||'./assets/icon-192.png');
  var methodLabels=[['Dinheiro','Dinheiro'],['M-Pesa','M-Pesa'],['e-Mola','e-Mola'],['Transferência','Transferência'],['Cartão','Cartão'],['Crédito','Crédito / Fiado'],['Outros','Outros']];
  var methodCards=methodLabels.map(function(item){return '<div class="fm-method"><span>'+financeReportEscape(item[1])+'</span><strong>'+financeReportMoney(methods[item[0]])+'</strong></div>';}).join('');
  var rows=transactions.map(function(t){
    var type=t.type||t.tipo||'—';
    var amount=Number(t.amount)||0;
    var displayAmount=(String(type).toUpperCase().indexOf('SA')!==-1?'-':'')+financeReportMoney(amount);
    return '<tr><td>'+financeReportEscape(t.date||'—')+'</td><td>'+financeReportEscape(type)+'</td><td>'+financeReportEscape(t.category||'—')+'</td><td>'+financeReportEscape(t.desc||t.description||'—')+'</td><td>'+financeReportEscape(t.paymentMethod||'—')+'</td><td class="num">'+financeReportEscape(displayAmount)+'</td></tr>';
  }).join('');
  var logoData='';
  try { var response=await fetch(logo,{cache:'no-store'}); if(response.ok) logoData=await dataUrlFromBlob(await response.blob()); } catch(e) {}
  if(!logoData) logoData='./assets/icon-192.png';

  var holder=document.createElement('div');
  holder.style.position='fixed'; holder.style.left='-10000px'; holder.style.top='0'; holder.style.width='794px'; holder.style.background='#fff'; holder.style.zIndex='-1'; holder.style.pointerEvents='none';
  holder.innerHTML=`
  <div class="finance-pdf-sheet">
    <div class="fm-head">
      <div class="fm-brand"><div class="fm-logo"><img src="${logoData}" alt=""></div><div><div class="fm-company">${company}</div><div class="fm-subtitle">${subtitle}</div><div class="fm-meta">${meta}</div></div></div>
      <div class="fm-doc"><div>RELATÓRIO FINANCEIRO</div><small>Período: <strong>${period}</strong></small><small>Emitido em ${financeReportEscape(new Date().toLocaleString('pt-PT'))}</small></div>
    </div>
    <div class="fm-section"><div class="fm-kpis"><div class="fm-kpi"><span>Saldo em caixa</span><strong>${financeReportMoney(sum.saldoCaixa)}</strong></div><div class="fm-kpi"><span>Entradas</span><strong>${financeReportMoney(sum.periodReceitas)}</strong></div><div class="fm-kpi"><span>Saídas</span><strong>${financeReportMoney(sum.periodDespesas)}</strong></div><div class="fm-kpi"><span>Resultado</span><strong>${financeReportMoney(sum.lucro)}</strong></div></div></div>
    <div class="fm-section"><h2>Métodos de pagamento</h2><div class="fm-methods">${methodCards}</div></div>
    <div class="fm-section"><h2>Livro de caixa</h2><table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Método</th><th>Valor</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="fm-empty">Nenhum movimento no período seleccionado.</td></tr>'}</tbody></table></div>
    <div class="fm-foot"><span>Documento emitido pelo Aviário Inteligente Pro.</span><span>Relatório financeiro</span></div>
  </div>`;
  var style=document.createElement('style');
  style.textContent=`
  .finance-pdf-sheet{width:794px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;padding-bottom:28px;box-sizing:border-box}.fm-head{padding:28px 34px 20px;border-bottom:2px solid #0f172a;display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.fm-brand{display:flex;gap:14px;align-items:flex-start;min-width:0}.fm-logo{width:62px;height:62px;flex:0 0 62px;border:1px solid #d9e0e7;border-radius:10px;padding:5px;box-sizing:border-box;background:#fff;display:flex;align-items:center;justify-content:center}.fm-logo img{width:100%;height:100%;object-fit:contain}.fm-company{font-size:22px;font-weight:900;line-height:1.12;color:#0f172a;overflow-wrap:anywhere}.fm-subtitle{margin-top:5px;font-size:11px;font-weight:700;color:#0f766e}.fm-meta{margin-top:7px;font-size:9px;color:#64748b}.fm-doc{text-align:right;min-width:170px}.fm-doc>div{font-size:10px;font-weight:900;letter-spacing:.16em;color:#64748b}.fm-doc small{display:block;margin-top:7px;font-size:9px;color:#64748b}.fm-section{padding:20px 34px 0}.fm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.fm-kpi{padding:12px;border:1px solid #dbe2ea;border-radius:9px;background:#f8fafc}.fm-kpi span{display:block;font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b}.fm-kpi strong{display:block;margin-top:6px;font-size:15px;color:#0f172a}.fm-section h2{margin:0 0 10px;font-size:13px;color:#0f172a;text-transform:uppercase;letter-spacing:.08em}.fm-methods{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.fm-method{padding:10px;border:1px solid #dbe2ea;border-radius:9px;background:#fff;min-height:48px}.fm-method span{display:block;font-size:8px;color:#64748b;font-weight:800}.fm-method strong{display:block;margin-top:5px;font-size:11px;color:#0f172a}.finance-pdf-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}.finance-pdf-sheet th{padding:8px 6px;background:#172033;color:#fff;border:1px solid #172033;text-align:left;font-size:8px;text-transform:uppercase}.finance-pdf-sheet th:nth-child(1){width:11%}.finance-pdf-sheet th:nth-child(2){width:11%}.finance-pdf-sheet th:nth-child(3){width:16%}.finance-pdf-sheet th:nth-child(4){width:29%}.finance-pdf-sheet th:nth-child(5){width:15%}.finance-pdf-sheet th:nth-child(6){width:18%;text-align:right}.finance-pdf-sheet td{padding:7px 6px;border:1px solid #d5dde5;color:#1e293b;vertical-align:top;overflow-wrap:anywhere}.finance-pdf-sheet tbody tr:nth-child(even){background:#f8fafc}.finance-pdf-sheet td.num{text-align:right;font-weight:800}.finance-pdf-sheet td.fm-empty{text-align:center;color:#64748b;padding:18px}.fm-foot{margin:24px 34px 0;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:20px;font-size:8px;color:#64748b}`;
  holder.appendChild(style); document.body.appendChild(holder);
  try { var sheet=holder.querySelector('.finance-pdf-sheet'); await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});}); return await html2canvas(sheet,{backgroundColor:'#ffffff',scale:2,useCORS:true,allowTaint:false,logging:false,imageTimeout:10000,width:794,height:sheet.scrollHeight,windowWidth:794,windowHeight:Math.max(sheet.scrollHeight,1000)}); }
  finally { holder.remove(); }
}

export async function generateFinanceReportPDF(farmData) {
  var data=farmData||{}, summary=data.financeSummary||{}, transactions=Array.isArray(data.cashTransactions)?data.cashTransactions:[];
  var methodRows=Object.keys(summary.methods||{}).map(function(method){return [method,pdfMoney(summary.methods[method])];});
  var cashRows=transactions.map(function(item){var isOut=String(item.type||item.tipo||'').toUpperCase().indexOf('SA')===0;return [item.date,item.type||item.tipo,item.category,item.desc||item.description,item.paymentMethod||'—',(isOut?'- ':'')+pdfMoney(item.amount)];});
  return generateBrandedDocumentPDF({
    settings:data.settings||{},title:'Relatório Financeiro',period:summary.periodo||data.period||'Todos os períodos',filename:'Relatorio_Financeiro',
    sections:[
      {title:'Resumo Financeiro',columns:['Indicador','Valor'],rows:[['Saldo em caixa',pdfMoney(summary.saldoCaixa)],['Entradas',pdfMoney(summary.periodReceitas)],['Saídas',pdfMoney(summary.periodDespesas)],['Resultado',pdfMoney(summary.lucro)],['Margem',String(Number(summary.margemLucro||0).toFixed(1))+'%']]},
      {title:'Métodos de Pagamento',columns:['Método','Total'],rows:methodRows},
      {title:'Livro de Caixa',columns:['Data','Tipo','Categoria','Descrição','Método','Valor'],rows:cashRows}
    ]
  });
}

export function generateOperationalArchivePDF(data) {
  data=data||{};
  var rows=Array.isArray(data.rows)?data.rows:[];
  return generateBrandedDocumentPDF({
    settings:data.settings||{},title:'Arquivo Operacional · '+(data.type==='all'?'Todos os registos':data.type),period:data.period||'Todos os períodos',filename:'Arquivo_Operacional',
    sections:[{title:'Histórico',columns:['Data','Tipo','Registo','Detalhes','Valor'],rows:rows.map(function(row){return [row.date,row.type,row.title,row.details,row.amountText];})}]
  }).then(function(result){ return Object.assign(result,{rows:rows.length}); });
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
