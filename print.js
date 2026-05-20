// print.js — Funciones de impresión (etiqueta, lista A4, ticket 80mm)

/* ── helpers reutilizables para impresión ── */
function _printEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _printDate(iso){
  if(!iso) return '—';
  const d=new Date(iso+'T12:00:00');
  return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]+' '+
    String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
}
function _printDestino(s){
  const u=(s.courier||'').toUpperCase();
  const isRetiro=u.includes('RETIRO');
  const isEnco=u.includes('ENCOMIENDA');
  const isAgency=!isRetiro&&!isEnco&&(
    ['SHALOM','OLVA','MARVISUR','DINSIDES'].some(n=>u.includes(n))||
    ((S.courierTypes||{})[s.courier]==='agencia'));
  if(isRetiro) return [];
  if(isEnco){
    const r=[];
    if(s.ciudadDestino) r.push('CIUDAD DESTINO: '+s.ciudadDestino);
    if(s.dniDestinatario) r.push('DNI destinatario: '+s.dniDestinatario);
    return r;
  }
  if(isAgency){
    const m=(s.notes||'').match(/Agencia:\s*([^|]+)/i);
    const r=[];
    const ag=m?m[1].trim():(s.address||'');
    if(ag) r.push('AGENCIA: '+ag);
    if(s.dniRecoger) r.push('DNI para recoger: '+s.dniRecoger);
    return r;
  }
  const r=[];
  if(s.address) r.push('DIRECCIÓN: '+s.address);
  if(s.referencia) r.push('Ref: '+s.referencia);
  return r;
}
function _printCleanNote(s){ return (s.notes||'').replace(/Agencia:[^|]*(\|)?/gi,'').replace(/\s*\|\s*$/,'').trim(); }

