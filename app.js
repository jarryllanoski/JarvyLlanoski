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
if (!S.trash)              S.trash             = [];
if (!S.deletedPedidoIds)   S.deletedPedidoIds  = [];
if (S.activeUser    === undefined) S.activeUser    = null;
if (S.empAddKey     === undefined) S.empAddKey     = '';
if (S.activityLog   === undefined) S.activityLog   = [];
if (S.lastReadActivityAt === undefined) S.lastReadActivityAt = '';
if (!S.courierTypes)  S.courierTypes = {};
if (!S.dispatch)      S.dispatch     = { days:[1,2,3,4,5], cutHour:'11:30', anticipation:0 };
if (!S.tasks)         S.tasks        = [];
if (!S.employees)     S.employees    = [];
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
// Remove DINSIDES permanently
S.couriers = S.couriers.filter(c => c !== 'DINSIDES');
delete (S.courierActive || {})['DINSIDES'];
delete (S.courierTypes  || {})['DINSIDES'];

// Migrate employees from string[] to object[]
if (S.employees.length && typeof S.employees[0] === 'string') {
  S.employees = S.employees.map(n => ({ name: n, pin: '', dni: '', phone: '', permisos: ['verPedidos','tareas'] }));
}
// Migrate old permission keys to granular keys
const _permKeyMap = { envios:'verPedidos', compartir:'compartir' };
S.employees.forEach(e => {
  if (typeof e === 'object' && e.permisos) {
    e.permisos = e.permisos.map(k => _permKeyMap[k] || k);
  }
});

