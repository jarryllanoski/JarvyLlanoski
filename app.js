// app.js — Lógica principal (sin Firebase, sin PIN, sin tokens)

/* ── STORAGE ─────────────────────────────────────────────────────── */
let _mem = {};
function lsGet(k) { try { return localStorage.getItem(k); } catch(e) { return _mem[k] || null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch(e) { _mem[k] = v; } }

/* ── STATE ───────────────────────────────────────────────────────── */
let S = JSON.parse(lsGet('dpanel') || '{}');
if (!S.shipments)     S.shipments    = [];
if (!S.couriers)      S.couriers     = [];
if (!S.extraFields)   S.extraFields  = [];
if (!S.labels)        S.labels       = [];
if (!S.msgTemplates)  S.msgTemplates = {};
if (!S.courierActive) S.courierActive= {};
if (!S.suppliers)     S.suppliers    = [];
if (!S.trash)         S.trash        = [];
if (!S.courierTypes)  S.courierTypes = {};
if (!S.dispatch)      S.dispatch     = { days:[1,2,3,4,5], cutHour:'11:30', anticipation:0 };
if (!S.config)        S.config       = { name:'Mi Negocio', phone:'999000000', city:'Lima, Perú' };
if (S.config.autoStatusEnabled === undefined || S.config.autoStatusEnabled === null)
  S.config.autoStatusEnabled = true;
if (!S.config.autoRules)
  S.config.autoRules = { embalado:true, guia:true, comprobante:false, arrivedAtDest:true, pendingPayment:true, finalizado:true };

/* ── MIGRATIONS ──────────────────────────────────────────────────── */
S.shipments.forEach(s => { if (STATUS_MIGRATE[s.status]) s.status = STATUS_MIGRATE[s.status]; });
(S.trash || []).forEach(t => { if (t.shipment && STATUS_MIGRATE[t.shipment.status]) t.shipment.status = STATUS_MIGRATE[t.shipment.status]; });
S.shipments.forEach(s => {
  if (s.docTicket !== undefined && s.docComprobante === undefined) { s.docComprobante = s.docTicket; delete s.docTicket; }
  if (s.chkTicket !== undefined && s.chkComprobante === undefined) { s.chkComprobante = s.chkTicket; delete s.chkTicket; }
  if (s.docEmbalado === undefined) s.docEmbalado = null;
  if (s.chkEmbalado === undefined) s.chkEmbalado = false;
});
S.extraFields = S.extraFields.map(f => typeof f === 'string' ? { name:f, required:false, visible:true } : f);
const OLD_FIXED = ['NUEVO PEDIDO','EN PROCESO','POR ALISTAR','ENVIADO','FINALIZADO','ENTREGADO','PENDIENTE'];
S.labels = S.labels.filter(l => !OLD_FIXED.includes(l) && !FIXED_LABELS.includes(l));
const _initCustom = S.labels.slice();
S.labels = [...FIXED_LABELS, ..._initCustom];
FIXED_COURIERS.forEach(c => { if (!S.couriers.includes(c)) S.couriers.unshift(c); });

/* ── SAVE ────────────────────────────────────────────────────────── */
function save() { lsSet('dpanel', JSON.stringify(S)); }

/* ── HELPERS ─────────────────────────────────────────────────────── */
function statusPrio(st)  { return FIXED_LABELS.indexOf(st); }
function allStatuses()   { return S.labels; }
function stIcon(st)      { return FIXED_LABEL_ICONS[st] || '🏷️'; }
function stClass(st) {
  if (st==='Nuevo pedido'||st==='Faltante / pedir proveedor'||st==='Pendiente de pago') return 'st-pend';
  if (st==='Por alistar'||st==='Alistado'||st==='Enviado') return 'st-env';
  if (st==='Llegó a destino') return 'st-cust';
  if (st==='Finalizado') return 'st-ent';
  return 'st-cust';
}
function stSoptClass(st) {
  if (st==='Nuevo pedido'||st==='Faltante / pedir proveedor'||st==='Pendiente de pago') return 'sopt-pend';
  if (st==='Por alistar'||st==='Alistado'||st==='Enviado') return 'sopt-env';
  if (st==='Llegó a destino') return 'sopt-cust';
  if (st==='Finalizado') return 'sopt-ent';
  return 'sopt-cust';
}
function fillVars(tpl, s) {
  return tpl
    .replace(/\{nombre\}/gi,    s.name)
    .replace(/\{telefono\}/gi,  s.phone)
    .replace(/\{direccion\}/gi, s.address)
    .replace(/\{courier\}/gi,   s.courier)
    .replace(/\{fecha\}/gi,     s.date||'—')
    .replace(/\{costo\}/gi,     s.cost ? 'S/ '+s.cost : '—')
    .replace(/\{estado\}/gi,    s.status);
}
function clearSearch() { $('fSearch').value = ''; $('fSearch').focus(); render(); }

/* ── STATS ───────────────────────────────────────────────────────── */
function updateStats() {
  if (_filt === 'Faltante / pedir proveedor') { renderStatsAsSuppliers(); return; }
  $('statsArea').style.display = 'grid';
  $('suppStatsArea').style.display = 'none';
  $('sTotal').textContent = S.shipments.length;
  $('sPend').textContent  = S.shipments.filter(x => x.status==='Nuevo pedido'||x.status==='Faltante / pedir proveedor'||x.status==='Pendiente de pago').length;
  $('sEnv').textContent   = S.shipments.filter(x => x.status==='Por alistar'||x.status==='Alistado'||x.status==='Enviado'||x.status==='Llegó a destino').length;
  $('sEnt').textContent   = S.shipments.filter(x => x.status==='Finalizado').length;
}

function renderStatsAsSuppliers() {
  $('statsArea').style.display = 'none';
  $('suppStatsArea').style.display = 'block';
  if (!S.suppliers) S.suppliers = [];
  const suppWithItems = S.suppliers.filter(sup => (sup.items||[]).length > 0);
  const allReady = suppWithItems.length > 0 && suppWithItems.every(sup => sup.items.every(x => x.done));
  const enProceso = S.shipments.filter(x => x.status === 'EN PROCESO');
  $('suppStatsArea').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:var(--text)">🏭 Proveedores</div>
      <div style="display:flex;gap:7px;align-items:center">
        <div style="display:flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:5px 9px">
          <span style="font-size:12px">🔍</span>
          <input id="suppGlobalSearch" placeholder="Pega código..."
            onkeydown="if(!(event.ctrlKey||event.metaKey))event.preventDefault()"
            oninput="const v=this.value;this.value='';if(v.trim())globalSuppSearch(v);"
            style="background:none;border:none;outline:none;color:var(--text);font-size:11px;width:90px;caret-color:transparent">
        </div>
        <button onclick="openOverlay('suppNewOverlay')" style="background:var(--blue);border:none;border-radius:7px;color:#fff;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">＋ Agregar</button>
      </div>
    </div>
    <div id="globalSuppResult" style="display:none;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:12px;line-height:1.8"></div>
    <div class="supp-cards">
      ${S.suppliers.map(sup => {
        const pending = (sup.items||[]).filter(x => !x.done).length;
        const total   = (sup.items||[]).length;
        return `<div class="supp-card ${pending>0?'has-pending':''}" onclick="openSupplier('${sup.id}')">
          <div class="supp-card-name">${sup.name}</div>
          <div class="supp-card-phone">
            <span style="font-size:11px;color:var(--blue)">📞 ${sup.phone}</span>
            <button onclick="event.stopPropagation();sendSuppList('${sup.id}')"
              style="background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.3);color:var(--green);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">
              💬 Enviar
            </button>
          </div>
          ${total>0?`<div class="supp-card-items">
            ${(sup.items||[]).slice(0,4).map(it=>`<div class="supp-item-row">
              <div class="supp-item-dot ${it.done?'done':''}"></div>
              <span class="supp-item-text ${it.done?'done':''}" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.text}</span>
            </div>`).join('')}
            ${total>4?`<div style="font-size:10px;color:var(--text2)">+${total-4} más...</div>`:''}
          </div>`:`<div style="font-size:11px;color:var(--text2);font-style:italic;margin-top:4px">Lista vacía</div>`}
          ${pending>0?`<div style="margin-top:6px;font-size:10px;font-weight:700;color:var(--red)">⚠️ ${pending} pendiente${pending>1?'s':''}</div>`:
            total>0?`<div style="margin-top:6px;font-size:10px;font-weight:700;color:var(--green)">✅ Todo listo</div>`:''}
        </div>`;
      }).join('')}
      ${!S.suppliers.length?`<div style="font-size:12px;color:var(--text2);padding:20px;text-align:center;width:100%">Toca ＋ para agregar tu primer proveedor</div>`:''}
    </div>
    ${allReady&&enProceso.length>0?`
    <button onclick="moveAllToPorAlistar()" style="width:100%;margin-top:10px;padding:12px;background:linear-gradient(135deg,var(--green),#1a7f37);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:14px;font-family:'Syne',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
      ✅ Todo en stock — Pasar ${enProceso.length} pedido${enProceso.length>1?'s':''} a POR ALISTAR
    </button>`:``}
  `;
}

/* ── FILTER CHIPS ────────────────────────────────────────────────── */
let _filt = '';
let _chipSort = {};

function renderChips() {
  const all = allStatuses();
  const todosChip = $('chipTodos');
  if (todosChip) todosChip.className = 'chip ' + (_filt === '' ? 'active' : '');
  $('filterChips').innerHTML = all.map(v => {
    const sortIcon = _chipSort[v] && _chipSort[v] !== 'courier_date' ? '⚙️' : '';
    return `<div class="chip ${_filt===v?'active':''}"
      onclick="setFilt('${v}')"
      ondblclick="openChipSort('${v}')"
    >${stIcon(v)} ${v}${sortIcon?` <span style="font-size:9px">${sortIcon}</span>`:''}</div>`;
  }).join('');
}
function setFilt(v) { _filt = v; renderChips(); render(); }

function openChipSort(label) {
  _filt = label; renderChips(); render();
  const cur = _chipSort[label] || 'courier_date';
  $('chipSortTitle').textContent = `${stIcon(label)} ${label}`;
  ['courier_date','date','name','cost','cost_desc'].forEach(id => {
    const el = $('cs_'+id); if (el) el.classList.toggle('active', cur===id);
  });
  openOverlay('chipSortOverlay');
}
function setChipSort(v) {
  _chipSort[_filt] = v;
  ['courier_date','date','name','cost','cost_desc'].forEach(id => {
    const el = $('cs_'+id); if (el) el.classList.toggle('active', v===id);
  });
  render(); renderChips();
  toast('↕️ Orden actualizado');
}

function openAllLabels() {
  const all = allStatuses();
  $('allLabelsList').innerHTML = [
    `<button class="sopt" style="background:rgba(56,139,253,.1);border-color:rgba(56,139,253,.4);color:var(--blue)" onclick="setFilt('');closeOverlay('allLabelsOverlay')">📋 TODOS</button>`,
    ...all.map(st => `<button class="sopt ${stSoptClass(st)}" onclick="setFilt('${st}');closeOverlay('allLabelsOverlay')">${stIcon(st)} ${st}<span style="float:right;font-size:11px;opacity:.6">${S.shipments.filter(x=>x.status===st).length}</span></button>`)
  ].join('');
  openOverlay('allLabelsOverlay');
}

/* ── ADVANCED SEARCH ─────────────────────────────────────────────── */
let _adv = { dateFrom:'', dateTo:'', couriers:[], costMin:'', costMax:'', doc:'any', sort:'newest' };
let _advActive = false;

function openAdvSearch() {
  $('asCourierList').innerHTML = S.couriers.map(c =>
    `<div class="as-courier-chip ${_adv.couriers.includes(c)?'active':''}" onclick="toggleAsCourier('${c.replace(/'/g,"\\'")}')">🚚 ${c}</div>`
  ).join('');
  $('asDateFrom').value = _adv.dateFrom; $('asDateTo').value = _adv.dateTo;
  $('asCostMin').value = _adv.costMin;   $('asCostMax').value = _adv.costMax;
  ['asDocAny','asDocGuia','asDocComprobante','asDocEmbalado','asDocNone'].forEach(id => $(id)?.classList.remove('active'));
  const dm = { any:'asDocAny', guia:'asDocGuia', comprobante:'asDocComprobante', embalado:'asDocEmbalado', none:'asDocNone' };
  $(dm[_adv.doc])?.classList.add('active');
  const sm = { newest:'sortNewest', oldest:'sortOldest', name:'sortName', cost:'sortCost' };
  ['sortNewest','sortOldest','sortName','sortCost'].forEach(id => $(id)?.classList.remove('active'));
  $(sm[_adv.sort])?.classList.add('active');
  openOverlay('advSearchOverlay');
}
function toggleAsCourier(c) {
  const idx = _adv.couriers.indexOf(c);
  if (idx >= 0) _adv.couriers.splice(idx,1); else _adv.couriers.push(c);
  document.querySelectorAll('.as-courier-chip').forEach(el =>
    el.classList.toggle('active', _adv.couriers.includes(el.textContent.replace('🚚 ','').trim()))
  );
}
function setAsDoc(v) {
  _adv.doc = v;
  const dm = { any:'asDocAny', guia:'asDocGuia', comprobante:'asDocComprobante', embalado:'asDocEmbalado', none:'asDocNone' };
  ['asDocAny','asDocGuia','asDocComprobante','asDocEmbalado','asDocNone'].forEach(id => $(id)?.classList.remove('active'));
  $(dm[v])?.classList.add('active');
}
function setSort(v) {
  _adv.sort = v;
  const sm = { newest:'sortNewest', oldest:'sortOldest', name:'sortName', cost:'sortCost' };
  ['sortNewest','sortOldest','sortName','sortCost'].forEach(id => $(id)?.classList.remove('active'));
  $(sm[v])?.classList.add('active');
}
function applyAdvSearch() {
  _adv.dateFrom = $('asDateFrom').value; _adv.dateTo = $('asDateTo').value;
  _adv.costMin  = $('asCostMin').value;  _adv.costMax = $('asCostMax').value;
  _advActive = hasAdvFilters();
  closeOverlay('advSearchOverlay'); render();
}
function clearAdvSearch() {
  _adv = { dateFrom:'', dateTo:'', couriers:[], costMin:'', costMax:'', doc:'any', sort:'newest' };
  _advActive = false; render();
}
function hasAdvFilters() {
  return !!(_adv.dateFrom||_adv.dateTo||_adv.couriers.length||_adv.costMin||_adv.costMax||_adv.doc!=='any'||_adv.sort!=='newest');
}
function updateAdvBar() {
  const bar = $('activeFiltersBar');
  if (!_advActive) { bar.style.display='none'; $('advSearchBtn').style.color='var(--text2)'; return; }
  $('advSearchBtn').style.color = 'var(--blue)';
  const tags = [];
  if (_adv.dateFrom||_adv.dateTo) tags.push(`📅 ${_adv.dateFrom||'...'} → ${_adv.dateTo||'...'}`);
  if (_adv.couriers.length) tags.push(`🚚 ${_adv.couriers.join(', ')}`);
  if (_adv.costMin||_adv.costMax) tags.push(`💰 S/${_adv.costMin||0}–${_adv.costMax||'∞'}`);
  if (_adv.doc!=='any') tags.push({guia:'🚚 Con guía',comprobante:'🧾 Con comprobante',embalado:'📦 Con embalado',none:'Sin docs'}[_adv.doc]||'');
  if (_adv.sort!=='newest') tags.push({oldest:'📅 Más antiguo',name:'🔤 A-Z',cost:'💰 Mayor costo'}[_adv.sort]||'');
  bar.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;align-items:center';
  bar.innerHTML = tags.map(t=>`<div class="active-filter-tag">${t}</div>`).join('') +
    `<div class="active-filter-tag" style="cursor:pointer;background:rgba(247,129,102,.12);border-color:rgba(247,129,102,.3);color:var(--red)" onclick="clearAdvSearch()">✕ Limpiar</div>`;
}

