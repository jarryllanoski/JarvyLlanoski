// print.js — Funciones de impresión (etiqueta A4, lista, ticket 80mm, sticker 100×150mm)

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
  if(s.address) r.push(s.address);
  if(s.referencia) r.push('Ref: '+s.referencia);
  return r;
}
function _printCleanNote(s){ return (s.notes||'').replace(/Agencia:[^|]*(\|)?/gi,'').replace(/\s*\|\s*$/,'').trim(); }

function doPrint(){
  const selected = S.shipments.filter(x=>x.sel);
  const allList  = selected.length ? selected : S.shipments;
  const newList  = S.shipments.filter(x=>x.printed===false);

  if(!allList.length){toast('Sin envíos');return;}

  /* estado interno del picker */
  let _filter   = 'all';   /* 'all' | 'new' */
  let _pkgCount = 1;

  /* ── Picker ── */
  let prev=document.getElementById('_printPicker');
  if(prev) prev.remove();
  const picker=document.createElement('div');
  picker.id='_printPicker';
  picker.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';

  function pickerHTML(){
    const list   = _filter==='new' ? newList : allList;
    const isEmpty= list.length===0;
    const btnStyle= (active)=>`background:${active?'rgba(59,130,246,.18)':'#13131f'};border:1.5px solid ${active?'#3b82f6':'#2d2d44'};color:${active?'#93c5fd':'#9ca3af'};border-radius:10px;padding:8px 14px;font-size:13px;font-weight:${active?700:500};cursor:pointer;font-family:inherit;flex:1`;
    const fmtBtn = (fmt,icon,title,sub)=>isEmpty?'':`<button onclick="window._doPrintFmt('${fmt}')" style="background:#13131f;border:1.5px solid #2d2d44;color:#f0f0f8;border-radius:14px;padding:13px 16px;text-align:left;cursor:pointer;font-family:inherit;width:100%" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#2d2d44'"><div style="font-size:14px;font-weight:700;margin-bottom:2px">${icon} ${title}</div><div style="font-size:11px;color:#6b7280">${sub}</div></button>`;
    return `
    <div style="background:#0f0f1a;border:1px solid #2d2d44;border-radius:20px;padding:24px 20px;max-width:360px;width:100%;font-family:system-ui,sans-serif">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:28px;margin-bottom:4px">🖨️</div>
        <div style="font-size:16px;font-weight:700;color:#f0f0f8">Imprimir envíos</div>
      </div>

      <!-- FILTRO -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.6px;text-transform:uppercase;margin-bottom:7px">¿Cuáles imprimir?</div>
        <div style="display:flex;gap:6px">
          <button id="_pfAll" onclick="window._setPrintFilter('all')" style="${btnStyle(_filter==='all')}">
            Todos · ${allList.length}
          </button>
          <button id="_pfNew" onclick="window._setPrintFilter('new')" style="${btnStyle(_filter==='new')}${newList.length===0?';opacity:.45':''}">
            ✨ Nuevos · ${newList.length}
          </button>
        </div>
        ${_filter==='new'&&newList.length===0?`<div style="margin-top:8px;font-size:12px;color:#e3b341;background:rgba(227,179,65,.08);border:1px solid rgba(227,179,65,.2);border-radius:8px;padding:7px 10px">Sin pedidos nuevos — todos ya fueron impresos</div>`:''}
      </div>

      <!-- BULTOS -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.6px;text-transform:uppercase;margin-bottom:7px">Bultos por envío</div>
        <div style="display:flex;align-items:center;gap:10px;background:#13131f;border:1.5px solid #2d2d44;border-radius:10px;padding:8px 12px">
          <button onclick="window._setPkgCount(-1)" style="background:rgba(255,255,255,.06);border:1px solid #2d2d44;color:#f0f0f8;border-radius:7px;width:32px;height:32px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">−</button>
          <div style="flex:1;text-align:center">
            <span id="_pkgNum" style="font-size:22px;font-weight:700;color:#f0f0f8">${_pkgCount}</span>
            <span style="font-size:12px;color:#6b7280;margin-left:4px">${_pkgCount===1?'bulto':'bultos'}</span>
          </div>
          <button onclick="window._setPkgCount(1)" style="background:rgba(255,255,255,.06);border:1px solid #2d2d44;color:#f0f0f8;border-radius:7px;width:32px;height:32px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>
        </div>
      </div>

      <!-- FORMATOS -->
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
        ${fmtBtn('sticker','📦','Sticker 100×150 mm','Etiquetadora HOIN · nombre grande · dirección clara')}
        ${fmtBtn('ticket','🧾','Ticket 80mm','Impresora térmica de recibo')}
        ${fmtBtn('label','🏷️','Etiqueta A4','Una etiqueta por envío · REMITENTE / PARA / DESTINO')}
        ${fmtBtn('lista','📋','Lista A4','2 columnas por página · incluye código QR')}
        ${isEmpty?`<div style="text-align:center;padding:16px;color:#6b7280;font-size:13px">Sin pedidos que imprimir</div>`:''}
      </div>

      <button onclick="document.getElementById('_printPicker').remove()" style="width:100%;background:none;border:1px solid #2d2d44;color:#6b7280;border-radius:10px;padding:10px;cursor:pointer;font-family:inherit;font-size:13px">Cancelar</button>
    </div>`;
  }

  picker.innerHTML=pickerHTML();
  picker.addEventListener('click',e=>{if(e.target===picker)picker.remove();});
  document.body.appendChild(picker);

  window._setPrintFilter=function(f){
    _filter=f;
    const p=document.getElementById('_printPicker');
    if(p) p.innerHTML=pickerHTML();
    p&&p.addEventListener('click',e=>{if(e.target===p)p.remove();});
  };
  window._setPkgCount=function(delta){
    _pkgCount=Math.max(1,Math.min(99,_pkgCount+delta));
    const el=document.getElementById('_pkgNum');
    if(el){
      el.textContent=_pkgCount;
      el.nextElementSibling.textContent=_pkgCount===1?'bulto':'bultos';
    }
  };

  /* ────────────────────────────────────────────────
     CARD GENERATORS
  ──────────────────────────────────────────────── */
  const biz   = S.config.name||'';
  const today = new Date().toLocaleDateString('es-PE');
  const qrUrl = v=>`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(v)}`;
  const esc=_printEsc, fd=_printDate, dest=_printDestino, cn=_printCleanNote;

  function pkgBadge(n,big){
    if(n<=1) return '';
    return big
      ? `<div style="font-size:13pt;font-weight:900;letter-spacing:.5px;margin-top:3px">📦 ${n} BULTOS</div>`
      : `<div style="font-size:9pt;font-weight:700;margin-top:2px">📦 ${n} BULTOS</div>`;
  }

  /* Sticker 100×150mm */
  function cardSticker(s,n){
    const dl=dest(s), note=cn(s);
    return `<div class="sk">
      <div class="sk-top"><span class="sk-from-lbl">REMITENTE</span><span class="sk-from">${esc(biz)}</span></div>
      <div class="sk-rule"></div>
      <div class="sk-body">
        <div class="sk-to-lbl">PARA:</div>
        <div class="sk-name">${esc((s.name||'').toUpperCase())}</div>
        <div class="sk-phone">${esc(s.phone)}</div>
        ${dl.length?`<div class="sk-rule sk-rule-light"></div><div class="sk-addr-lbl">DIRECCIÓN:</div>${dl.map(l=>`<div class="sk-addr">${esc(l)}</div>`).join('')}`:''}
        ${note?`<div class="sk-note">${esc(note)}</div>`:''}
        ${s.cost?`<div class="sk-cost">MONTO: S/ ${esc(s.cost)}</div>`:''}
        ${pkgBadge(n,true)}
      </div>
      <div class="sk-rule"></div>
      <div class="sk-footer">
        <span class="sk-courier">${esc(s.courier)}</span>
        <span class="sk-date">${fd(s.date)}</span>
      </div>
      <div class="sk-qr"><img src="${qrUrl(s.phone)}" width="110" height="110" alt="QR"></div>
    </div>`;
  }

  /* Ticket 80mm */
  function cardTicket(s,n){
    const dl=dest(s), note=cn(s);
    return `<div class="tk">
      <div class="tbiz">${esc(biz)}</div>
      <div class="tsep">- - - - - - - - - - - -</div>
      <div class="tname">${esc((s.name||'').toUpperCase())}</div>
      <div class="tphone">${esc(s.phone)}</div>
      ${dl.length?`<div class="tdest-lbl">DIRECCIÓN:</div>${dl.map(l=>`<div class="tdest">${esc(l)}</div>`).join('')}`:''}
      ${note?`<div class="tnote">${esc(note)}</div>`:''}
      ${s.cost?`<div class="tcost">MONTO: S/ ${esc(s.cost)}</div>`:''}
      ${pkgBadge(n,false)}
      <div class="tfoot"><b>${esc(s.courier)}</b><span>${fd(s.date)}</span></div>
      <div class="tqr"><img src="${qrUrl(s.phone)}" width="100" height="100" alt="${esc(s.phone)}"></div>
      <div class="tcut">&middot; &middot; &middot; &middot; &middot; &middot; &middot; &middot; &middot; &middot; &middot; &middot;</div>
    </div>`;
  }

  /* Etiqueta A4 */
  function cardLabel(s,n){
    const dl=dest(s), note=cn(s);
    return `<div class="lcard"><div class="ltop"><span class="lremit">REMITENTE</span><span class="lbiz">${esc(biz)}</span></div><div class="lmid"><div class="lpara">PARA:</div><div class="lname">${esc((s.name||'').toUpperCase())}</div><div class="lphone">${esc(s.phone)}</div>${dl.length?`<div class="ldlbl">DESTINO:</div>${dl.map(l=>`<div class="ldline">${esc(l)}</div>`).join('')}`:''} ${s.cost?`<div class="lcost">MONTO: S/ ${esc(s.cost)}</div>`:''} ${n>1?`<div class="lcost">📦 ${n} BULTOS</div>`:''} ${note?`<div class="lnote">${esc(note)}</div>`:''}</div><div class="lbot"><span class="lcou">${esc(s.courier)}</span><span class="ldat">${fd(s.date)}</span></div></div>`;
  }

  /* Lista A4 */
  function cardA4(s,n){
    const dl=dest(s), note=cn(s);
    return `<div class="card"><div class="cbody"><div class="cname">${esc(s.name)}</div><div class="crow">📞 ${esc(s.phone)}</div>${dl.map(l=>`<div class="crow caddr">${esc(l)}</div>`).join('')}<div class="crow">🚚 ${esc(s.courier)} · ${fd(s.date)}${s.cost?` · S/ ${esc(s.cost)}`:''}</div>${n>1?`<div class="crow" style="font-weight:700">📦 ${n} bultos</div>`:''} ${note?`<div class="crow cnote">📝 ${esc(note)}</div>`:''}<span class="cbadge">${esc(s.status)}</span></div><div class="cqr"><img src="${qrUrl(s.phone)}" width="68" height="68" alt="QR"><div class="cqrn">${esc(s.phone)}</div></div></div>`;
  }

  /* ────────────────────────────────────────────────
     GENERAR E IMPRIMIR
  ──────────────────────────────────────────────── */
  window._doPrintFmt=function(fmt){
    document.getElementById('_printPicker')?.remove();
    const list   = _filter==='new' ? newList : allList;
    const n      = _pkgCount;
    if(!list.length){toast('Sin pedidos que imprimir');return;}

    const cards={
      sticker: list.map(s=>cardSticker(s,n)).join(''),
      ticket:  list.map(s=>cardTicket(s,n)).join(''),
      label:   list.map(s=>cardLabel(s,n)).join(''),
      lista:   list.map(s=>cardA4(s,n)).join(''),
    };
    const pageCSS={
      sticker:'@page{size:100mm 150mm;margin:0}',
      label:  '@page{size:A4 portrait;margin:12mm 10mm}',
      lista:  '@page{size:A4 portrait;margin:12mm 10mm}',
      ticket: '@page{size:80mm auto;margin:3mm 2mm}',
    };
    const bodyMap={
      sticker:`<div id="pw">${cards.sticker}</div>`,
      label:  `<div id="pw">${cards.label}</div>`,
      lista:  `<div id="pw"><div style="font-family:Arial,sans-serif;font-size:9pt;color:#555;margin-bottom:5mm;padding-bottom:3mm;border-bottom:1px solid #ccc">📦 ${esc(biz)} · ${today} · ${list.length} envío${list.length!==1?'s':''}</div><div class="grid">${cards.lista}</div></div>`,
      ticket: `<div id="pw"><div class="twrap">${cards.ticket}</div></div>`,
    };

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Imprimir — ${esc(biz)}</title>
<style>
${pageCSS[fmt]}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:#000}

/* ═══ STICKER 100×150mm ═══ */
.sk{width:100mm;height:150mm;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;border:1px solid #000;break-inside:avoid;page-break-after:always;overflow:hidden}
.sk-top{display:flex;align-items:center;gap:6px;padding:5px 8px;background:#f0f0f0;border-bottom:1px solid #ccc;flex-shrink:0}
.sk-from-lbl{font-size:6.5pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap}
.sk-from{font-size:9pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sk-rule{border:none;border-top:1.5px solid #000;margin:0;flex-shrink:0}
.sk-rule-light{border-top-width:1px;border-top-style:dashed;border-top-color:#bbb;margin:4px 0}
.sk-body{padding:6px 8px;flex:1;overflow:hidden}
.sk-to-lbl{font-size:6.5pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px}
.sk-name{font-size:20pt;font-weight:900;line-height:1.1;margin-bottom:4px;letter-spacing:-.2px}
.sk-phone{font-size:14pt;font-weight:700;margin-bottom:4px;letter-spacing:.5px}
.sk-addr-lbl{font-size:6.5pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px}
.sk-addr{font-size:11pt;font-weight:500;line-height:1.35}
.sk-note{font-size:8pt;color:#555;margin-top:3px}
.sk-cost{font-size:11pt;font-weight:700;margin-top:4px}
.sk-footer{display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#000;color:#fff;flex-shrink:0}
.sk-courier{font-size:12pt;font-weight:900;text-transform:uppercase;letter-spacing:.5px}
.sk-date{font-size:10pt;font-weight:700}
.sk-qr{text-align:center;padding:5px 0;flex-shrink:0}

/* ═══ TICKET 80mm ═══ */
.twrap{width:72mm;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:9pt}
.tk{margin-bottom:5mm}
.tbiz{text-align:center;font-size:11pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:1.5mm}
.tsep{font-size:7pt;color:#666;margin:1.5mm 0;text-align:center;letter-spacing:2px}
.tname{font-size:14pt;font-weight:700;margin:1.5mm 0;line-height:1.15}
.tphone{font-size:13pt;font-weight:700;margin:1mm 0;letter-spacing:.5px}
.tdest-lbl{font-size:7pt;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-top:2mm;margin-bottom:1mm}
.tdest{font-size:10.5pt;font-weight:500;margin:.5mm 0;line-height:1.4}
.tnote{font-size:8pt;color:#444;margin:.5mm 0}
.tcost{font-size:11pt;font-weight:700;margin:1.5mm 0}
.tfoot{display:flex;justify-content:space-between;font-size:10pt;font-weight:700;margin:1.5mm 0;border-top:1.5px solid #000;padding-top:1.5mm}
.tqr{text-align:center;margin:2mm 0}
.tcut{text-align:center;font-size:7pt;color:#bbb;margin:2mm 0 4mm;letter-spacing:2px}

/* ═══ ETIQUETA A4 ═══ */
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

/* ═══ LISTA A4 ═══ */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.card{display:flex;gap:8px;border:1px solid #aaa;border-radius:5px;padding:7px;break-inside:avoid;page-break-inside:avoid}
.cbody{flex:1;min-width:0}
.cname{font-size:12pt;font-weight:700;margin-bottom:2px;font-family:Arial,sans-serif}
.crow{font-size:8pt;color:#333;margin-bottom:2px;line-height:1.4;font-family:Arial,sans-serif}
.caddr{color:#444}.cnote{color:#666}
.cbadge{display:inline-block;font-size:7pt;font-weight:700;background:#eee;border:1px solid #ccc;border-radius:6px;padding:1px 7px;margin-top:3px}
.cqr{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.cqrn{font-size:6pt;color:#999;text-align:center;max-width:70px;word-break:break-all;font-family:Arial,sans-serif}
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

    /* marcar como impresos */
    list.forEach(s=>{ s.printed=true; });
    save();
    if(_filter==='new') toast('✅ '+list.length+' pedido'+(list.length!==1?'s':'')+' marcado'+(list.length!==1?'s':'')+' como impreso'+(list.length!==1?'s':''));
  };
}