/* ── SAVE ────────────────────────────────────────────────────────── */
function save() {
  lsSet('dpanel', JSON.stringify(S));
  if (typeof cloudSync === 'function') cloudSync();
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function statusPrio(st)  { return FIXED_LABELS.indexOf(st); }
function allStatuses()   { return S.labels; }
function stIcon(st)      { return FIXED_LABEL_ICONS[st] || '🏷️'; }
function _isDeliveryCourier(name) {
  const u = (name||'').toUpperCase();
  if (['SHALOM','OLVA','MARVISUR','DINSIDES'].some(n => u.includes(n))) return false;
  if (u.includes('ENCOMIENDA') || u.includes('RETIRO')) return false;
  return ((S.courierTypes||{})[name]||'') !== 'agencia';
}
function mapsLink(addr, gpsCoords) {
  if (!addr) return addr||'';
  const url = gpsCoords
    ? `https://maps.google.com/?q=${gpsCoords}`
    : `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
  return `<a href="${url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none" title="Abrir en Google Maps">${addr} 🗺️</a>`;
}
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
      <div class="cgroup-hdr" onclick="onCourierHdrTap('${courier.replace(/'/g,"\\'")}')"><div class="cgroup-bar"></div><span>🚚</span><div class="cgroup-name">${courier}</div><div class="cgroup-cnt">${items.length}</div><span style="font-size:10px;color:var(--text2);margin-left:auto;opacity:.5">···</span></div>
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
    <div class="card-addr">🏠 ${_isDeliveryCourier(s.courier) ? mapsLink(s.address, s.gpsCoords) : (s.address||'')}</div>
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
    if (typeof logActivity==='function') sel.forEach(x => logActivity('status', `${x.name} → ${st}`, x.id, ''));
    toast(`${stIcon(st)} ${st} → ${sel.length} clientes`);
  } else {
    s.status=st; s.sel=false;
    save(); render(); closeOverlay('statusOverlay');
    if (typeof logActivity==='function') logActivity('status', `${s.name} → ${st}`, s.id, '');
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
function _purgePedidoDoc(id) {
  const db = cloudDb(); const wsId = cloudWsId();
  if (db && wsId) db.collection('ws').doc(wsId).collection('pedidos').doc(id).delete().catch(()=>{});
}
function openTrash() {
  const now = Date.now();
  const before = S.trash.length;
  const expired = S.trash.filter(x => (now - x.deletedAt) >= 30*24*60*60*1000);
  if (expired.length) {
    expired.forEach(x => {
      const id = x.shipment && x.shipment.id; if (!id) return;
      if (!S.deletedPedidoIds.includes(id)) S.deletedPedidoIds.push(id);
      _purgePedidoDoc(id);
    });
  }
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
  $('delYes').onclick = () => {
    S.trash.forEach(x => {
      const id = x.shipment && x.shipment.id; if (!id) return;
      if (!S.deletedPedidoIds.includes(id)) S.deletedPedidoIds.push(id);
      _purgePedidoDoc(id);
    });
    S.trash=[]; save(); closeOverlay('delOverlay'); openTrash(); toast('🗑️ Papelera vaciada');
  };
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

/* ── WA SHEET ────────────────────────────────────────────────────── */
let _waId=null, _waMsgIdx=-1;
function openWA(id) {
  _waId=id; _waMsgIdx=-1;
  const s=S.shipments.find(x=>x.id===id); if(!s)return;
  const gChk=s.chkGuia||false, eChk=s.chkEmbalado||false, cChk=s.chkComprobante||false;
  const msgs=S.msgTemplates[s.status]||['',''];
  const hasMsg=(msgs[0]&&msgs[0].trim())||(msgs[1]&&msgs[1].trim());
  if(!gChk&&!eChk&&!cChk&&!hasMsg){ window.open(`https://wa.me/51${s.phone}`,'_blank'); return; }
  $('waInfo').innerHTML=`<div style="font-weight:700;font-size:14px;margin-bottom:4px">${s.name}</div><div style="color:var(--blue)">📞 +51 ${s.phone}</div><div style="color:var(--text2);font-size:12px;margin-top:2px">🏠 ${s.address}</div>`;
  let html='';
  if(s.docComprobante||s.docEmbalado||s.docGuia){
    html+=`<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;margin-bottom:8px">Documentos a enviar:</div><div class="wa-doc-grid">`;
    if(s.docComprobante) html+=waDT(s.docComprobante,cChk,'comprobante','var(--purple)');
    if(s.docEmbalado)    html+=waDT(s.docEmbalado,eChk,'embalado','var(--blue)');
    if(s.docGuia)        html+=waDT(s.docGuia,gChk,'guia','var(--green)');
    html+='</div>';
  }
  if(hasMsg){
    html+=`<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;margin:12px 0 8px">Mensaje a enviar:</div>`;
    html+=`<div id="waMN" class="wa-msg-none sel" onclick="selWAMsg(-1)">✉️ Sin mensaje</div>`;
    if(msgs[0]&&msgs[0].trim()) html+=`<div id="waM0" class="wa-msg-opt" onclick="selWAMsg(0)"><div class="wa-msg-lbl">MENSAJE A</div><div class="wa-msg-txt">${fillVars(msgs[0],s)}</div></div>`;
    if(msgs[1]&&msgs[1].trim()) html+=`<div id="waM1" class="wa-msg-opt" onclick="selWAMsg(1)"><div class="wa-msg-lbl">MENSAJE B</div><div class="wa-msg-txt">${fillVars(msgs[1],s)}</div></div>`;
  }
  $('waBody').innerHTML=html;
  openOverlay('waOverlay');
}
function waDT(doc,chk,slot,color){
  const lbl={guia:'GUÍA COURIER',embalado:'EMBALADO',comprobante:'COMPROBANTE'}[slot]||slot.toUpperCase();
  const icon={guia:'📄',embalado:'📦',comprobante:'🧾'}[slot]||'📄';
  return`<div onclick="event.stopPropagation();togWADoc('${slot}')" style="position:relative;cursor:pointer;border-radius:9px;overflow:hidden;border:2px solid ${chk?color:'var(--bd)'};${chk?'box-shadow:0 0 0 2px rgba(46,160,67,.25)':''}">
    ${doc.t&&doc.t.startsWith('image/')?`<img src="${doc.d}" style="width:80px;height:100px;object-fit:cover;display:block">`:`<div class="wa-doc-pdf"><span style="font-size:28px">${icon}</span></div>`}
    <div class="wa-doc-lbl">${lbl}</div>
    <div id="waChk_${slot}" class="wa-doc-chk" style="background:${chk?color:'rgba(0,0,0,.3)'};">${chk?'✓':''}</div>
  </div>`;
}
function togWADoc(slot){
  const s=S.shipments.find(x=>x.id===_waId); if(!s)return;
  if(slot==='guia')s.chkGuia=!s.chkGuia; else if(slot==='embalado')s.chkEmbalado=!s.chkEmbalado; else s.chkComprobante=!s.chkComprobante;
  save(); render(); openWA(_waId);
}
function selWAMsg(idx){
  _waMsgIdx=idx;
  ['waMN','waM0','waM1'].forEach(id=>{const e=$(id);if(e)e.classList.remove('sel')});
  const el=$(idx===-1?'waMN':'waM'+idx); if(el)el.classList.add('sel');
}
async function doWASend(){
  const s=S.shipments.find(x=>x.id===_waId); if(!s)return;
  const gChk=s.chkGuia||false, eChk=s.chkEmbalado||false, cChk=s.chkComprobante||false;
  const phone='51'+s.phone;
  let msg='';
  if(_waMsgIdx>=0){const msgs=S.msgTemplates[s.status]||['',''];const t=msgs[_waMsgIdx];if(t&&t.trim())msg=fillVars(t,s);}
  if(!gChk&&!eChk&&!cChk){window.open(msg?`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`:`https://wa.me/${phone}`,'_blank');closeOverlay('waOverlay');return;}
  closeOverlay('waOverlay');
  const docs=[];
  if(cChk&&s.docComprobante)docs.push({doc:s.docComprobante,label:'Comprobante'});
  if(eChk&&s.docEmbalado)   docs.push({doc:s.docEmbalado,label:'Embalado'});
  if(gChk&&s.docGuia)       docs.push({doc:s.docGuia,label:'Guia'});
  if(navigator.share){
    try{
      async function b2f(d,n){const r=await fetch(d);const b=await r.blob();return new File([b],n,{type:b.type});}
      const files=await Promise.all(docs.map(({doc,label})=>b2f(doc.d,`${label}.${doc.t.includes('pdf')?'pdf':doc.t.includes('png')?'png':'jpg'}`)));
      if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files,title:s.name,text:msg||''});setTimeout(()=>window.open(`https://wa.me/${phone}${msg?'?text='+encodeURIComponent(msg):''}`,`_blank`),800);return;}
    }catch(e){if(e.name==='AbortError')return;}
  }
  const div=document.createElement('div');
  div.style.cssText='position:fixed;inset:0;background:#0d1117;z-index:600;overflow-y:auto;padding:16px';
  div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-family:Syne,sans-serif;font-weight:700;font-size:16px">📤 Compartir documentos</div>
    <button onclick="this.closest('div[style]').remove()" style="background:rgba(247,129,102,.15);border:1px solid rgba(247,129,102,.3);color:#f78166;border-radius:7px;width:32px;height:32px;font-size:16px;cursor:pointer">✕</button>
  </div>
  <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;color:#8b949e;line-height:1.7">
    1️⃣ Toca <b style="color:#388bfd">Descargar</b> cada documento<br>
    2️⃣ Ve a tu galería y compártelo a WhatsApp<br>
    3️⃣ Toca <b style="color:#25d366">Abrir WhatsApp</b> abajo
  </div>
  ${docs.map(({doc,label})=>`<div style="background:#1c2333;border:1px solid #30363d;border-radius:10px;overflow:hidden;margin-bottom:10px">
    <div style="padding:10px 12px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;font-weight:700">${label}</span>
      <a href="${doc.d}" download="${label}.${doc.t.includes('pdf')?'pdf':'jpg'}" style="background:#388bfd;color:#fff;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;text-decoration:none">⬇ Descargar</a>
    </div>
    ${doc.t&&doc.t.startsWith('image/')?`<img src="${doc.d}" style="width:100%;max-height:200px;object-fit:contain;background:#0d1117;display:block">`:`<div style="padding:20px;text-align:center;font-size:32px">📄</div>`}
  </div>`).join('')}
  <a href="https://wa.me/${phone}${msg?'?text='+encodeURIComponent(msg):''}" target="_blank" style="display:block;width:100%;padding:13px;background:#25d366;border-radius:10px;color:#fff;font-weight:700;font-size:14px;text-align:center;text-decoration:none;margin-top:4px">💬 Abrir WhatsApp</a>
  <div style="height:30px"></div>`;
  document.body.appendChild(div);
}

/* ── DOC SLOTS ───────────────────────────────────────────────────── */
function trigInp(inputId,slot){closeDocMenu(slot);setTimeout(()=>$(inputId).click(),50);}
function toggleDocMenu(slot){const m=$('menu'+cap(slot));const o=m.classList.contains('open');document.querySelectorAll('.doc-menu').forEach(x=>x.classList.remove('open'));if(!o)m.classList.add('open');}
function closeDocMenu(slot){const e=$('menu'+cap(slot));if(e)e.classList.remove('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.doc-sw')&&!e.target.classList.contains('doc-add'))document.querySelectorAll('.doc-menu').forEach(m=>m.classList.remove('open'));});
const DOC_META={
  comprobante:{icon:'🧾',label:'Comprobante',cls:'ft',toast:'🧾 Comprobante subido ✓',inputs:['inComprobanteCam','inComprobanteGal','inComprobantePdf']},
  embalado:   {icon:'📦',label:'Embalado',   cls:'fg',toast:'📦 Foto de embalado subida ✓',inputs:['inEmbalaodCam','inEmbalaodGal','inEmbalaodPdf']},
  guia:       {icon:'🚚',label:'Guía courier',cls:'fg',toast:'🚚 Guía subida ✓',inputs:['inGuiaCam','inGuiaGal','inGuiaPdf']},
};
let _docs={comprobante:null,embalado:null,guia:null};
function loadDoc(input,slot){
  const file=input.files[0]; if(!file)return;
  if(file.size>8*1024*1024){toast('⚠️ Máximo 8MB');return;}
  const r=new FileReader();
  r.onload=e=>{_docs[slot]={d:e.target.result,n:file.name,t:file.type};refreshSlot(slot);toast(DOC_META[slot]?.toast||'✓ Subido');onAutoFieldChange(slot==='embalado'||slot==='guia');};
  r.readAsDataURL(file);
}
function refreshSlot(slot){
  const doc=_docs[slot], Slot=cap(slot);
  const meta=DOC_META[slot]||{icon:'📄',label:slot,cls:'fg'};
  const prev=$('prev'+Slot),act=$('act'+Slot),btn=$('addBtn'+Slot),lbl=$('lbl'+Slot);
  if(!prev)return;
  if(!doc){prev.innerHTML=`<div class="doc-empty"><div style="font-size:22px">${meta.icon}</div><div style="font-size:10px;font-weight:700;text-align:center">${meta.label}</div></div>`;if(btn)btn.style.display='block';act.style.display='none';lbl.className='doc-tap';return;}
  lbl.className='doc-tap '+meta.cls; if(btn)btn.style.display='none'; act.style.display='flex';
  if(doc.t&&doc.t.startsWith('image/')){prev.innerHTML=`<div class="doc-full"><img src="${doc.d}" style="width:100%;height:100%;object-fit:cover;display:block"><div class="doc-ok">✓</div></div>`;}
  else{const sn=doc.n.length>14?doc.n.substring(0,14)+'…':doc.n;prev.innerHTML=`<div class="doc-full"><div class="doc-full-pdf"><span style="font-size:28px">📄</span><span style="font-size:9px;color:var(--text2);text-align:center;padding:0 4px;word-break:break-all">${sn}</span></div><div class="doc-ok">✓ PDF</div></div>`;}
}
function clearSlot(slot){_docs[slot]=null;(DOC_META[slot]?.inputs||[]).forEach(id=>{const e=$(id);if(e)e.value='';});refreshSlot(slot);toast('Documento quitado');onAutoFieldChange(false);}
function viewSlot(slot){const d=_docs[slot];if(!d)return;openViewer(d,DOC_META[slot]?.label||slot);}

/* ── VIEWER ──────────────────────────────────────────────────────── */
let _curDoc=null;
function openViewer(doc,title){_curDoc=doc;if(doc.t&&doc.t.startsWith('image/')){$('viewerImg').src=doc.d;$('viewerTtl').textContent=title;$('viewer').classList.add('open');}else{const a=document.createElement('a');a.href=doc.d;a.target='_blank';a.click();}}
function closeViewer(){$('viewer').classList.remove('open');$('viewerImg').src='';}
function dlDoc(){if(!_curDoc)return;const a=document.createElement('a');a.href=_curDoc.d;a.download=_curDoc.n||'doc';a.click();}
function qView(shipId,slot){const s=S.shipments.find(x=>x.id===shipId);if(!s)return;const d=slot==='guia'?s.docGuia:slot==='embalado'?s.docEmbalado:s.docComprobante;if(!d)return;openViewer(d,DOC_META[slot]?.label||slot);}
$('viewer').addEventListener('click',e=>{if(e.target===$('viewer'))closeViewer();});

/* ── LINKS ───────────────────────────────────────────────────────── */
let _links=[];
function addLink(){const v=$('fLink').value.trim();if(!v){toast('Ingresa un link');return;}if(!v.startsWith('http')){toast('⚠️ Link inválido');return;}const n=v.length>36?v.substring(0,36)+'…':v;_links.push({u:v,n});renderLinks();$('fLink').value='';toast('🔗 Agregado');}
function removeLink(i){_links.splice(i,1);renderLinks();}
function renderLinks(){$('linkListForm').innerHTML=_links.map((l,i)=>`<div class="link-item"><span>🔗</span><div class="link-name">${l.n}</div><a href="${l.u}" target="_blank" style="color:var(--blue);font-size:12px;text-decoration:none">↗</a><button class="link-del" type="button" onclick="removeLink(${i})">✕</button></div>`).join('');}

/* ── AUTO-STATUS ─────────────────────────────────────────────────── */
function calcAutoStatusMode(){
  if(S.config.autoStatusEnabled) return 'general';
  const r=S.config.autoRules||{};
  if(Object.values(r).some(Boolean)) return 'partial';
  return 'manual';
}
function _ruleOn(key){return !!S.config.autoStatusEnabled || !!(S.config.autoRules||{})[key];}
function calcAutoStatus(s){
  if(calcAutoStatusMode()==='manual') return null;
  if(_ruleOn('finalizado')    && s.delivered && !(s.pendingBalance>0))        return 'Finalizado';
  if(_ruleOn('pendingPayment')&& s.arrivedAtDest && s.pendingBalance>0)       return 'Pendiente de pago';
  if(_ruleOn('arrivedAtDest') && s.arrivedAtDest)                             return 'Llegó a destino';
  if(_ruleOn('guia')          && (s.docGuia||s.guideNumber))                  return 'Enviado';
  if(_ruleOn('comprobante')   && s.docComprobante && s.status==='Pendiente de pago') return 'Finalizado';
  if(_ruleOn('embalado')      && s.docEmbalado)                               return 'Alistado';
  if(_ruleOn('embalado')      && s.alistado)                                  return 'Alistado';
  if(S.config.autoStatusEnabled){if(s.stockOk)return 'Por alistar';if(s.faltante)return 'Faltante / pedir proveedor';}
  return null;
}
let _autoFields={faltante:false,stockOk:false,alistado:false,arrivedAtDest:false,delivered:false};
function refreshAutoFields(){
  ['faltante','stockOk','alistado','arrivedAtDest','delivered'].forEach(f=>{
    const id='chk'+f.charAt(0).toUpperCase()+f.slice(1);
    const el=$(id); if(!el)return;
    el.classList.toggle('on',!!_autoFields[f]); el.textContent=_autoFields[f]?'✓':'';
  });
  onAutoFieldChange();
}
function toggleAutoField(f){
  if(f==='faltante'&&_autoFields.stockOk&&!_autoFields[f])_autoFields.stockOk=false;
  if(f==='stockOk'&&_autoFields.faltante&&!_autoFields[f])_autoFields.faltante=false;
  _autoFields[f]=!_autoFields[f]; refreshAutoFields();
}
function onAutoFieldChange(showToast=false){
  const curSt=$('fStatus')?.value||'';
  const preview={..._autoFields,docGuia:_docs&&_docs.guia?_docs.guia:null,docEmbalado:_docs&&_docs.embalado?_docs.embalado:null,docComprobante:_docs&&_docs.comprobante?_docs.comprobante:null,status:curSt,guideNumber:$('fGuideNumber')?$('fGuideNumber').value.trim():'',pendingBalance:parseFloat($('fPendingBalance')&&$('fPendingBalance').value)||0};
  const sug=calcAutoStatus(preview);
  const box=$('autoStatusSuggestion'); if(!box)return;
  if(sug&&statusPrio(sug)>statusPrio(curSt)){
    box.style.display='block';
    box.innerHTML=`🤖 Estado actualizado automáticamente: <b>${stIcon(sug)} ${sug}</b>`;
    if(curSt!==sug){if($('fStatus'))$('fStatus').value=sug;if(showToast)setTimeout(()=>toast('🤖 Estado actualizado automáticamente: '+sug),600);}
  }else{box.style.display='none';}
}

/* ── FORM ────────────────────────────────────────────────────────── */
let _editId=null;
function openForm(id){
  _editId=id; $('formTitle').textContent=id?'Editar Envío':'Nuevo Envío';
  const activeCouriers=S.couriers.filter(c=>S.courierActive[c]!==false);
  $('fCourier').innerHTML=(activeCouriers.length?activeCouriers:S.couriers).map(c=>`<option>${c}</option>`).join('');
  $('fStatus').innerHTML=allStatuses().map(s=>`<option>${s}</option>`).join('');
  $('extraForm').innerHTML=S.extraFields.map(f=>{const nm=f.name||f;return`<div class="fg"><label class="fl">${nm}</label><input class="fi xf" data-f="${nm}" placeholder="${nm}..."></div>`;}).join('');
  _docs={comprobante:null,embalado:null,guia:null}; _links=[];
  ['comprobante','embalado','guia'].forEach(sl=>refreshSlot(sl)); renderLinks();
  Object.values(DOC_META).flatMap(m=>m.inputs).forEach(i=>{const e=$(i);if(e)e.value='';});
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    $('fName').value=s.name; $('fPhone').value=s.phone; $('fAddr').value=s.address;
    $('fCourier').value=s.courier; $('fDate').value=s.date; $('fStatus').value=s.status;
    $('fCost').value=s.cost||''; $('fNotes').value=s.notes||'';
    document.querySelectorAll('.xf').forEach(el=>{el.value=(s.extra&&s.extra[el.dataset.f])||'';});
    if(s.docGuia){_docs.guia=s.docGuia;refreshSlot('guia');}
    if(s.docEmbalado){_docs.embalado=s.docEmbalado;refreshSlot('embalado');}
    if(s.docComprobante){_docs.comprobante=s.docComprobante;refreshSlot('comprobante');}
    _links=s.links?JSON.parse(JSON.stringify(s.links)):[];renderLinks();
    _autoFields={faltante:!!s.faltante,stockOk:!!s.stockOk,alistado:!!s.alistado,arrivedAtDest:!!s.arrivedAtDest,delivered:!!s.delivered};
    if($('fGuideNumber'))$('fGuideNumber').value=s.guideNumber||'';
    if($('fPendingBalance'))$('fPendingBalance').value=s.pendingBalance||'';
  }else{
    ['fName','fPhone','fAddr','fCost','fNotes'].forEach(i=>$(i).value='');
    $('fDate').valueAsDate=new Date();
    _autoFields={faltante:false,stockOk:false,alistado:false,arrivedAtDest:false,delivered:false};
    if($('fGuideNumber'))$('fGuideNumber').value='';
    if($('fPendingBalance'))$('fPendingBalance').value='';
    if(S.config.autoStatusEnabled&&$('fStatus'))$('fStatus').value='Nuevo pedido';
  }
  const autoForm=$('autoStatusForm'); if(autoForm)autoForm.style.display=S.config.autoStatusEnabled?'block':'none';
  syncFormModeBadge(); refreshAutoFields(); openOverlay('formOverlay');
}
function syncFormModeBadge(){
  const el=$('formAutoModeBadge'); if(!el)return;
  const on=!!S.config.autoStatusEnabled; el.style.display='inline-block'; el.textContent=on?'🤖 Auto':'⚙️ Manual';
  Object.assign(el.style,{color:on?'var(--green)':'var(--text2)',background:on?'rgba(46,160,67,.1)':'rgba(139,148,158,.08)',borderColor:on?'rgba(46,160,67,.3)':'rgba(139,148,158,.2)'});
}
function saveShipment(){
  const name=$('fName').value.trim(),phone=$('fPhone').value.trim(),addr=$('fAddr').value.trim();
  if(!name||!phone||!addr){toast('⚠️ Nombre, teléfono y dirección requeridos');return;}
  const extra={}; document.querySelectorAll('.xf').forEach(el=>extra[el.dataset.f]=el.value);
  const autoData={faltante:_autoFields.faltante,stockOk:_autoFields.stockOk,alistado:_autoFields.alistado,arrivedAtDest:_autoFields.arrivedAtDest,delivered:_autoFields.delivered,guideNumber:$('fGuideNumber')?$('fGuideNumber').value.trim():'',pendingBalance:parseFloat($('fPendingBalance')&&$('fPendingBalance').value)||0};
  const data={name,phone,address:addr,courier:$('fCourier').value,date:$('fDate').value,status:$('fStatus').value,cost:$('fCost').value,notes:$('fNotes').value.trim(),extra,docGuia:_docs.guia,docEmbalado:_docs.embalado,docComprobante:_docs.comprobante,links:JSON.parse(JSON.stringify(_links)),sel:false,chkGuia:false,chkEmbalado:false,chkComprobante:false,...autoData};
  const autoSt=calcAutoStatus(data);
  if(autoSt&&statusPrio(autoSt)>statusPrio(data.status))data.status=autoSt;
  if(_editId){const idx=S.shipments.findIndex(x=>x.id===_editId);S.shipments[idx]={...S.shipments[idx],...data};toast(autoSt?'🤖 Actualizado (estado automático)':'✅ Actualizado');}
  else{data.id='id_'+Date.now();data.createdAt=new Date().toISOString();data.printed=false;S.shipments.push(data);toast(autoSt?'🤖 Envío registrado (estado automático)':'✅ Envío registrado');}
  save(); closeOverlay('formOverlay'); render();
}

/* ── DEBUG LOG ───────────────────────────────────────────────────── */
function renderDbgLog() {
  const el = $('dbgBox'); if (!el) return;
  if (!_dbgLog.length) {
    el.innerHTML = '<span style="color:#3fb950">✓ Sin errores registrados</span>';
    return;
  }
  const C = { ERROR:'#f85149', WARN:'#e3b341', CRASH:'#ff7b72', PROMISE:'#ffa657' };
  el.innerHTML = _dbgLog.map(e =>
    `<div><span style="color:#8b949e">${e.ts}</span> <span style="color:${C[e.lvl]||'#79c0ff'};font-weight:700">[${e.lvl}]</span> <span style="color:#e6edf3">${e.msg}</span></div>`
  ).join('');
}

function _dbgCopy() {
  if (!_dbgLog.length) { toast('Sin eventos en el log'); return; }
  const txt = _dbgLog.map(e => `[${e.ts}] [${e.lvl}] ${e.msg}`).join('\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast('📋 Log copiado al portapapeles'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); toast('📋 Log copiado');
  }
}

function _dbgClear() {
  _dbgLog.length = 0;
  renderDbgLog();
  toast('🗑️ Log limpiado');
}

/* ── EXPORT / IMPORT ─────────────────────────────────────────────── */
function exportExcel(){
  if(!S.shipments.length){toast('Sin envíos para exportar');return;}
  if(typeof XLSX==='undefined'){toast('⚠️ Cargando librería...');return;}
  const rows=S.shipments.map(s=>({'Nombre':s.name||'','Teléfono':s.phone||'','Dirección':s.address||'','Courier':s.courier||'','Fecha':s.date||'','Estado':s.status||'','Costo':s.cost||'','Notas':s.notes||'','Nota privada':s.privateNote||''}));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:25},{wch:13},{wch:35},{wch:15},{wch:12},{wch:18},{wch:8},{wch:30},{wch:30}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Envíos');
  XLSX.writeFile(wb,`Envios_${new Date().toLocaleDateString('es-PE').replace(/\//g,'-')}.xlsx`);
  toast('📊 Excel descargado');
}
function importExcel(input){
  const file=input.files[0]; if(!file)return;
  const res=$('importResult'); res.style.display='block'; res.innerHTML='⏳ Procesando...'; res.style.color='var(--text2)';
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'binary'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws);
      if(!rows.length){res.innerHTML='⚠️ El archivo está vacío';return;}
      let added=0,skipped=0;
      rows.forEach(row=>{
        const name=(row['Nombre']||row['nombre']||'').toString().trim();
        const phone=(row['Teléfono']||row['Telefono']||row['telefono']||'').toString().trim();
        const address=(row['Dirección']||row['Direccion']||row['direccion']||'').toString().trim();
        if(!name||!phone){skipped++;return;}
        if(S.shipments.find(x=>x.name===name&&x.phone===phone)){skipped++;return;}
        S.shipments.push({id:'xl_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name,phone,address,courier:(row['Courier']||row['courier']||S.couriers[0]||'').toString().trim(),date:(row['Fecha']||row['fecha']||new Date().toISOString().split('T')[0]).toString().trim(),status:(row['Estado']||row['estado']||'Nuevo pedido').toString().trim(),cost:(row['Costo']||row['costo']||'').toString().trim(),notes:(row['Notas']||row['notas']||'').toString().trim(),privateNote:(row['Nota privada']||'').toString().trim(),extra:{},docGuia:null,docEmbalado:null,docComprobante:null,links:[],sel:false,chkGuia:false,chkEmbalado:false,chkComprobante:false,createdAt:new Date().toISOString()});
        added++;
      });
      save(); render();
      res.style.color=added>0?'var(--green)':'var(--red)';
      res.innerHTML=`✅ ${added} pedido${added!==1?'s':''} importado${added!==1?'s':''}${skipped>0?` · ${skipped} omitido${skipped!==1?'s':''}`:''}`;
      if(added>0)toast(`✅ ${added} pedidos importados`);
    }catch(err){res.style.color='var(--red)';res.innerHTML='❌ Error al leer el archivo.';}
    input.value='';
  };
  reader.readAsBinaryString(file);
}
function doCSV(){
  if(!S.shipments.length){toast('Sin envíos');return;}
  const h=['Nombre','Teléfono','Dirección','Courier','Fecha','Estado','Costo','Notas'];
  const rows=S.shipments.map(s=>[s.name,s.phone,`"${s.address}"`,s.courier,s.date,s.status,s.cost,`"${s.notes}"`]);
  const csv=[h,...rows].map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`envios_${new Date().toLocaleDateString('es')}.csv`; a.click();
  toast('📊 CSV exportado');
}
/* ── BACKUP / RESTORE ── */
function exportBackup(){
  const data = JSON.stringify(S, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const d    = new Date();
  const ts   = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  a.href = url;
  a.download = `backup-jarvy-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ Backup descargado');
}

function importBackup(){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.shipments && !data.config) { toast('⚠️ Archivo no válido'); return; }
        Object.assign(S, data);
        lsSet('dpanel', JSON.stringify(S));
        if (typeof render === 'function') render();
        if (typeof renderChips === 'function') renderChips();
        toast('✅ Datos restaurados: ' + (S.shipments||[]).length + ' envíos');
      } catch(err) { toast('⚠️ Error al leer el archivo: ' + err.message); }
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ── SHARE ── */
function genFormUrl(){
  const base = window.location.href.replace(/\/[^/]*$/, '/');
  if (!S.wsId) return base + 'form.html';
  return base + 'form.html?ws=' + encodeURIComponent(S.wsId);
}
function updateShareUrl(){
  const url = genFormUrl();
  const el = $('shareUrl');
  if (el) el.value = url;
  const qrEl = $('qrPreview');
  if (qrEl) qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
}
function copyLink(){
  const url = genFormUrl();
  navigator.clipboard.writeText(url).then(() => toast('🔗 Enlace copiado')).catch(() => {
    const el = $('shareUrl');
    if (el) { el.select(); document.execCommand('copy'); toast('🔗 Enlace copiado'); }
  });
}
function shareWA(){
  const url = genFormUrl();
  const msg = encodeURIComponent(`📦 ${S.config.name || 'Mi tienda'}\nRealiza tu pedido aquí:\n${url}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}
function shareTG(){
  const url = genFormUrl();
  const msg = encodeURIComponent(`📦 ${S.config.name || 'Mi tienda'} — ${url}`);
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${msg}`, '_blank');
}

/* ── TOKENS ── */
function _tokenBase(){
  const db = typeof cloudDb === 'function' ? cloudDb() : null;
  const wsId = typeof cloudWsId === 'function' ? cloudWsId() : (S.wsId||'');
  return {db, wsId};
}

function _tokenUrl(tokenId){
  const wsId = typeof cloudWsId === 'function' ? cloudWsId() : (S.wsId||'');
  const base = window.location.href.replace(/\/[^/]*$/, '/');
  return `${base}form.html?ws=${encodeURIComponent(wsId)}&t=${encodeURIComponent(tokenId)}`;
}

function _timeAgo(iso){
  if(!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if(m < 1)   return 'hace un momento';
  if(m < 60)  return `hace ${m} min`;
  const h = Math.floor(m/60);
  if(h < 24)  return `hace ${h}h`;
  const d = Math.floor(h/24);
  return `hace ${d} día${d>1?'s':''}`;
}

async function renderTokenList(){
  const el = $('tokenList');
  if (!el) return;
  const {db, wsId} = _tokenBase();
  if (!db || !wsId) {
    el.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text2);font-size:13px"><div style="font-size:32px;margin-bottom:8px">☁️</div>Conectate a la nube para gestionar links.</div>`;
    return;
  }
  el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text2);font-size:12px">Cargando...</div>`;
  try {
    const snap = await db.collection('ws').doc(wsId).collection('tokens')
      .orderBy('createdAt','desc').limit(40).get();
    const tokens = [];
    snap.forEach(doc => tokens.push({id: doc.id, ...doc.data()}));

    if (!tokens.length) {
      el.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text2);font-size:13px"><div style="font-size:32px;margin-bottom:8px">📭</div>Aún no generaste ningún link.<br><span style="font-size:11px;opacity:.6">Escribí el nombre del cliente arriba y generá su link.</span></div>`;
      return;
    }

    el.innerHTML = tokens.map(t => {
      const url      = _tokenUrl(t.id);
      const shortId  = t.id.slice(-6).toUpperCase();
      const expired  = t.expiresAt && new Date(t.expiresAt) < new Date();
      const label    = t.label || '(sin nombre)';
      const ago      = _timeAgo(t.createdAt);

      let statusHtml, actionsHtml;
      if (t.used) {
        const who = t.clientName && t.clientName !== t.label ? ` · ${t.clientName}` : '';
        statusHtml = `<div style="font-size:12px;color:var(--green);font-weight:600;margin:4px 0">✅ Pedido registrado${who}</div>
          <div style="font-size:13px;color:var(--purple);font-weight:700;letter-spacing:2px">#${shortId}</div>`;
        actionsHtml = `<button onclick="deleteToken('${t.id}')" style="flex:1;padding:8px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:8px;color:var(--red);font-size:12px;cursor:pointer">🗑️ Eliminar</button>`;
      } else if (expired) {
        statusHtml = `<div style="font-size:12px;color:var(--red);font-weight:600;margin:4px 0">⏰ Vencido</div>`;
        actionsHtml = `<button onclick="deleteToken('${t.id}')" style="flex:1;padding:8px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:8px;color:var(--red);font-size:12px;cursor:pointer">🗑️ Eliminar</button>`;
      } else {
        statusHtml = `<div style="font-size:12px;color:var(--blue);font-weight:600;margin:4px 0">🔵 Disponible · #${shortId}</div>`;
        const labelEsc = (t.label||'').replace(/'/g,"\\'");
        actionsHtml = `
          <button onclick="copyToken('${t.id}','${labelEsc}')" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--text);font-size:12px;cursor:pointer">📤 Compartir</button>
          <button onclick="shareTokenWA('${t.id}','${labelEsc}')" style="flex:1;padding:8px;background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.25);border-radius:8px;color:#25d366;font-size:12px;cursor:pointer">💬 WA</button>
          <button onclick="window.open(_tokenUrl('${t.id}'),'_blank')" style="padding:8px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--text2);font-size:12px;cursor:pointer" title="Previsualizar">↗</button>
          <button onclick="deleteToken('${t.id}')" style="padding:8px 10px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:8px;color:var(--red);font-size:12px;cursor:pointer">🗑️</button>`;
      }

      return `<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="font-size:15px;font-weight:700;margin-bottom:2px">${t.label||'<span style="opacity:.4;font-style:italic">sin nombre</span>'}</div>
        ${statusHtml}
        <div style="font-size:11px;color:var(--text2);margin-bottom:10px;margin-top:2px">${ago}</div>
        <div style="display:flex;gap:6px">${actionsHtml}</div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:12px;padding:8px">Error: ${e.message}</div>`;
  }
}

function generateAndCopy()  { _doGenerate('copy');  }
function generateAndShare() { _doGenerate('share'); }
function generateAndOpen()  { _doGenerate('open');  }

async function _doGenerate(action) {
  const {db, wsId} = _tokenBase();
  if (!db || !wsId) { toast('⚠️ Conectate a la nube primero'); return; }
  const label    = ($('tokenLabel') ||{value:''}).value.trim();
  const phone    = ($('tokenPhone') ||{value:''}).value.trim().replace(/\D/g,'');
  const expDays  = ($('tokenExpiry')||{value:''}).value;
  const tok = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const data = {
    label,
    prefillName:  label || null,
    prefillPhone: phone || null,
    singleUse:  true,
    used:       false,
    createdAt:  new Date().toISOString(),
    expiresAt:  expDays ? new Date(Date.now() + Number(expDays)*86400000).toISOString() : null,
    clientName: null, orderId: null, trackCode: null,
  };
  try {
    await db.collection('ws').doc(wsId).collection('tokens').doc(tok).set(data);
    const url = _tokenUrl(tok);
    const lbl = $('tokenLabel'); if(lbl) lbl.value = '';
    const phn = $('tokenPhone'); if(phn) phn.value = '';
    renderTokenList();
    if (action === 'copy') {
      try { await navigator.clipboard.writeText(url); } catch(e) {}
      toast('📋 Link copiado');
    } else if (action === 'share') {
      await _shareLink(url, label ? `Link de pedido — ${label}` : 'Link de pedido');
    } else if (action === 'open') {
      window.open(url, '_blank');
    }
  } catch(e) { toast('⚠️ Error: ' + e.message); }
}

async function _shareLink(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title: title || 'Link de pedido', url }); return; }
    catch(e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); } catch(e) {}
  toast('📋 Link copiado');
}