/* ── BULK STATUS (sin PIN) ───────────────────────────────────────── */
function bulkChangeStatus() {
  const sel = S.shipments.filter(x => x.sel);
  if (!sel.length) { toast('No hay clientes seleccionados'); return; }
  $('bulkStatusInfo').textContent = `Selecciona el nuevo estado para ${sel.length} cliente${sel.length>1?'s':''}`;
  $('bulkStatusOpts').innerHTML = allStatuses().map(st =>
    `<button class="sopt ${stSoptClass(st)}" onclick="applyBulkStatus('${st}')">
      <span>${stIcon(st)} ${st}</span>
    </button>`
  ).join('');
  openOverlay('bulkStatusOverlay');
}
function applyBulkStatus(st) {
  const sel = S.shipments.filter(x => x.sel);
  sel.forEach(s => { s.status = st; s.sel = false; });
  save(); render();
  closeOverlay('bulkStatusOverlay');
  toast(`✅ ${sel.length} cliente${sel.length>1?'s':''} → ${stIcon(st)} ${st}`);
}

/* ── AUTO-STATUS BADGE ───────────────────────────────────────────── */
function updateAutoStatusBadge() {
  const mode = calcAutoStatusMode();
  const MAP = {
    general:{ badge:'⚡ Automático general activo', hdr:'⚡ Auto',    c:'var(--green)',  bg:'rgba(46,160,67,.12)',  bc:'rgba(46,160,67,.3)' },
    partial:{ badge:'🔀 Automático parcial',         hdr:'🔀 Parcial', c:'#e3b341',       bg:'rgba(227,179,65,.12)', bc:'rgba(227,179,65,.3)' },
    manual: { badge:'⚙️ Modo manual',                hdr:'⚙️ Manual',  c:'var(--text2)',  bg:'rgba(139,148,158,.1)',bc:'rgba(139,148,158,.2)' },
  };
  const m = MAP[mode];
  const cfgEl = $('autoStatusBadge');
  if (cfgEl) { cfgEl.textContent = m.badge; Object.assign(cfgEl.style, { color:m.c, background:m.bg, borderColor:m.bc }); }
  const hdrEl = $('autoModeBadgeHdr');
  if (hdrEl) { hdrEl.textContent = m.hdr;   Object.assign(hdrEl.style, { color:m.c, background:m.bg, borderColor:m.bc }); }
  const generalOn = !!S.config.autoStatusEnabled;
  const rules = S.config.autoRules || {};
  const RULE_IDS = { embalado:'tglRuleEmbalado', guia:'tglRuleGuia', comprobante:'tglRuleComprobante', arrivedAtDest:'tglRuleArrived', pendingPayment:'tglRulePending', finalizado:'tglRuleFinalizado' };
  Object.entries(RULE_IDS).forEach(([k,id]) => {
    const el = $(id); if (!el) return;
    el.classList.toggle('on', generalOn || !!rules[k]);
    el.style.opacity = generalOn ? '0.5' : '1';
    el.style.pointerEvents = generalOn ? 'none' : 'auto';
  });
  if ($('tglAutoStatus')) $('tglAutoStatus').classList.toggle('on', generalOn);
}
function toggleAutoRule(key) {
  if (S.config.autoStatusEnabled) { toast('Desactiva el modo general primero'); return; }
  if (!S.config.autoRules) S.config.autoRules = {};
  S.config.autoRules[key] = !S.config.autoRules[key];
  updateAutoStatusBadge(); save();
  const names = { embalado:'📦 Embalado', guia:'🚚 Guía courier', comprobante:'🧾 Comprobante', arrivedAtDest:'📍 Llegó a destino', pendingPayment:'💳 Pendiente de pago', finalizado:'✅ Finalizado' };
  toast((S.config.autoRules[key]?'✓ Regla activada: ':'✗ Regla desactivada: ')+(names[key]||key));
}
function toggleAutoStatusCfg() {
  S.config.autoStatusEnabled = !S.config.autoStatusEnabled;
  updateAutoStatusBadge(); save();
  toast(S.config.autoStatusEnabled ? '⚡ Modo automático general ON' : '🔀 Usando reglas individuales');
}