function doPrint(){
  const list=S.shipments.filter(x=>x.sel).length?S.shipments.filter(x=>x.sel):S.shipments;
  if(!list.length){toast('Sin envíos');return;}

  /* ── selector de formato dentro de la app ── */
  let prev=document.getElementById('_printPicker');
  if(prev) prev.remove();
  const picker=document.createElement('div');
  picker.id='_printPicker';
  picker.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  picker.innerHTML=`
    <div style="background:#0f0f1a;border:1px solid #2d2d44;border-radius:20px;padding:28px 24px;max-width:360px;width:100%;font-family:system-ui,sans-serif">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:32px;margin-bottom:6px">🖨️</div>
        <div style="font-size:17px;font-weight:700;color:#f0f0f8;margin-bottom:4px">Imprimir envíos</div>
        <div style="font-size:12px;color:#6b7280">${list.length} envío${list.length!==1?'s':''} · Elige el formato</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <button onclick="window._doPrintFmt('label')" style="background:#13131f;border:1.5px solid #2d2d44;color:#f0f0f8;border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;font-family:inherit;transition:border-color .15s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#2d2d44'">
          <div style="font-size:15px;font-weight:700;margin-bottom:3px">🏷️ Etiqueta A4</div>
          <div style="font-size:12px;color:#6b7280">Una etiqueta por envío · estilo REMITENTE / PARA / DESTINO</div>
        </button>
        <button onclick="window._doPrintFmt('lista')" style="background:#13131f;border:1.5px solid #2d2d44;color:#f0f0f8;border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;font-family:inherit" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#2d2d44'">
          <div style="font-size:15px;font-weight:700;margin-bottom:3px">📋 Lista A4</div>
          <div style="font-size:12px;color:#6b7280">2 columnas por página · incluye código QR</div>
        </button>
        <button onclick="window._doPrintFmt('ticket')" style="background:#13131f;border:1.5px solid #2d2d44;color:#f0f0f8;border-radius:14px;padding:14px 16px;text-align:left;cursor:pointer;font-family:inherit" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#2d2d44'">
          <div style="font-size:15px;font-weight:700;margin-bottom:3px">🧾 Ticket 80mm</div>
          <div style="font-size:12px;color:#6b7280">Para impresoras térmicas de recibo</div>
        </button>
      </div>
      <button onclick="document.getElementById('_printPicker').remove()" style="width:100%;background:none;border:1px solid #2d2d44;color:#6b7280;border-radius:10px;padding:10px;cursor:pointer;font-family:inherit;font-size:13px">Cancelar</button>
    </div>`;
  picker.addEventListener('click',e=>{if(e.target===picker)picker.remove();});
  document.body.appendChild(picker);

  const biz=S.config.name||'';
  const today=new Date().toLocaleDateString('es-PE');
  const qrUrl=v=>`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(v)}`;
  const esc=_printEsc, fd=_printDate, dest=_printDestino, cn=_printCleanNote;

  function cardLabel(s){
    const dl=dest(s), note=cn(s);
    return `<div class="lcard"><div class="ltop"><span class="lremit">REMITENTE</span><span class="lbiz">${esc(biz)}</span></div><div class="lmid"><div class="lpara">PARA:</div><div class="lname">${esc((s.name||'').toUpperCase())}</div><div class="lphone">${esc(s.phone)}</div>${dl.length?`<div class="ldlbl">DESTINO:</div>${dl.map(l=>`<div class="ldline">${esc(l)}</div>`).join('')}`:''} ${s.cost?`<div class="lcost">MONTO: S/ ${esc(s.cost)}</div>`:''} ${note?`<div class="lnote">${esc(note)}</div>`:''}</div><div class="lbot"><span class="lcou">${esc(s.courier)}</span><span class="ldat">${fd(s.date)}</span></div></div>`;
  }
  function cardA4(s){
    const dl=dest(s), note=cn(s);
    return `<div class="card"><div class="cbody"><div class="cname">${esc(s.name)}</div><div class="crow">📞 ${esc(s.phone)}</div>${dl.map(l=>`<div class="crow caddr">${esc(l)}</div>`).join('')}<div class="crow">🚚 ${esc(s.courier)} · ${fd(s.date)}${s.cost?` · S/ ${esc(s.cost)}`:''}</div>${note?`<div class="crow cnote">📝 ${esc(note)}</div>`:''}<span class="cbadge">${esc(s.status)}</span></div><div class="cqr"><img src="${qrUrl(s.phone)}" width="68" height="68" alt="QR"><div class="cqrn">${esc(s.phone)}</div></div></div>`;
  }
  function cardTicket(s){
    const dl=dest(s), note=cn(s);
    return `<div class="tk"><div class="tbiz">${esc(biz)}</div><div class="tsep">- - - - - - - - - - - -</div><div class="tname">${esc((s.name||'').toUpperCase())}</div><div class="tphone">${esc(s.phone)}</div>${dl.map(l=>`<div class="tdest">${esc(l)}</div>`).join('')}${note?`<div class="tnote">${esc(note)}</div>`:''} ${s.cost?`<div class="tcost">MONTO: S/ ${esc(s.cost)}</div>`:''}<div class="tfoot"><b>${esc(s.courier)}</b> ${fd(s.date)}</div><div class="tqr"><img src="${qrUrl(s.phone)}" width="88" height="88" alt="${esc(s.phone)}"></div><div class="tcut">· · · · · · · · · · · ·</div></div>`;
  }

  window._doPrintFmt=function(fmt){
    document.getElementById('_printPicker')?.remove();
    const cards={label:list.map(cardLabel).join(''),lista:list.map(cardA4).join(''),ticket:list.map(cardTicket).join('')};
    const pageCSS={label:'@page{size:A4 portrait;margin:12mm 10mm}',lista:'@page{size:A4 portrait;margin:12mm 10mm}',ticket:'@page{size:80mm auto;margin:3mm 2mm}'};
    const bodyMap={
      label:`<div id="pw">${cards.label}</div>`,
      lista:`<div id="pw"><div style="font-family:Arial,sans-serif;font-size:9pt;color:#555;margin-bottom:5mm;padding-bottom:3mm;border-bottom:1px solid #ccc">📦 ${esc(biz)} · ${today} · ${list.length} envío${list.length!==1?'s':''}</div><div class="grid">${cards.lista}</div></div>`,
      ticket:`<div id="pw"><div class="twrap">${cards.ticket}</div></div>`
    };
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Imprimir — ${esc(biz)}</title>
<style>
${pageCSS[fmt]}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:#000}
/* ETIQUETA */
.lcard{font-family:Arial,Helvetica,sans-serif;border:1.5px solid #000;margin-bottom:8mm;break-inside:avoid;page-break-inside:avoid}
.ltop,.lbot{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;background:#f4f4f4;border-bottom:1px solid #ccc}
.lbot{border-top:1px solid #ccc;border-bottom:none}
.lremit{font-size:7pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase}
.lbiz{font-size:9pt;font-weight:700}
.lmid{padding:8px 12px 6px}
.lpara{font-size:7pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px}
.lname{font-size:18pt;font-weight:700;line-height:1.15;margin-bottom:3px}
.lphone{font-size:13pt;font-weight:600;margin-bottom:6px}
.ldlbl{font-size:7pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-top:6px;margin-bottom:2px}
.ldline{font-size:9.5pt;line-height:1.5;font-weight:500}
.lcost{font-size:10pt;font-weight:700;margin-top:5px}
.lnote{font-size:8pt;color:#555;margin-top:4px}
.lcou{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.ldat{font-size:9pt;font-weight:600}
/* LISTA */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.card{display:flex;gap:8px;border:1px solid #aaa;border-radius:5px;padding:7px;break-inside:avoid;page-break-inside:avoid}
.cbody{flex:1;min-width:0}
.cname{font-size:12pt;font-weight:700;margin-bottom:2px;font-family:Arial,sans-serif}
.crow{font-size:8pt;color:#333;margin-bottom:2px;line-height:1.4;font-family:Arial,sans-serif}
.caddr{color:#444}.cnote{color:#666}
.cbadge{display:inline-block;font-size:7pt;font-weight:700;background:#eee;border:1px solid #ccc;border-radius:6px;padding:1px 7px;margin-top:3px}
.cqr{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.cqrn{font-size:6pt;color:#999;text-align:center;max-width:70px;word-break:break-all;font-family:Arial,sans-serif}
/* TICKET */
.twrap{width:72mm;margin:0 auto;font-family:'Courier New',Courier,monospace;font-size:9pt}
.tk{margin-bottom:5mm}
.tbiz{text-align:center;font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:1.5mm}
.tsep{font-size:7pt;color:#666;margin:1.5mm 0;text-align:center}
.tname{font-size:12pt;font-weight:700;margin:1mm 0;line-height:1.2}
.tphone{font-size:10pt;margin:1mm 0}
.tdest{font-size:8pt;margin:.5mm 0;line-height:1.4}
.tnote{font-size:7.5pt;color:#444;margin:.5mm 0}
.tcost{font-size:10pt;font-weight:700;margin:1.5mm 0}
.tfoot{display:flex;justify-content:space-between;font-size:8.5pt;margin:1.5mm 0;border-top:1px solid #aaa;padding-top:1.5mm}
.tqr{text-align:center;margin:2mm 0}
.tcut{text-align:center;font-size:7pt;color:#bbb;margin:2mm 0 4mm;letter-spacing:2px}
</style>
<script>
window.addEventListener('load',function(){
  var imgs=Array.from(document.images);
  if(!imgs.length){setTimeout(function(){window.print();},150);return;}
  var n=imgs.length,done=0;
  function chk(){if(++done>=n)setTimeout(function(){window.print();},200);}
  imgs.forEach(function(i){if(i.complete)chk();else{i.onload=chk;i.onerror=chk;}});
});
<\/script>
</head><body>${bodyMap[fmt]}</body></html>`;
    const w=window.open('','_blank');
    if(!w){toast('⚠️ Permite ventanas emergentes en tu navegador');return;}
    w.document.write(html);
    w.document.close();
  };
}