async function copyToken(tokenId, label){
  const url = _tokenUrl(tokenId);
  await _shareLink(url, label ? `Link para ${label}` : 'Link de pedido');
}

function shareTokenWA(tokenId, label){
  const url = _tokenUrl(tokenId);
  const name = label || '';
  const biz  = S.config && S.config.name ? S.config.name : 'Mi tienda';
  const msg  = name
    ? `Hola ${name} 👋\n\nPor acá te envío tu link personal para registrar tu pedido en *${biz}*:\n\n🔗 ${url}\n\n_El link es de uso único y solo para vos._`
    : `📦 *${biz}*\n\nRegistá tu pedido acá:\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

async function deleteToken(tokenId){
  const {db, wsId} = _tokenBase();
  if (!db || !wsId) return;
  if (!confirm('¿Eliminar este link?')) return;
  try {
    await db.collection('ws').doc(wsId).collection('tokens').doc(tokenId).delete();
    toast('🗑️ Link eliminado');
    renderTokenList();
  } catch(e) { toast('⚠️ Error: ' + e.message); }
}

/* ── QR SCANNER ── */
let _qrStream = null, _qrLoop = null, _qrDetector = null;

function openQR(){
  openOverlay('qrOverlay');
  startQR();
}

async function startQR(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Cámara no disponible'); closeQR(); return;
  }
  // Init BarcodeDetector (native — best on Android/Brave)
  if ('BarcodeDetector' in window) {
    try { _qrDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch(e) { _qrDetector = null; }
  }
  // If no native detector, load jsQR from CDN
  if (!_qrDetector && !window.jsQR) {
    await new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    _qrStream = stream;
    const vid = $('qrVideo');
    if (vid) { vid.srcObject = stream; await vid.play().catch(()=>{}); }
    _scanTick();
  } catch(e) {
    toast('No se pudo acceder a la cámara'); closeQR();
  }
}

function _scanTick() {
  const vid = $('qrVideo');
  if (!vid || !_qrStream) return;

  if (_qrDetector) {
    _qrDetector.detect(vid).then(codes => {
      if (codes.length) { handleQR(codes[0].rawValue); return; }
      _qrLoop = setTimeout(_scanTick, 150);
    }).catch(() => { _qrLoop = setTimeout(_scanTick, 150); });
  } else if (window.jsQR) {
    const canvas = $('qrCanvas');
    if (!canvas) { _qrLoop = setTimeout(_scanTick, 150); return; }
    const ctx = canvas.getContext('2d');
    if (vid.readyState >= vid.HAVE_ENOUGH_DATA && vid.videoWidth > 0) {
      canvas.width  = vid.videoWidth;
      canvas.height = vid.videoHeight;
      ctx.drawImage(vid, 0, 0);
      try {
        const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code) { handleQR(code.data); return; }
      } catch(e) {}
    }
    _qrLoop = setTimeout(_scanTick, 150);
  } else {
    _qrLoop = setTimeout(_scanTick, 300);
  }
}

function handleQR(data){
  closeQR();
  if (typeof goPage === 'function') goPage('envios');
  _filt = ''; renderChips();
  const el = $('fSearch');
  if (!el) return;
  el.value = data;
  render();
  const phone = data.replace(/\D/g,'');
  const match = S.shipments.find(x => x.phone.replace(/\D/g,'').includes(phone) || phone.includes(x.phone.replace(/\D/g,'')));
  if (match) {
    setTimeout(() => {
      const card = document.querySelector('#cardsArea .card');
      if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 150);
    toast(`✅ Cliente encontrado: ${match.name}`);
  } else {
    toast(`❌ Sin resultados para: ${data}`);
  }
}

function closeQR(){
  if (_qrLoop) { clearTimeout(_qrLoop); cancelAnimationFrame(_qrLoop); _qrLoop = null; }
  if (_qrStream) { _qrStream.getTracks().forEach(t=>t.stop()); _qrStream = null; }
  closeOverlay('qrOverlay');
}

/* ════════════════════════════════════════
   DELIVERY ROUTE
════════════════════════════════════════ */
let _routeCourier = '', _routeDelivId = null;
let _routeOrder = [], _routeDrivers = {};
let _sigCtx = null, _sigDrawing = false, _sigHasContent = false;

/* Triple-tap detection per courier header */
const _cHdrTaps = {};
function onCourierHdrTap(courier) {
  const now = Date.now();
  if (!_cHdrTaps[courier]) _cHdrTaps[courier] = { n: 0, t: 0 };
  const tap = _cHdrTaps[courier];
  if (now - tap.t > 600) tap.n = 0;
  tap.n++; tap.t = now;
  if (tap.n >= 3) { tap.n = 0; openRoute(courier); }
}

function openRoute(courier) {
  _routeCourier = courier;
  $('routeTitle').textContent = '🚚🗺️ Ruta — ' + courier;
  const pending = S.shipments.filter(x => x.courier === courier && x.status !== 'Finalizado');
  _routeOrder = pending.map(x => x.id);
  renderRouteList();
  openOverlay('routeOverlay');
}

function renderRouteList() {
  const el = $('routeList'); if (!el) return;
  let items = S.shipments.filter(x => x.courier === _routeCourier && x.status !== 'Finalizado');
  // Sort by _routeOrder; append any new items not yet in order
  const ordMap = {}; _routeOrder.forEach((id, i) => ordMap[id] = i);
  items.forEach(x => { if (!(x.id in ordMap)) { ordMap[x.id] = _routeOrder.length; _routeOrder.push(x.id); } });
  items.sort((a, b) => (ordMap[a.id] ?? 999) - (ordMap[b.id] ?? 999));
  if (!items.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text2)">✅ Sin entregas pendientes</div>';
    return;
  }
  const total = items.length;
  el.innerHTML = items.map((s, i) => {
    const proof  = s.deliveryProof;
    const done   = proof && proof.deliveredAt;
    const driver = _routeDrivers[s.id] || '';
    const ph     = (s.phone || '').replace(/\D/g, '');
    return `<div class="route-item ${done ? 'route-done' : ''}" id="ri-${s.id}">
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;padding-top:1px">
        <div class="route-num" style="${done ? 'background:var(--green)' : ''}">${done ? '✓' : i + 1}</div>
        ${!done && total > 1 ? `
        <button onclick="_routeMove('${s.id}',-1)" style="width:22px;height:22px;border-radius:6px;background:var(--bg3);border:1px solid var(--bd);color:var(--text2);font-size:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;padding:0" ${i===0?'disabled style="opacity:.3;pointer-events:none;width:22px;height:22px;border-radius:6px;background:var(--bg3);border:1px solid var(--bd);color:var(--text2);font-size:10px;display:flex;align-items:center;justify-content:center;padding:0"':''}>▲</button>
        <button onclick="_routeMove('${s.id}',1)"  style="width:22px;height:22px;border-radius:6px;background:var(--bg3);border:1px solid var(--bd);color:var(--text2);font-size:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;padding:0" ${i===total-1?'disabled style="opacity:.3;pointer-events:none;width:22px;height:22px;border-radius:6px;background:var(--bg3);border:1px solid var(--bd);color:var(--text2);font-size:10px;display:flex;align-items:center;justify-content:center;padding:0"':''}>▼</button>
        ` : ''}
      </div>
      <div class="route-info">
        <div class="route-name">${s.name}</div>
        <div class="route-addr">🏠 ${_isDeliveryCourier(s.courier) ? mapsLink(s.address, s.gpsCoords) : (s.address||'')}</div>
        ${ph ? `<div onclick="_routePhoneMenu(event,'${ph}')" style="font-size:11px;color:var(--blue);cursor:pointer;margin-top:2px;display:inline-flex;align-items:center;gap:3px">📞 ${s.phone} <span style="font-size:9px;opacity:.7">▾</span></div>` : ''}
        ${!done ? `<div style="margin-top:5px" onclick="_routePickDriver(event,'${s.id}')">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;cursor:pointer;border:1px solid ${driver?'rgba(163,113,247,.5)':'var(--bd)'};background:${driver?'rgba(163,113,247,.1)':'var(--bg3)'};color:${driver?'var(--purple)':'var(--text2)'}">👤 ${driver||'Sin driver'} <span style="font-size:9px">▾</span></span>
        </div>` : ''}
        ${done ? `<div style="font-size:11px;color:var(--green);margin-top:3px">✅ Recibió: ${proof.receivedBy || '—'}</div>` : ''}
      </div>
      ${!done ? `<button class="route-btn" onclick="startDelivery('${s.id}')">📦 Entregar</button>` : ''}
    </div>`;
  }).join('');
}

function _routeMove(id, dir) {
  const i = _routeOrder.indexOf(id); if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= _routeOrder.length) return;
  [_routeOrder[i], _routeOrder[j]] = [_routeOrder[j], _routeOrder[i]];
  renderRouteList();
}

function _routePhoneMenu(ev, phone) {
  ev.stopPropagation();
  document.getElementById('_rPhPop')?.remove();
  const pop = document.createElement('div');
  pop.id = '_rPhPop';
  pop.style.cssText = 'position:fixed;z-index:700;background:var(--bg3);border:1px solid var(--bd);border-radius:14px;padding:6px;display:flex;flex-direction:column;gap:3px;box-shadow:0 8px 28px rgba(0,0,0,.5);min-width:165px';
  pop.innerHTML = `
    <a href="tel:${phone}" style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:10px;text-decoration:none;color:var(--text);font-size:13px;font-weight:600;background:rgba(56,139,253,.1)">📞 Llamar</a>
    <a href="https://wa.me/51${phone}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:10px;text-decoration:none;color:var(--text);font-size:13px;font-weight:600;background:rgba(46,160,67,.1)">💬 WhatsApp</a>`;
  const r = ev.target.getBoundingClientRect();
  pop.style.top  = Math.min(r.bottom + 6, window.innerHeight - 120) + 'px';
  pop.style.left = Math.min(r.left, window.innerWidth - 180) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 10);
}

function _routePickDriver(ev, shipId) {
  ev.stopPropagation();
  document.getElementById('_rDrPop')?.remove();
  const emps = (S.employees || []);
  const pop = document.createElement('div');
  pop.id = '_rDrPop';
  pop.style.cssText = 'position:fixed;z-index:700;background:var(--bg3);border:1px solid var(--bd);border-radius:14px;padding:6px;display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 28px rgba(0,0,0,.5);min-width:175px;max-height:220px;overflow-y:auto';
  const cur = _routeDrivers[shipId] || '';
  let html = `<div style="padding:7px 12px 5px;font-size:10px;color:var(--text2);font-weight:700;letter-spacing:.5px">ASIGNAR DRIVER</div>`;
  if (cur) html += `<button onclick="_routeSetDriver('${shipId}','');document.getElementById('_rDrPop')?.remove()" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;color:var(--text2);font-size:12px;background:transparent;border:none;cursor:pointer;font-family:inherit;width:100%;text-align:left">✕ Sin driver</button>`;
  if (!emps.length) html += `<div style="padding:10px 12px;font-size:12px;color:var(--text2)">Sin empleados registrados</div>`;
  emps.forEach(e => {
    const nm = e.name || e; const sel = nm === cur;
    html += `<button onclick="_routeSetDriver('${shipId}','${nm.replace(/'/g,"\\'")}');document.getElementById('_rDrPop')?.remove()" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;color:${sel?'var(--purple)':'var(--text)'};font-size:12px;font-weight:${sel?700:400};background:${sel?'rgba(163,113,247,.1)':'transparent'};border:none;cursor:pointer;font-family:inherit;width:100%;text-align:left">👤 ${nm}</button>`;
  });
  pop.innerHTML = html;
  const r = ev.target.getBoundingClientRect();
  pop.style.top  = Math.min(r.bottom + 6, window.innerHeight - 240) + 'px';
  pop.style.left = Math.min(r.left, window.innerWidth - 195) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 10);
}