/* ── RENDER ──────────────────────────────────────────────────────── */
function render() {
  updateStats(); updateAdvBar();
  const srch = $('fSearch').value.toLowerCase();
  let data = S.shipments;
  if (_filt) data = data.filter(x => x.status === _filt);
  if (srch)  data = data.filter(x =>
    x.name.toLowerCase().includes(srch) || x.phone.includes(srch) ||
    x.address.toLowerCase().includes(srch) || x.courier.toLowerCase().includes(srch)
  );
  if (_advActive) {
    if (_adv.dateFrom)        data = data.filter(x => x.date && x.date >= _adv.dateFrom);
    if (_adv.dateTo)          data = data.filter(x => x.date && x.date <= _adv.dateTo);
    if (_adv.couriers.length) data = data.filter(x => _adv.couriers.includes(x.courier));
    if (_adv.costMin)         data = data.filter(x => parseFloat(x.cost||0) >= parseFloat(_adv.costMin));
    if (_adv.costMax)         data = data.filter(x => parseFloat(x.cost||0) <= parseFloat(_adv.costMax));
    if (_adv.doc==='guia')        data = data.filter(x => x.docGuia);
    if (_adv.doc==='comprobante') data = data.filter(x => x.docComprobante);
    if (_adv.doc==='embalado')    data = data.filter(x => x.docEmbalado);
    if (_adv.doc==='none')        data = data.filter(x => !x.docGuia && !x.docEmbalado && !x.docComprobante);
    if (_adv.sort==='oldest') data = [...data].sort((a,b) => (a.date||'').localeCompare(b.date||''));
    else if (_adv.sort==='newest') data = [...data].sort((a,b) => (b.date||'').localeCompare(a.date||''));
    else if (_adv.sort==='name')   data = [...data].sort((a,b) => a.name.localeCompare(b.name));
    else if (_adv.sort==='cost')   data = [...data].sort((a,b) => parseFloat(b.cost||0) - parseFloat(a.cost||0));
  } else {
    const sort = _filt ? (_chipSort[_filt] || 'courier_date') : 'courier_date';
    if (sort==='courier_date') data = [...data].sort((a,b) => a.courier.localeCompare(b.courier) || b.date.localeCompare(a.date));
    else if (sort==='date')      data = [...data].sort((a,b) => (b.date||'').localeCompare(a.date||''));
    else if (sort==='name')      data = [...data].sort((a,b) => a.name.localeCompare(b.name));
    else if (sort==='cost')      data = [...data].sort((a,b) => parseFloat(a.cost||0) - parseFloat(b.cost||0));
    else if (sort==='cost_desc') data = [...data].sort((a,b) => parseFloat(b.cost||0) - parseFloat(a.cost||0));
  }
  const groups = {};
  data.forEach(x => { if (!groups[x.courier]) groups[x.courier] = []; groups[x.courier].push(x); });
  const area = $('cardsArea');
  if (!data.length) {
    area.innerHTML = '<div class="empty-st"><div style="font-size:36px">📭</div><p style="margin-top:10px">Sin envíos. Presiona ➕</p></div>';
    return;
  }
  area.innerHTML = Object.entries(groups).map(([courier, items]) => `
    <div class="cgroup">
      <div class="cgroup-hdr"><div class="cgroup-bar"></div><span>🚚</span><div class="cgroup-name">${courier}</div><div class="cgroup-cnt">${items.length}</div></div>
      ${items.map(s => cardHTML(s)).join('')}
    </div>`).join('');
}