function _routeSetDriver(shipId, empName) {
  if (empName) _routeDrivers[shipId] = empName;
  else delete _routeDrivers[shipId];
  renderRouteList();
}

function startDelivery(id) {
  _routeDelivId = id;
  const s = S.shipments.find(x => x.id === id); if (!s) return;
  $('deliveryClientName').textContent = s.name;
  $('deliveryClientAddr').innerHTML = '🏠 ' + (_isDeliveryCourier(s.courier) ? mapsLink(s.address, s.gpsCoords) : (s.address||''));
  $('deliveryReceivedBy').value = '';
  const prev = $('deliveryPhotoPrev');
  if (prev) { prev.innerHTML = `<button class="btn-sec" onclick="$('deliveryPhotoInput').click()" style="flex:1">📷 Tomar foto</button>`; delete prev.dataset.photo; }
  _initSigCanvas();
  openOverlay('deliveryOverlay');
}

function _initSigCanvas() {
  const c = $('sigCanvas'); if (!c) return;
  c.width = c.offsetWidth || 300;
  _sigHasContent = false;
  _sigCtx = c.getContext('2d');
  _sigCtx.clearRect(0, 0, c.width, c.height);
  _sigCtx.strokeStyle = '#e6edf3';
  _sigCtx.lineWidth = 2.5;
  _sigCtx.lineCap = _sigCtx.lineJoin = 'round';
  const pos = ev => {
    const r = c.getBoundingClientRect();
    const s = ev.touches ? ev.touches[0] : ev;
    return { x: (s.clientX - r.left) * (c.width / r.width), y: (s.clientY - r.top) * (c.height / r.height) };
  };
  c.onpointerdown = ev => { _sigDrawing = true; const p = pos(ev); _sigCtx.beginPath(); _sigCtx.moveTo(p.x, p.y); ev.preventDefault(); };
  c.onpointermove = ev => { if (!_sigDrawing) return; const p = pos(ev); _sigCtx.lineTo(p.x, p.y); _sigCtx.stroke(); _sigHasContent = true; ev.preventDefault(); };
  c.onpointerup = c.onpointercancel = () => { _sigDrawing = false; };
}

function clearSig() {
  const c = $('sigCanvas'); if (!c || !_sigCtx) return;
  _sigCtx.clearRect(0, 0, c.width, c.height);
  _sigHasContent = false;
}

function onDeliveryPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const max = 800; let w = img.width, h = img.height;
      if (w > max || h > max) { if (w > h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } }
      const cnv = document.createElement('canvas'); cnv.width = w; cnv.height = h;
      cnv.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = cnv.toDataURL('image/jpeg', 0.72);
      const prev = $('deliveryPhotoPrev');
      prev.innerHTML = `<img src="${compressed}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--bd)">
        <button class="btn-sec" onclick="$('deliveryPhotoInput').click()" style="flex:1">🔄 Cambiar</button>`;
      prev.dataset.photo = compressed;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function confirmDelivery() {
  const receivedBy = ($('deliveryReceivedBy') || {value:''}).value.trim();
  if (!receivedBy) { toast('⚠️ Escribe quién recibió el pedido'); return; }
  const prev = $('deliveryPhotoPrev');
  const photo     = prev && prev.dataset.photo || null;
  const sigCanvas = $('sigCanvas');
  const signature = (_sigHasContent && sigCanvas) ? sigCanvas.toDataURL('image/png') : null;
  const s = S.shipments.find(x => x.id === _routeDelivId); if (!s) return;
  s.deliveryProof = { receivedBy, photo, signature, deliveredAt: new Date().toISOString() };
  s.status = 'Finalizado';
  save(); render();
  closeOverlay('deliveryOverlay');
  toast('✅ Entregado a ' + receivedBy);
  renderRouteList();
}