function cardHTML(s) {
  const gChk = s.chkGuia||false, eChk = s.chkEmbalado||false, cChk = s.chkComprobante||false;
  const msgs = S.msgTemplates[s.status] || ['',''];
  const m1 = msgs[0]&&msgs[0].trim(), m2 = msgs[1]&&msgs[1].trim();
  const pvtNote = s.privateNote || '';
  return `<div class="card">
    <div class="card-top">
      <div class="chk ${s.sel?'on':''}" onclick="toggleSel('${s.id}')">${s.sel?'✓':''}</div>
      <div class="cname"
        onclick="togglePvtNote('${s.id}')"
        ondblclick="event.stopPropagation();openPrivateNote('${s.id}')"
        style="cursor:pointer;flex:1;user-select:none">
        ${s.name}${pvtNote?` <span style="font-size:11px;color:var(--purple);opacity:.7">🔒</span>`:''}
      </div>
      <button class="wa-btn" onclick="openWA('${s.id}')">💬</button>
    </div>
    ${pvtNote?`<div class="pvt-note" id="pvt_${s.id}" style="display:none" ondblclick="openPrivateNote('${s.id}')">🔒 ${pvtNote}</div>`:''}
    <div class="card-meta">
      <span class="meta">📞 ${s.phone}</span>
      <span class="meta">📅 ${s.date||'—'}</span>
      ${s.cost?`<span class="meta">💰 S/ ${s.cost}</span>`:''}
    </div>
    <div class="card-addr">🏠 ${s.address}</div>
    ${s.notes?`<div class="card-note">📝 ${s.notes}</div>`:''}
    ${cardDocs(s, gChk, eChk, cChk)}
    ${(m1||m2)?`<div class="card-msgs">
      ${m1?`<button class="card-msg card-msg-a" onclick="quickMsg('${s.id}',0)"><span class="card-msg-ltr">A</span><span class="card-msg-txt">${fillVars(m1,s).substring(0,70)}${fillVars(m1,s).length>70?'…':''}</span></button>`:''}
      ${m2?`<button class="card-msg card-msg-b" onclick="quickMsg('${s.id}',1)"><span class="card-msg-ltr">B</span><span class="card-msg-txt">${fillVars(m2,s).substring(0,70)}${fillVars(m2,s).length>70?'…':''}</span></button>`:''}
    </div>`:''}
    <div class="card-actions">
      <button class="btn-st ${stClass(s.status)}" onclick="openStatus('${s.id}')" style="${!_filt?'opacity:.5;cursor:default':''}">
        ${stIcon(s.status)} ${s.status}${!_filt?' 🔒':''}
      </button>
      <button class="btn-edit" onclick="openForm('${s.id}')">✏️</button>
      <button class="btn-del"  onclick="openDel('${s.id}')">🗑️</button>
    </div>
  </div>`;
}

function cardDocs(s, gChk, eChk, cChk) {
  const has = s.docGuia || s.docEmbalado || s.docComprobante || (s.links && s.links.length);
  if (!has) return '';
  return `<div class="card-docs">
    ${s.docComprobante?`<div class="doc-thumb" style="border:2px solid ${cChk?'var(--purple)':'var(--bd)'}">
      <div onclick="qView('${s.id}','comprobante')">${s.docComprobante.t&&s.docComprobante.t.startsWith('image/')?`<img src="${s.docComprobante.d}" style="width:52px;height:66px;object-fit:cover;display:block">`:`<div class="doc-thumb-pdf"><span style="font-size:20px">🧾</span></div>`}</div>
      <div class="doc-lbl">COMPROBANTE</div>
      <div class="doc-chk ${cChk?'on-t':''}" onclick="event.stopPropagation();togDoc('${s.id}','comprobante')">${cChk?'✓':''}</div>
    </div>`:''}
    ${s.docEmbalado?`<div class="doc-thumb" style="border:2px solid ${eChk?'var(--blue)':'var(--bd)'}">
      <div onclick="qView('${s.id}','embalado')">${s.docEmbalado.t&&s.docEmbalado.t.startsWith('image/')?`<img src="${s.docEmbalado.d}" style="width:52px;height:66px;object-fit:cover;display:block">`:`<div class="doc-thumb-pdf"><span style="font-size:20px">📦</span></div>`}</div>
      <div class="doc-lbl">EMBALADO</div>
      <div class="doc-chk ${eChk?'on-b':''}" onclick="event.stopPropagation();togDoc('${s.id}','embalado')">${eChk?'✓':''}</div>
    </div>`:''}
    ${s.docGuia?`<div class="doc-thumb" style="border:2px solid ${gChk?'var(--green)':'var(--bd)'}">
      <div onclick="qView('${s.id}','guia')">${s.docGuia.t&&s.docGuia.t.startsWith('image/')?`<img src="${s.docGuia.d}" style="width:52px;height:66px;object-fit:cover;display:block">`:`<div class="doc-thumb-pdf"><span style="font-size:20px">📄</span></div>`}</div>
      <div class="doc-lbl">GUÍA COURIER</div>
      <div class="doc-chk ${gChk?'on-g':''}" onclick="event.stopPropagation();togDoc('${s.id}','guia')">${gChk?'✓':''}</div>
    </div>`:''}
    ${(s.links||[]).map(l=>`<div class="link-chip">🔗 ${l.n}</div>`).join('')}
  </div>`;
}

/* ── SELECT ──────────────────────────────────────────────────────── */
function toggleSel(id) { const s=S.shipments.find(x=>x.id===id); if(!s)return; s.sel=!s.sel; save(); render(); }
function selAll() { const all=S.shipments.every(x=>x.sel); S.shipments.forEach(x=>x.sel=!all); save(); render(); }

/* ── DOC TOGGLE ──────────────────────────────────────────────────── */
function togDoc(id, slot) {
  const s = S.shipments.find(x => x.id===id); if (!s) return;
  if (slot==='guia') s.chkGuia=!s.chkGuia;
  else if (slot==='embalado') s.chkEmbalado=!s.chkEmbalado;
  else s.chkComprobante=!s.chkComprobante;
  save(); render();
}

/* ── QUICK MSG ───────────────────────────────────────────────────── */
function quickMsg(id, idx) {
  const s = S.shipments.find(x => x.id===id); if (!s) return;
  const msgs = S.msgTemplates[s.status] || ['',''];
  const tpl = msgs[idx]; if (!tpl||!tpl.trim()) return;
  window.open(`https://wa.me/51${s.phone}?text=${encodeURIComponent(fillVars(tpl,s))}`, '_blank');
}

/* ── STATUS (sin PIN) ────────────────────────────────────────────── */
let _stId = null;
function openStatus(id) {
  if (!_filt) { toast('⚠️ Filtra por una etiqueta primero'); return; }
  _doOpenStatus(id);
}
function _doOpenStatus(id) {
  _stId = id;
  const s = S.shipments.find(x => x.id===id); if (!s) return;
  const sel = S.shipments.filter(x => x.sel);
  const all = allStatuses();
  const curIdx = all.indexOf(s.status);
  $('stClientName').textContent = sel.length>1 ? `📦 ${sel.length} clientes seleccionados` : `📦 ${s.name}`;
  $('stCurrentLbl').textContent = sel.length>1 ? `Estado actual de "${s.name}": ${stIcon(s.status)} ${s.status}` : '';
  $('statusOpts').innerHTML = all.map((st, i) => {
    const isCur=i===curIdx, canFwd=i===curIdx+1, canBck=i===curIdx-1;
    const ok = canFwd || canBck;
    return `<button class="sopt ${stSoptClass(st)}"
      style="${isCur?'border-width:3px;opacity:1;filter:brightness(1.3);box-shadow:0 0 0 3px rgba(255,255,255,.1)':''}
             ${!isCur&&!ok?'opacity:.2;cursor:not-allowed':''}
             ${!isCur&&ok?'opacity:.65':''}"
      onclick="${ok?`applyStatus('${st}')`:''}"
      ${isCur||!ok?'disabled':''}>
      <span>${stIcon(st)} ${st}</span>
      <span style="font-size:11px;font-weight:600;opacity:.8">
        ${isCur?'● ACTUAL':canFwd?'▶ avanzar':canBck?'◀ retroceder':''}
      </span>
    </button>`;
  }).join('');
  openOverlay('statusOverlay');
}
function applyStatus(st) {
  const s = S.shipments.find(x => x.id===_stId); if (!s) return;
  const sel = S.shipments.filter(x => x.sel);
  if (sel.length > 1) {
    sel.forEach(x => { x.status=st; x.sel=false; });
    save(); render(); closeOverlay('statusOverlay');
    toast(`${stIcon(st)} ${st} → ${sel.length} clientes`);
  } else {
    s.status=st; s.sel=false;
    save(); render(); closeOverlay('statusOverlay');
    toast(`${stIcon(st)} ${st}`);
  }
}

/* ── DELETE → TRASH (sin _cloud) ────────────────────────────────── */
function openDel(id) {
  const s = S.shipments.find(x => x.id===id); if (!s) return;
  $('delMsg').textContent = `¿Mover "${s.name}" a la papelera?`;
  $('delYes').style.background = 'var(--red)';
  $('delYes').textContent = 'Mover a papelera';
  $('delYes').onclick = () => {
    S.trash.push({ shipment:s, deletedAt:Date.now() });
    S.shipments = S.shipments.filter(x => x.id!==id);
    save(); render(); closeOverlay('delOverlay'); toast('🗑️ Movido a papelera');
  };
  openOverlay('delOverlay');
}
function delSelected() {
  const sel = S.shipments.filter(x => x.sel);
  if (!sel.length) { toast('Selecciona envíos'); return; }
  $('delMsg').textContent = `¿Mover ${sel.length} envío(s) a la papelera?`;
  $('delYes').style.background = 'var(--red)';
  $('delYes').textContent = 'Mover a papelera';
  $('delYes').onclick = () => {
    sel.forEach(s => S.trash.push({ shipment:s, deletedAt:Date.now() }));
    S.shipments = S.shipments.filter(x => !x.sel);
    save(); render(); closeOverlay('delOverlay'); toast(`🗑️ ${sel.length} movidos a papelera`);
  };
  openOverlay('delOverlay');
}

/* ── TRASH ───────────────────────────────────────────────────────── */
let _trashTapTimer=null, _trashTaps=0;
function onTrashBtnTap() {
  _trashTaps++;
  clearTimeout(_trashTapTimer);
  if (_trashTaps >= 2) { _trashTaps=0; openTrash(); return; }
  _trashTapTimer = setTimeout(() => { _trashTaps=0; delSelected(); }, 350);
}
function openTrash() {
  const now = Date.now();
  const before = S.trash.length;
  S.trash = S.trash.filter(x => (now - x.deletedAt) < 30*24*60*60*1000);
  if (S.trash.length !== before) save();
  if (!S.trash.length) {
    $('trashList').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2)">🗑️<br><br>La papelera está vacía</div>';
  } else {
    $('trashList').innerHTML = S.trash.map((item, i) => {
      const days = Math.floor((Date.now()-item.deletedAt)/(24*60*60*1000));
      const remaining = 30-days;
      return `<div class="trash-item">
        <div class="trash-item-info">
          <div class="trash-item-name">${item.shipment.name}</div>
          <div class="trash-item-meta">📞 ${item.shipment.phone} · 🚚 ${item.shipment.courier}</div>
          <div class="trash-item-meta">📅 Eliminado hace ${days===0?'hoy':days+' día'+(days>1?'s':'')}</div>
        </div>
        <span class="trash-item-days ${remaining<=5?'trash-days-warn':'trash-days-ok'}">${remaining}d</span>
        <button class="trash-restore" onclick="restoreTrash(${i})">↩ Recuperar</button>
      </div>`;
    }).join('');
  }
  openOverlay('trashOverlay');
}
function restoreTrash(i) {
  const item = S.trash[i]; if (!item) return;
  item.shipment.sel = false;
  S.shipments.push(item.shipment);
  S.trash.splice(i, 1);
  save(); render(); openTrash(); toast(`✅ ${item.shipment.name} recuperado`);
}
function emptyTrash() {
  if (!S.trash.length) { toast('La papelera ya está vacía'); return; }
  $('delMsg').textContent = `¿Eliminar definitivamente ${S.trash.length} envío(s)? Esto no se puede deshacer.`;
  $('delYes').style.background = 'var(--red)';
  $('delYes').textContent = 'Eliminar definitivamente';
  $('delYes').onclick = () => { S.trash=[]; save(); closeOverlay('delOverlay'); openTrash(); toast('🗑️ Papelera vaciada'); };
  openOverlay('delOverlay');
}

/* ── PRIVATE NOTE ────────────────────────────────────────────────── */
let _pvtNoteId = null;
function togglePvtNote(id) { const el=$('pvt_'+id); if(!el)return; el.style.display=el.style.display==='none'?'block':'none'; }
function openPrivateNote(id) {
  _pvtNoteId = id;
  const s = S.shipments.find(x => x.id===id); if (!s) return;
  $('pvtNoteName').textContent = '📦 '+s.name;
  $('pvtNoteInput').value = s.privateNote || '';
  $('pvtNoteDelBtn').style.display = s.privateNote ? 'block' : 'none';
  openOverlay('pvtNoteOverlay');
}
function savePvtNote() {
  const s = S.shipments.find(x => x.id===_pvtNoteId); if (!s) return;
  s.privateNote = $('pvtNoteInput').value.trim();
  save(); render(); closeOverlay('pvtNoteOverlay'); toast('🔒 Nota privada guardada');
}
function deletePvtNote() {
  const s = S.shipments.find(x => x.id===_pvtNoteId); if (!s) return;
  s.privateNote = '';
  save(); render(); closeOverlay('pvtNoteOverlay'); toast('🗑️ Nota eliminada');
}
