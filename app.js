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
if (S.activeUser === undefined) S.activeUser = null;
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
  else{data.id='id_'+Date.now();data.createdAt=new Date().toISOString();S.shipments.push(data);toast(autoSt?'🤖 Envío registrado (estado automático)':'✅ Envío registrado');}
  save(); closeOverlay('formOverlay'); render();
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
function doPrint(){
  const list=S.shipments.filter(x=>x.sel).length?S.shipments.filter(x=>x.sel):S.shipments;
  if(!list.length){toast('Sin envíos');return;}
  const qr=phone=>`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(phone)}`;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Envíos</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.card{border:1px solid #ddd;border-radius:8px;padding:12px;display:flex;gap:10px;page-break-inside:avoid}.info{flex:1}.name{font-weight:700;font-size:13px}.phone{color:#1a56db}.addr{color:#555;font-size:11px}.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}.qr{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0}.qr img{width:72px;height:72px}.qr span{font-size:9px;color:#888}@media print{.grid{gap:8px}}</style></head><body>
    <h2 style="margin-bottom:16px">📦 Envíos — ${S.config.name} · ${new Date().toLocaleDateString('es-PE')}</h2>
    <div class="grid">${list.map(s=>`<div class="card"><div class="info"><div class="name">${s.name}</div><div class="phone">📞 ${s.phone}</div><div class="addr">🏠 ${s.address}</div><div style="font-size:10px;color:#777;margin:3px 0">🚚 ${s.courier} · 📅 ${s.date||'—'}${s.cost?` · S/ ${s.cost}`:''}</div><span class="badge">${s.status}</span>${s.notes?`<div style="font-size:10px;color:#777;margin-top:3px">📝 ${s.notes}</div>`:''}</div><div class="qr"><img src="${qr(s.phone)}" alt="QR"><span>${s.phone}</span></div></div>`).join('')}</div>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
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
          <button onclick="copyToken('${t.id}')" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--text);font-size:12px;cursor:pointer">📋 Copiar</button>
          <button onclick="shareTokenWA('${t.id}','${labelEsc}')" style="flex:1;padding:8px;background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.25);border-radius:8px;color:#25d366;font-size:12px;cursor:pointer">📱 WA</button>
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

function generateToken(){
  const {db, wsId} = _tokenBase();
  if (!db || !wsId) { toast('⚠️ Conectate a la nube primero'); return; }
  const label   = ($('tokenLabel')  ||{value:''}).value.trim();
  const expDays = ($('tokenExpiry') ||{value:''}).value;
  const tok = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const data = {
    label:      label || '',
    singleUse:  true,
    used:       false,
    createdAt:  new Date().toISOString(),
    expiresAt:  expDays ? new Date(Date.now() + Number(expDays)*86400000).toISOString() : null,
    clientName: null, orderId: null, trackCode: null,
  };
  db.collection('ws').doc(wsId).collection('tokens').doc(tok).set(data)
    .then(() => {
      const url = _tokenUrl(tok);
      navigator.clipboard.writeText(url).then(()=>{}).catch(()=>{});
      toast(label ? `✅ Link para ${label} — copiado` : '✅ Link generado y copiado');
      const lbl = $('tokenLabel'); if (lbl) lbl.value = '';
      renderTokenList();
    })
    .catch(e => toast('⚠️ Error: ' + e.message));
}

function copyToken(tokenId){
  const url = _tokenUrl(tokenId);
  navigator.clipboard.writeText(url).then(()=>toast('📋 Link copiado')).catch(()=>{});
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

/* ── SUPPLIERS ── */
function globalSuppSearch(){
  const q = ($('globalSuppSearch')||{value:''}).value.trim().toLowerCase();
  if (!q) { render(); return; }
  const el = $('suppList');
  if (!el) return;
  const all = [];
  S.suppliers.forEach(sup => {
    (sup.items||[]).forEach(item => {
      if (item.name.toLowerCase().includes(q)) all.push({sup, item});
    });
  });
  el.innerHTML = all.length
    ? all.map(({sup,item}) => `<div class="cfl-item"><span class="cfl-icon">🔍</span><span class="cfl-name">${item.name}</span><span style="font-size:11px;color:var(--text2)">${sup.name}</span></div>`).join('')
    : `<div style="text-align:center;padding:24px;color:var(--text2)">Sin resultados</div>`;
}
function openSupplier(i){
  if (!S.suppliers[i]) return;
  S._suppIdx = i;
  const sup = S.suppliers[i];
  $('suppOverlayTitle').textContent = sup.name;
  renderSuppItems();
  openOverlay('suppOverlay');
}
function toggleAllSuppItems(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const all = S.suppliers[i].items || [];
  const allChecked = all.every(x => x.checked);
  all.forEach(x => x.checked = !allChecked);
  save(); renderSuppItems();
}
function filterSuppItems(val){
  S._suppFilter = val;
  renderSuppItems();
}
function bulkVerifySupp(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  S.suppliers[i].items.forEach(x => { if (x.checked) x.verified = true; });
  save(); renderSuppItems();
}
function renderSuppItems(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const sup = S.suppliers[i];
  const filter = S._suppFilter || 'all';
  let items = (sup.items || []).filter((x, idx) => {
    if (filter === 'checked') return x.checked;
    if (filter === 'verified') return x.verified;
    if (filter === 'pending') return !x.verified;
    return true;
  });
  const el = $('suppItemsList');
  if (!el) return;
  if (!items.length) { el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text2)">Sin ítems</div>`; return; }
  el.innerHTML = items.map((item, idx) => {
    const realIdx = (sup.items||[]).indexOf(item);
    return `<div class="cfl-item supp-item" draggable="true"
      ontouchstart="suppTapStart(event,${realIdx})"
      ontouchmove="suppTapMove(event)"
      ontouchend="suppTapEnd(event,${realIdx})">
      <input type="checkbox" ${item.checked?'checked':''} onchange="toggleSuppItem(${realIdx},this.checked)" style="flex-shrink:0">
      <span class="cfl-name ${item.verified?'supp-verified':''}">${item.name}</span>
      ${item.qty?`<span style="font-size:11px;color:var(--text2);flex-shrink:0">x${item.qty}</span>`:''}
      ${item.verified?`<span style="font-size:10px;color:var(--green);flex-shrink:0">✓</span>`:''}
      <div class="cfl-actions">
        <button class="cfl-btn" onclick="editSuppItem(${realIdx})">✏️</button>
        <button class="cfl-btn cfl-btn-del" onclick="delSuppItem(${realIdx})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}
let _suppTapTimer = null;
function suppTapStart(e, idx){ _suppTapTimer = setTimeout(() => editSuppItem(idx), 600); }
function suppTapMove(){ clearTimeout(_suppTapTimer); }
function suppTapEnd(e, idx){ clearTimeout(_suppTapTimer); }
function editSuppItem(idx){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const item = S.suppliers[i].items[idx];
  if (!item) return;
  const name = prompt('Nombre del ítem:', item.name);
  if (name === null) return;
  const qty = prompt('Cantidad (opcional):', item.qty || '');
  item.name = name.trim() || item.name;
  item.qty = qty ? qty.trim() : '';
  save(); renderSuppItems();
}
function addSuppItem(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const name = ($('newSuppItem')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre del ítem'); return; }
  if (!S.suppliers[i].items) S.suppliers[i].items = [];
  S.suppliers[i].items.push({name, qty:'', checked:false, verified:false});
  $('newSuppItem').value = '';
  save(); renderSuppItems();
}
function toggleSuppItem(idx, val){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  if (S.suppliers[i].items[idx]) S.suppliers[i].items[idx].checked = val;
  save();
}
function delSuppItem(idx){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  S.suppliers[i].items.splice(idx, 1);
  save(); renderSuppItems();
}
function moveAllToPorAlistar(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const checked = (S.suppliers[i].items||[]).filter(x=>x.checked);
  if (!checked.length) { toast('No hay ítems seleccionados'); return; }
  checked.forEach(item => {
    S.shipments.push({
      id:'supp_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      name: item.name, phone:'', address:'', courier: S.couriers[0]||'',
      date: new Date().toISOString().split('T')[0],
      status:'Por alistar', cost:'', notes:'', privateNote:'',
      extra:{}, docGuia:null, docEmbalado:null, docComprobante:null,
      links:[], sel:false, chkGuia:false, chkEmbalado:false, chkComprobante:false,
      createdAt: new Date().toISOString()
    });
  });
  save(); render();
  toast(`✅ ${checked.length} ítem(s) movidos a "Por alistar"`);
}
function sendSuppList(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const sup = S.suppliers[i];
  const items = (sup.items||[]).filter(x=>x.checked);
  if (!items.length) { toast('No hay ítems seleccionados'); return; }
  const text = `📦 *Lista para ${sup.name}*\n` + items.map(x=>`• ${x.name}${x.qty?` (x${x.qty})`:''}`).join('\n');
  const phone = sup.phone ? sup.phone.replace(/\D/g,'') : '';
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}
function saveNewSupplier(){
  const name = ($('newSuppName')||{value:''}).value.trim();
  const phone = ($('newSuppPhone')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre del proveedor'); return; }
  if (!S.suppliers) S.suppliers = [];
  S.suppliers.push({name, phone, items:[]});
  $('newSuppName').value = ''; if ($('newSuppPhone')) $('newSuppPhone').value = '';
  save(); renderSuppList();
  toast(`✅ Proveedor "${name}" agregado`);
}
function renderSuppList(){
  const el = $('suppList');
  if (!el) return;
  if (!S.suppliers || !S.suppliers.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text2)">Sin proveedores</div>`;
    return;
  }
  el.innerHTML = S.suppliers.map((sup, i) => `
    <div class="cfl-item" onclick="openSupplier(${i})">
      <span class="cfl-icon">🏭</span>
      <span class="cfl-name">${sup.name}</span>
      ${sup.phone ? `<span style="font-size:11px;color:var(--text2)">${sup.phone}</span>` : ''}
      <span style="font-size:11px;color:var(--text2);margin-left:auto">${(sup.items||[]).length} ítems</span>
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-edit" onclick="event.stopPropagation();openEditSupplier(${i})">✏️</button>
        <button class="cfl-btn cfl-btn-del" onclick="event.stopPropagation();confirmDelItem('supplier',${i})">🗑️</button>
      </div>
    </div>`).join('');
}
function openSuppSwitch(){
  const el = $('suppSwitchList');
  if (!el) return;
  el.innerHTML = (S.suppliers||[]).map((s,i) =>
    `<button class="day-btn ${S._suppIdx===i?'active':''}" onclick="switchSupplier(${i})">${s.name}</button>`
  ).join('');
  openOverlay('suppSwitchOverlay');
}
function switchSupplier(i){
  closeOverlay('suppSwitchOverlay');
  openSupplier(i);
}
function renderCotizArea(i){
  const el = $('cotizArea');
  if (!el || i == null || !S.suppliers[i]) return;
  const sup = S.suppliers[i];
  const imgs = sup.cotizImgs || [];
  el.innerHTML = imgs.length
    ? imgs.map((src,idx) => `<div class="cotiz-thumb" onclick="openViewer(${idx},'cotiz')">
        <img src="${src}" style="width:60px;height:60px;object-fit:cover;border-radius:6px">
        <button onclick="event.stopPropagation();delCotiz(${idx})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>
      </div>`).join('')
    : `<div style="color:var(--text2);font-size:12px;padding:8px">Sin cotizaciones</div>`;
}
function toggleCotizImg(input){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i] || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    if (!S.suppliers[i].cotizImgs) S.suppliers[i].cotizImgs = [];
    S.suppliers[i].cotizImgs.push(e.target.result);
    save(); renderCotizArea(i);
    toast('🖼️ Cotización agregada');
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function openCotizMenu(){ openOverlay('cotizMenuOverlay'); }
function loadCotiz(input){
  if (!input.files[0]) return;
  toggleCotizImg(input);
  closeOverlay('cotizMenuOverlay');
}
function delCotiz(idx){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  S.suppliers[i].cotizImgs.splice(idx, 1);
  save(); renderCotizArea(i);
}
function openEditSupplier(i){
  if (!S.suppliers[i]) return;
  const sup = S.suppliers[i];
  const name = prompt('Nombre del proveedor:', sup.name);
  if (name === null) return;
  const phone = prompt('Teléfono (opcional):', sup.phone||'');
  sup.name = name.trim() || sup.name;
  sup.phone = phone ? phone.trim() : '';
  save(); renderSuppList();
  toast('✅ Proveedor actualizado');
}
function saveEditSupplier(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const nameEl = $('editSuppName'); const phoneEl = $('editSuppPhone');
  if (!nameEl) return;
  const name = nameEl.value.trim();
  if (!name) { toast('Escribe el nombre'); return; }
  S.suppliers[i].name = name;
  if (phoneEl) S.suppliers[i].phone = phoneEl.value.trim();
  save(); renderSuppList();
  closeOverlay('editSuppOverlay');
  toast('✅ Proveedor actualizado');
}

/* ── CONFIG ── */
function saveConfig(){
  S.config.name = ($('cfgName')||{value:''}).value.trim();
  S.config.phone = ($('cfgPhone')||{value:''}).value.trim();
  S.config.city = ($('cfgCity')||{value:''}).value.trim();
  S.dispatch.cutHour = ($('dispatchCutHour')||{value:''}).value;
  S.dispatch.anticipation = parseInt(($('dispatchAnticip')||{value:'0'}).value) || 0;
  save();
  $('hdrName').textContent = S.config.name || '';
  toast('✅ Configuración guardada');
}
function toggleCourierType(name, i){
  if (!S.courierTypes) S.courierTypes = {};
  S.courierTypes[name] = (S.courierTypes[name] === 'agencia') ? 'delivery' : 'agencia';
  save(); loadCfgUI();
}
function toggleExtraFlag(i, flag){
  if (!S.extraFields[i]) return;
  if (typeof S.extraFields[i] === 'string') S.extraFields[i] = {name: S.extraFields[i]};
  if (flag === 'required') S.extraFields[i].required = !S.extraFields[i].required;
  if (flag === 'visible') S.extraFields[i].visible = S.extraFields[i].visible === false ? true : false;
  save(); loadCfgUI();
}
let _editLabelIdx = null;
function openLabelEdit(label, idx){
  _editLabelIdx = idx;
  $('labelEditTitle').textContent = label;
  const msgs = S.msgTemplates[label] || ['',''];
  $('labelMsg1').value = msgs[0] || '';
  $('labelMsg2').value = msgs[1] || '';
  if (idx !== null) {
    $('labelEditNameWrap') && ($('labelEditNameWrap').style.display = '');
    $('labelEditName') && ($('labelEditName').value = label);
  } else {
    $('labelEditNameWrap') && ($('labelEditNameWrap').style.display = 'none');
  }
  openOverlay('labelEditOverlay');
}
function saveLabelEdit(){
  const title = $('labelEditTitle').textContent;
  let label = title;
  if (_editLabelIdx !== null && $('labelEditName')) {
    const newName = $('labelEditName').value.trim();
    if (newName && newName !== title) {
      const old = S.labels[_editLabelIdx];
      S.labels[_editLabelIdx] = newName;
      if (S.msgTemplates[old]) { S.msgTemplates[newName] = S.msgTemplates[old]; delete S.msgTemplates[old]; }
      S.shipments.forEach(x => { if (x.status === old) x.status = newName; });
      label = newName;
    }
  }
  const m1 = ($('labelMsg1')||{value:''}).value;
  const m2 = ($('labelMsg2')||{value:''}).value;
  if (m1.trim() || m2.trim()) S.msgTemplates[label] = [m1, m2];
  else delete S.msgTemplates[label];
  save(); loadCfgUI();
  closeOverlay('labelEditOverlay');
  toast('✅ Etiqueta guardada');
}
let _editCourierIdx = null;
function openCourierEdit(i){
  _editCourierIdx = i;
  if ($('editCourierName')) $('editCourierName').value = S.couriers[i] || '';
  openOverlay('courierEditOverlay');
}
function saveCourierEdit(){
  const name = ($('editCourierName')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre'); return; }
  if (_editCourierIdx == null) return;
  const old = S.couriers[_editCourierIdx];
  S.couriers[_editCourierIdx] = name;
  if (S.courierTypes && S.courierTypes[old]) { S.courierTypes[name] = S.courierTypes[old]; delete S.courierTypes[old]; }
  if (S.courierActive && S.courierActive[old] !== undefined) { S.courierActive[name] = S.courierActive[old]; delete S.courierActive[old]; }
  S.shipments.forEach(x => { if (x.courier === old) x.courier = name; });
  save(); loadCfgUI();
  closeOverlay('courierEditOverlay');
  toast('✅ Courier actualizado');
}
let _editExtraIdx = null;
function openExtraEdit(i){
  _editExtraIdx = i;
  const f = S.extraFields[i];
  const nm = typeof f === 'string' ? f : (f.name || '');
  if ($('editExtraName')) $('editExtraName').value = nm;
  openOverlay('extraEditOverlay');
}
function saveExtraEdit(){
  const name = ($('editExtraName')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre'); return; }
  if (_editExtraIdx == null) return;
  const f = S.extraFields[_editExtraIdx];
  if (typeof f === 'string') S.extraFields[_editExtraIdx] = name;
  else S.extraFields[_editExtraIdx] = {...f, name};
  save(); loadCfgUI();
  closeOverlay('extraEditOverlay');
  toast('✅ Campo actualizado');
}
function addLabelInline(){
  const el = $('newLabelInput');
  if (!el) return;
  const name = el.value.trim();
  if (!name) { toast('Escribe el nombre de la etiqueta'); return; }
  if (S.labels.includes(name)) { toast('Ya existe esa etiqueta'); return; }
  S.labels.push(name);
  el.value = '';
  save(); loadCfgUI(); renderChips();
  toast(`✅ Etiqueta "${name}" agregada`);
}
function addCourierInline(){
  const el = $('newCourierInp');
  if (!el) return;
  const name = el.value.trim();
  if (!name) { toast('Escribe el nombre del courier'); return; }
  if (S.couriers.includes(name)) { toast('Ya existe ese courier'); return; }
  S.couriers.push(name);
  el.value = '';
  save(); loadCfgUI();
  toast(`✅ Courier "${name}" agregado`);
}
function addExtraInline(){
  const el = $('newExtraInp');
  if (!el) return;
  const name = el.value.trim();
  if (!name) { toast('Escribe el nombre del campo'); return; }
  if (S.extraFields.find(f => (typeof f==='string'?f:f.name) === name)) { toast('Ya existe ese campo'); return; }
  S.extraFields.push({name, required:false, visible:true});
  el.value = '';
  save(); loadCfgUI();
  toast(`✅ Campo "${name}" agregado`);
}
function confirmDelItem(type, i){
  if (!confirm(`¿Eliminar este ${type === 'label' ? 'etiqueta' : type === 'courier' ? 'courier' : type === 'extra' ? 'campo' : 'ítem'}?`)) return;
  if (type === 'label') { S.labels.splice(i,1); renderChips(); }
  else if (type === 'courier') S.couriers.splice(i,1);
  else if (type === 'extra') S.extraFields.splice(i,1);
  else if (type === 'supplier') { S.suppliers.splice(i,1); renderSuppList(); }
  save(); loadCfgUI();
  toast('🗑️ Eliminado');
}
function toggleDispatchDay(v){
  if (!S.dispatch.days) S.dispatch.days = [];
  const idx = S.dispatch.days.indexOf(v);
  if (idx === -1) S.dispatch.days.push(v);
  else S.dispatch.days.splice(idx,1);
  save(); loadCfgUI();
}
function toggleCourierActive(name){
  if (!S.courierActive) S.courierActive = {};
  S.courierActive[name] = S.courierActive[name] === false ? true : false;
  save(); loadCfgUI();
}

/* ── DRAG & DROP (labels) ── */
let _dragIdx = null;
function dragStart(e, i){ _dragIdx = i; e.dataTransfer.effectAllowed='move'; }
function dragOver(e, i){ e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function dropLabel(e, i){
  e.preventDefault();
  if (_dragIdx === null || _dragIdx === i) return;
  const labels = [...S.labels];
  const moved = labels.splice(_dragIdx, 1)[0];
  labels.splice(i, 0, moved);
  S.labels = labels;
  _dragIdx = null;
  save(); loadCfgUI(); renderChips();
}
function dragEnd(){ _dragIdx = null; }

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
   TAREAS
════════════════════════════════════════ */
let _taskEmpFilter = '';
let _taskStatusFilter = 'all';
let _blockingTaskId = null;

function setTaskFilter(f) {
  _taskStatusFilter = f;
  /* chips */
  ['All','Alta','Pend','Prog','Done','Block'].forEach(x => {
    const el = $('tFilter' + x); if (el) el.classList.remove('active');
  });
  const chipMap = {all:'All', alta:'Alta', pending:'Pend', inprogress:'Prog', done:'Done', blocked:'Block'};
  const chip = $('tFilter' + (chipMap[f] || 'All'));
  if (chip) chip.classList.add('active');
  /* pills */
  ['All','Pend','Prog','Block','Done'].forEach(x => {
    const el = $('tPill' + x); if (el) el.classList.remove('active');
  });
  const pillMap = {all:'All', pending:'Pend', inprogress:'Prog', blocked:'Block', done:'Done'};
  const pill = $('tPill' + (pillMap[f] || 'All'));
  if (pill) pill.classList.add('active');
  renderTasks();
}

function setEmpFilter(name) {
  _taskEmpFilter = name;
  renderEmpAvatars();
  renderTasks();
}

function updateTaskStats() {
  const t = S.tasks;
  if ($('tTotal'))   $('tTotal').textContent   = t.length;
  if ($('tPend'))    $('tPend').textContent     = t.filter(x => x.status === 'pending').length;
  if ($('tInProg'))  $('tInProg').textContent   = t.filter(x => x.status === 'inprogress').length;
  if ($('tBlocked')) $('tBlocked').textContent  = t.filter(x => x.status === 'blocked').length;
  if ($('tDone'))    $('tDone').textContent      = t.filter(x => x.status === 'done').length;
}

function renderEmpAvatars() {
  const el = $('empAvatars');
  if (!el) return;
  const colors = ['#388bfd','#a371f7','#3fb950','#f78166','#e3b341','#58a6ff','#d2a8ff'];
  const allAvatar = `<div class="emp-avatar ${_taskEmpFilter===''?'active':''}" onclick="setEmpFilter('')"
    style="background:${_taskEmpFilter===''?'var(--blue)':'var(--bg3)'}">
    <span style="font-size:18px">👤</span><span>Todos</span>
  </div>`;
  const empAv = S.employees.map((e, i) => {
    const name = _eName(e);
    const col = colors[i % colors.length];
    const ini = name.slice(0,1).toUpperCase();
    const cnt = S.tasks.filter(t => t.assignedTo === name && t.status !== 'done').length;
    return `<div class="emp-avatar ${_taskEmpFilter===name?'active':''}" onclick="setEmpFilter('${name.replace(/'/g,"\\'")}')"
      style="background:${col};position:relative">
      ${ini}
      ${cnt > 0 ? `<div style="position:absolute;top:-2px;right:-2px;background:var(--red);color:#fff;border-radius:50%;width:14px;height:14px;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700">${cnt}</div>` : ''}
      <span style="color:rgba(255,255,255,.8)">${name.length>7?name.slice(0,6)+'…':name}</span>
    </div>`;
  }).join('');
  el.innerHTML = allAvatar + empAv +
    `<div class="emp-avatar" onclick="openOverlay('empFormOverlay');renderEmpList()" style="background:var(--bg3);border:1px dashed var(--bd)">
      <span style="font-size:16px">⚙️</span><span>Editar</span>
    </div>`;
}

function renderTasks() {
  updateTaskStats();
  renderEmpAvatars();
  const el = $('taskArea');
  if (!el) return;
  const q = ($('taskSearch')||{value:''}).value.toLowerCase();
  let tasks = [...S.tasks];
  if (_taskEmpFilter) tasks = tasks.filter(t => t.assignedTo === _taskEmpFilter);
  if (_taskStatusFilter === 'alta')       tasks = tasks.filter(t => t.priority === 'alta');
  else if (_taskStatusFilter === 'pending')    tasks = tasks.filter(t => t.status === 'pending');
  else if (_taskStatusFilter === 'inprogress') tasks = tasks.filter(t => t.status === 'inprogress');
  else if (_taskStatusFilter === 'done')       tasks = tasks.filter(t => t.status === 'done');
  else if (_taskStatusFilter === 'blocked')    tasks = tasks.filter(t => t.status === 'blocked');
  if (q) tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q));

  if (!tasks.length) {
    el.innerHTML = `<div class="empty-st"><div style="font-size:36px">📋</div><p style="margin-top:10px">Sin tareas. Presiona ＋</p></div>`;
    return;
  }

  // Group by employee
  const groups = {};
  tasks.forEach(t => {
    const key = t.assignedTo || 'Sin asignar';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const colors = ['#388bfd','#a371f7','#3fb950','#f78166','#e3b341','#58a6ff'];
  el.innerHTML = Object.entries(groups).map(([emp, items]) => {
    const empIdx = S.employees.findIndex(e => _eName(e) === emp);
    const col    = empIdx >= 0 ? colors[empIdx % colors.length] : 'var(--text2)';
    const ini    = emp.slice(0,1).toUpperCase();
    const pending = items.filter(t => t.status !== 'done').length;
    const empObj  = empIdx >= 0 ? S.employees[empIdx] : null;
    const phone   = empObj ? _ePhone(empObj) : '';
    const phone51 = phone.replace(/\D/g,'');
    const pending_titles = items.filter(t=>t.status!=='done').map(t=>`📋 ${t.title}${t.dueDate?' ('+t.dueDate+')':''}`).join('\n');
    const waMsg   = encodeURIComponent(`Hola ${emp.split(' ')[0]}, estas son tus tareas pendientes:\n\n${pending_titles}\n\nGracias 💪`);
    return `<div style="margin-bottom:14px">
      <div class="task-group-hdr">
        <div style="width:26px;height:26px;border-radius:50%;background:${col};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${ini}</div>
        <span style="color:var(--text);flex:1">${emp}</span>
        ${pending > 0 ? `<span style="background:var(--bg3);border:1px solid var(--bd);border-radius:8px;font-size:10px;padding:1px 7px;color:var(--text2)">${pending} pendiente${pending>1?'s':''}</span>` : ''}
        ${phone ? `<a href="tel:+51${phone51}" style="text-decoration:none;font-size:17px;padding:2px 4px;border-radius:7px;-webkit-tap-highlight-color:transparent" title="Llamar a ${emp}">📞</a>` : ''}
        ${phone && pending > 0 ? `<a href="https://wa.me/51${phone51}?text=${waMsg}" target="_blank" style="text-decoration:none;font-size:17px;padding:2px 4px;border-radius:7px;-webkit-tap-highlight-color:transparent" title="Enviar tareas por WhatsApp">💬</a>` : ''}
      </div>
      ${items.map(t => taskCardHTML(t)).join('')}
    </div>`;
  }).join('');
}

function taskCardHTML(t) {
  const isDone      = t.status === 'done';
  const isBlocked   = t.status === 'blocked';
  const isInProg    = t.status === 'inprogress';
  const today       = new Date().toISOString().slice(0, 10);
  const isOverdue   = !isDone && !isBlocked && t.dueDate && t.dueDate < today;
  const isToday     = !isDone && !isBlocked && t.dueDate === today;

  const chkCls  = isDone ? 'done' : isInProg ? 'inprogress' : isBlocked ? 'blocked' : '';
  const chkIcon = isDone ? '✓' : isInProg ? '▶' : isBlocked ? '✕' : '';

  let cardCls = isDone ? 't-done' : isBlocked ? 't-blocked' : isOverdue ? 't-overdue' :
                isInProg ? 't-inprogress' : t.priority === 'alta' ? 't-alta' : t.priority === 'baja' ? 't-baja' : '';

  /* Priority badge */
  const priLabel = t.priority === 'alta'
    ? `<span class="task-badge" style="background:rgba(248,113,113,.12);color:var(--red)">🔴 Alta</span>`
    : t.priority === 'baja'
    ? `<span class="task-badge" style="background:rgba(79,142,247,.12);color:var(--blue)">🔵 Baja</span>`
    : '';

  /* Status badge for in-progress */
  const inProgBadge = isInProg
    ? `<span class="task-badge" style="background:rgba(79,142,247,.12);color:var(--blue)">⏳ En curso</span>`
    : '';

  /* Due date display */
  let dueBadge = '';
  if (t.dueDate && !isDone) {
    if (isOverdue) {
      const days = Math.round((new Date(today) - new Date(t.dueDate)) / 86400000);
      dueBadge = `<span class="task-due-late">⚠️ Vencida hace ${days}d</span>`;
    } else if (isToday) {
      dueBadge = `<span class="task-due-today">📅 Hoy</span>`;
    } else {
      dueBadge = `<span class="task-due-ok">📅 ${t.dueDate}</span>`;
    }
  }

  return `<div class="task-card ${cardCls}" id="tc_${t.id}">
    <div class="task-top">
      <div class="task-chk ${chkCls}" onclick="cycleTaskStatus('${t.id}')" title="Cambiar estado">${chkIcon}</div>
      <div style="flex:1;min-width:0">
        <div class="task-title ${isDone?'done':''}">${t.title}</div>
        ${t.description ? `<div class="task-desc" style="margin-left:0;margin-top:3px">${t.description}</div>` : ''}
      </div>
      <button onclick="openTaskForm('${t.id}')" style="background:none;border:none;color:var(--text2);font-size:16px;cursor:pointer;padding:2px 4px;flex-shrink:0">✏️</button>
    </div>
    ${(priLabel || inProgBadge || dueBadge) ? `<div class="task-meta">${priLabel}${inProgBadge}${dueBadge}</div>` : ''}
    ${isBlocked ? `<div class="task-block-info">
      <span style="font-weight:700;color:#e3b341">✕ No puede${t.blockReason ? ': ' + t.blockReason : ''}</span>
      ${t.availableForVolunteers ? `<div style="color:var(--orange);margin-top:3px">🙋 Disponible para voluntarios</div>` : ''}
    </div>` : ''}
    <div class="task-actions">
      ${!isDone && !isBlocked ? `<button onclick="openBlockTask('${t.id}')" style="font-size:11px;background:rgba(227,179,65,.08);border:1px solid rgba(227,179,65,.25);color:#e3b341;border-radius:7px;padding:4px 9px;cursor:pointer">✕ No puede</button>` : ''}
      ${isBlocked ? `<button onclick="reassignTask('${t.id}')" style="font-size:11px;background:rgba(79,142,247,.1);border:1px solid rgba(79,142,247,.3);color:var(--blue);border-radius:7px;padding:4px 9px;cursor:pointer">👤 Reasignar</button>` : ''}
      <button onclick="deleteTask('${t.id}')" style="font-size:11px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red);border-radius:7px;padding:4px 9px;cursor:pointer">🗑️</button>
    </div>
  </div>`;
}

function cycleTaskStatus(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) return;
  /* cycle: pending → inprogress → done → pending */
  if (t.status === 'pending')     { t.status = 'inprogress'; }
  else if (t.status === 'inprogress') { t.status = 'done'; }
  else if (t.status === 'done')   { t.status = 'pending'; t.blockReason = ''; t.availableForVolunteers = false; }
  else if (t.status === 'blocked'){ t.status = 'pending'; }
  else { t.status = 'inprogress'; }
  save(); renderTasks();
}

/* ── Task form state ── */
let _editTaskId  = null;
let _tfEmp  = '';
let _tfDate = '';
let _tfPri  = 'normal';

const _EMP_COLORS = ['#388bfd','#a371f7','#3fb950','#f78166','#e3b341','#58a6ff'];

function _setTaskFormEmp(name) {
  _tfEmp = name;
  document.querySelectorAll('.tf-emp-chip').forEach(el => {
    const sel = el.dataset.emp === name;
    el.style.borderColor  = sel ? 'var(--blue)' : 'var(--bd)';
    el.style.background   = sel ? 'rgba(79,142,247,.15)' : 'var(--bg3)';
    el.style.color        = sel ? 'var(--text)' : 'var(--text2)';
    el.style.fontWeight   = sel ? '700' : '500';
  });
}

function _setTaskFormDate(d) {
  const inp = $('tDue');
  if (d === 'custom') {
    if (inp) { inp.style.display = 'block'; setTimeout(() => inp.focus(), 50); inp.onchange = () => { _tfDate = inp.value; }; }
    document.querySelectorAll('.tf-date-chip').forEach(el => {
      const sel = el.dataset.date === 'custom';
      el.style.borderColor = sel ? 'var(--blue)' : 'var(--bd)';
      el.style.background  = sel ? 'rgba(79,142,247,.15)' : 'var(--bg3)';
    });
    return;
  }
  _tfDate = d;
  if (inp) { inp.style.display = 'none'; inp.value = d; }
  document.querySelectorAll('.tf-date-chip').forEach(el => {
    const sel = el.dataset.date === d;
    el.style.borderColor = sel ? 'var(--blue)' : 'var(--bd)';
    el.style.background  = sel ? 'rgba(79,142,247,.15)' : 'var(--bg3)';
  });
}

function _setTaskFormPri(p) {
  _tfPri = p;
  const cfg = {
    baja:   {id:'tPriBaja', border:'var(--blue)',   bg:'rgba(79,142,247,.12)',   color:'var(--blue)'},
    normal: {id:'tPriNorm', border:'var(--blue)',   bg:'rgba(79,142,247,.1)',    color:'var(--text)'},
    alta:   {id:'tPriAlta', border:'var(--red)',    bg:'rgba(248,113,113,.12)',  color:'var(--red)'},
  };
  Object.keys(cfg).forEach(key => {
    const btn = $(cfg[key].id); if (!btn) return;
    const sel = key === p;
    btn.style.borderColor = sel ? cfg[key].border : 'var(--bd)';
    btn.style.background  = sel ? cfg[key].bg     : 'var(--bg3)';
    btn.style.color       = sel ? cfg[key].color  : 'var(--text2)';
  });
}

function _renderEmpChips() {
  const box = $('tEmpChips'); if (!box) return;
  const chips = [`<button class="tf-emp-chip" data-emp="" onclick="_setTaskFormEmp('')"
    style="padding:7px 13px;border-radius:20px;border:2px solid var(--bd);background:var(--bg3);color:var(--text2);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent">Sin asignar</button>`];
  S.employees.forEach((e, i) => {
    const name = _eName(e);
    const col = _EMP_COLORS[i % _EMP_COLORS.length];
    chips.push(`<button class="tf-emp-chip" data-emp="${name}" onclick="_setTaskFormEmp('${name.replace(/'/g,"\\'")}')"
      style="padding:7px 13px;border-radius:20px;border:2px solid var(--bd);background:var(--bg3);color:${col};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent">${name}</button>`);
  });
  box.innerHTML = chips.join('');
  _setTaskFormEmp(_tfEmp);
}

function _renderDateChips() {
  const box = $('tDateChips'); if (!box) return;
  const now = new Date();
  const iso = d => d.toISOString().slice(0,10);
  const chips = [
    {label:'Sin fecha', date:''},
    {label:'Hoy',       date: iso(now)},
    {label:'Mañana',    date: iso(new Date(now.getTime()+86400000))},
    {label:'+3 días',   date: iso(new Date(now.getTime()+3*86400000))},
    {label:'+7 días',   date: iso(new Date(now.getTime()+7*86400000))},
    {label:'📅 Elegir', date:'custom'},
  ];
  box.innerHTML = chips.map(c =>
    `<button class="tf-date-chip" data-date="${c.date}" onclick="_setTaskFormDate('${c.date}')"
      style="padding:8px 12px;border-radius:10px;border:2px solid var(--bd);background:var(--bg3);color:var(--text);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;white-space:nowrap">${c.label}</button>`
  ).join('');
  /* If editing with a saved date that's not one of the chips, show custom input */
  const presets = chips.slice(1,-1).map(c => c.date);
  if (_tfDate && !presets.includes(_tfDate)) {
    const inp = $('tDue');
    if (inp) { inp.style.display = 'block'; }
    document.querySelectorAll('.tf-date-chip').forEach(el => {
      const sel = el.dataset.date === 'custom';
      el.style.borderColor = sel ? 'var(--blue)' : 'var(--bd)';
      el.style.background  = sel ? 'rgba(79,142,247,.15)' : 'var(--bg3)';
    });
  } else {
    _setTaskFormDate(_tfDate);
  }
}

function openTaskForm(id) {
  _editTaskId = id;
  $('taskFormTitle').textContent = id ? 'Editar Tarea' : 'Nueva Tarea';
  if (id) {
    const t = S.tasks.find(x => x.id === id);
    if (!t) return;
    $('tTitle').value = t.title;
    $('tDesc').value  = t.description || '';
    _tfEmp  = t.assignedTo || '';
    _tfDate = t.dueDate    || '';
    _tfPri  = t.priority   || 'normal';
  } else {
    $('tTitle').value = '';
    $('tDesc').value  = '';
    _tfEmp  = _taskEmpFilter || '';
    _tfDate = '';
    _tfPri  = 'normal';
  }
  _renderEmpChips();
  _renderDateChips();
  _setTaskFormPri(_tfPri);
  openOverlay('taskFormOverlay');
  setTimeout(() => { const el = $('tTitle'); if (el) el.focus(); }, 120);
}

function saveTask() {
  const title = $('tTitle').value.trim();
  if (!title) { toast('⚠️ Escribe el título'); return; }
  /* If custom date input is visible, grab its value */
  const duEl = $('tDue');
  if (duEl && duEl.style.display !== 'none' && duEl.value) _tfDate = duEl.value;
  const desc = ($('tDesc')||{value:''}).value.trim();
  if (_editTaskId) {
    const t = S.tasks.find(x => x.id === _editTaskId);
    if (t) {
      t.title = title; t.description = desc;
      t.assignedTo = _tfEmp; t.dueDate = _tfDate; t.priority = _tfPri;
    }
    toast('✅ Tarea actualizada');
  } else {
    S.tasks.push({
      id: 'task_' + Date.now(), title, description: desc,
      assignedTo: _tfEmp, dueDate: _tfDate, priority: _tfPri,
      status: 'pending', blockReason: '', availableForVolunteers: false,
      createdAt: new Date().toISOString()
    });
    toast('✅ Tarea creada');
  }
  save(); closeOverlay('taskFormOverlay'); renderTasks();
}

function deleteTask(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  S.tasks = S.tasks.filter(x => x.id !== id);
  save(); renderTasks();
}

function openBlockTask(id) {
  _blockingTaskId = id;
  $('blockReason').value = '';
  $('blockVolunteer').checked = false;
  openOverlay('blockTaskOverlay');
}

function saveBlockTask() {
  const t = S.tasks.find(x => x.id === _blockingTaskId);
  if (!t) return;
  t.status = 'blocked';
  t.blockReason = $('blockReason').value.trim();
  t.availableForVolunteers = $('blockVolunteer').checked;
  save(); closeOverlay('blockTaskOverlay'); renderTasks();
  toast('✕ Tarea marcada como bloqueada');
}

function reassignTask(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) return;
  t.status = 'pending'; t.blockReason = ''; t.availableForVolunteers = false;
  openTaskForm(id);
}

/* ── EMPLOYEE HELPERS ────────────────────────────────────────────── */
function _eName(e)  { return typeof e === 'string' ? e : (e && e.name) || ''; }
function _ePin(e)   { return typeof e === 'string' ? '' : (e && e.pin) || ''; }
function _ePerms(e) { return typeof e === 'string' ? ['verPedidos','tareas'] : (e && e.permisos) || []; }
function _ePhone(e) { return typeof e === 'string' ? '' : (e && e.phone) || ''; }
function _eDni(e)   { return typeof e === 'string' ? '' : (e && e.dni) || ''; }
function _eObj(name){ return (S.employees||[]).find(e => _eName(e) === name); }

function hasPermiso(p) {
  if (!S.activeUser) return true;
  const emp = _eObj(S.activeUser);
  return emp ? _ePerms(emp).includes(p) : true;
}

/* ── USER SWITCHER ───────────────────────────────────────────────── */
function _updateUserBtn() {
  const btn = $('userBtn'); if (!btn) return;
  const av  = $('userBtnAv');
  const nm  = $('userBtnName');
  if (!S.activeUser) {
    if (av) { av.textContent = '👑'; av.style.background = 'linear-gradient(135deg,#e3b341,#a36b00)'; av.style.fontSize = '14px'; }
    if (nm) nm.textContent = 'Jefe';
    btn.style.borderColor = 'rgba(227,179,65,.4)';
    btn.style.background  = 'rgba(227,179,65,.08)';
    btn.style.color       = '#e3b341';
  } else {
    const idx = (S.employees||[]).findIndex(e => _eName(e) === S.activeUser);
    const col = _EMP_COLORS[idx >= 0 ? idx % _EMP_COLORS.length : 0];
    if (av) { av.textContent = S.activeUser.charAt(0).toUpperCase(); av.style.background = col; av.style.fontSize = '12px'; }
    if (nm) nm.textContent = S.activeUser.split(' ')[0];
    btn.style.borderColor = col + '66';
    btn.style.background  = col + '15';
    btn.style.color       = col;
  }
}

function _enforcePermisos() {
  const tabs    = ['tareas','envios','compartir','configurar'];
  const keys    = ['tareas','verPedidos','compartir','config'];
  const tabEls  = document.querySelectorAll('.tab');
  tabs.forEach((tab, i) => {
    if (tabEls[i]) tabEls[i].style.display = hasPermiso(keys[i]) ? '' : 'none';
  });
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const pid    = activePage.id.replace('page-','');
    const pidKey = pid === 'configurar' ? 'config' : pid;
    if (!hasPermiso(pidKey)) {
      const first = keys.find(k => hasPermiso(k));
      if (first && typeof goPage === 'function') goPage(first === 'config' ? 'configurar' : first);
    }
  }
}

function openUserSwitcher() {
  const list = $('userSwitcherList'); if (!list) return;
  const emps = S.employees || [];
  list.innerHTML = [
    `<div class="usr-item ${!S.activeUser?'usr-active':''}" onclick="switchToJefe()">
      <div class="usr-av" style="background:linear-gradient(135deg,#e3b341,#a36b00)">👑</div>
      <div class="usr-info"><div class="usr-nm">Jefe / Admin</div><div class="usr-sub">Acceso total</div></div>
      ${!S.activeUser?'<div class="usr-dot"></div>':''}
    </div>`,
    ...emps.map((e,i) => {
      const nm   = _eName(e);
      const active = S.activeUser === nm;
      const perms  = _ePerms(e).length;
      const col    = _EMP_COLORS[i % _EMP_COLORS.length];
      return `<div class="usr-item ${active?'usr-active':''}" onclick="switchToEmp('${nm.replace(/'/g,"\\'")}')">
        <div class="usr-av" style="background:${col};font-size:14px;font-weight:700">${nm.charAt(0).toUpperCase()}</div>
        <div class="usr-info"><div class="usr-nm">${nm}</div><div class="usr-sub">${perms} permiso${perms!==1?'s':''}</div></div>
        ${active?'<div class="usr-dot"></div>':''}
      </div>`;
    })
  ].join('');
  openOverlay('userSwitcherOverlay');
}

function switchToJefe() {
  if (!S.activeUser) { closeOverlay('userSwitcherOverlay'); return; }
  const jPin = S.statusPin || '';
  if (!jPin) { _doSwitch(null); closeOverlay('userSwitcherOverlay'); return; }
  _openPinFor(jPin, 'PIN de Jefe / Admin', () => {
    _doSwitch(null); closeOverlay('userSwitcherOverlay');
  });
}

function switchToEmp(name) {
  if (S.activeUser === name) { closeOverlay('userSwitcherOverlay'); return; }
  const emp = _eObj(name); if (!emp) return;
  const pin = _ePin(emp);
  if (!pin) { _doSwitch(name); closeOverlay('userSwitcherOverlay'); return; }
  _openPinFor(pin, 'PIN de ' + name.split(' ')[0], () => {
    _doSwitch(name); closeOverlay('userSwitcherOverlay');
  });
}

function _doSwitch(userName) {
  S.activeUser = userName;
  lsSet('dpanel', JSON.stringify(S));
  _updateUserBtn();
  _enforcePermisos();
  toast('👤 Sesión: ' + (userName || 'Jefe / Admin'));
}

/* ── EMPLOYEE FORM ───────────────────────────────────────────────── */
let _empEditIdx = -1;

function addEmployee() {
  const name = ($('newEmpName')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre del empleado'); return; }
  if (S.employees.find(e => _eName(e) === name)) { toast('Ya existe ese empleado'); return; }
  S.employees.push({ name, pin: '', dni: '', phone: '', permisos: ['verPedidos','tareas'] });
  $('newEmpName').value = '';
  save(); renderEmpList(); renderEmpAvatars();
  toast(`✅ Empleado "${name}" agregado`);
}

function renderEmpList() {
  const el = $('empList'); if (!el) return;
  if (!S.employees.length) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text2);font-size:13px">Sin empleados aún</div>`;
    return;
  }
  el.innerHTML = S.employees.map((e, i) => {
    const nm   = _eName(e);
    const pin  = _ePin(e);
    const perms = _ePerms(e).length;
    const col  = _EMP_COLORS[i % _EMP_COLORS.length];
    return `<div class="cfl-item">
      <div style="width:30px;height:30px;border-radius:50%;background:${col};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${nm.charAt(0).toUpperCase()}</div>
      <span class="cfl-name">${nm}</span>
      <div style="display:flex;gap:3px;flex-shrink:0">
        <span style="font-size:9px;padding:2px 5px;border-radius:4px;border:1px solid ${pin?'rgba(56,139,253,.4)':'var(--bd)'};color:${pin?'var(--blue)':'var(--text2)'};">${pin?'🔐 PIN':'Sin PIN'}</span>
        <span style="font-size:9px;padding:2px 5px;border-radius:4px;border:1px solid var(--bd);color:var(--text2);">${perms}p</span>
      </div>
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-edit" onclick="openEmpEdit(${i})">✏️</button>
        <button class="cfl-btn cfl-btn-del" onclick="deleteEmployee(${i})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openEmpEdit(i) {
  _empEditIdx = i;
  const e = S.employees[i]; if (!e) return;
  const nm = _eName(e); const pin = _ePin(e); const perms = _ePerms(e);
  $('empEditName').value  = nm;
  $('empEditDni').value   = _eDni(e);
  $('empEditPhone').value = _ePhone(e);
  $('empEditPin').value   = pin;
  $('empEditPermisos').innerHTML = PERMISOS_DEF.map(p =>
    `<div class="perm-row" onclick="document.getElementById('perm_${p.key}').classList.toggle('on')">
      <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)">${p.label}</div><div style="font-size:11px;color:var(--text2)">${p.desc}</div></div>
      <div class="tgl ${perms.includes(p.key)?'on':''}" id="perm_${p.key}"></div>
    </div>`
  ).join('');
  openOverlay('empEditOverlay');
}

function saveEmpEdit() {
  const name  = ($('empEditName') ||{value:''}).value.trim();
  const dni   = ($('empEditDni')  ||{value:''}).value.trim();
  const phone = ($('empEditPhone')||{value:''}).value.trim().replace(/\s/g,'');
  const pin   = ($('empEditPin')  ||{value:''}).value.trim().replace(/\D/g,'').slice(0,4);
  if (!name) { toast('⚠️ Escribe el nombre'); return; }
  const perms = PERMISOS_DEF.filter(p => { const el=$('perm_'+p.key); return el && el.classList.contains('on'); }).map(p => p.key);
  if (_empEditIdx >= 0 && _empEditIdx < S.employees.length) {
    const oldName = _eName(S.employees[_empEditIdx]);
    if (oldName !== name) {
      S.tasks.forEach(t => { if (t.assignedTo === oldName) t.assignedTo = name; });
      if (S.activeUser === oldName) S.activeUser = name;
    }
    S.employees[_empEditIdx] = { name, pin, dni, phone, permisos: perms };
  }
  save(); renderEmpList(); renderEmpAvatars(); _updateUserBtn();
  closeOverlay('empEditOverlay');
  toast('✅ Empleado actualizado');
}

function deleteEmployee(i) {
  const name = _eName(S.employees[i]);
  if (!confirm(`¿Eliminar a "${name}"? Sus tareas quedarán sin asignar.`)) return;
  S.tasks.forEach(t => { if (t.assignedTo === name) t.assignedTo = ''; });
  if (S.activeUser === name) { S.activeUser = null; _updateUserBtn(); }
  S.employees.splice(i, 1);
  if (_taskEmpFilter === name) _taskEmpFilter = '';
  save(); renderEmpList(); renderEmpAvatars(); renderTasks();
}

/* ── PIN ─────────────────────────────────────────────────────────── */
let _pinEntry = '', _pinCallback = null, _pinExpected = '';

function openPin(cb) {
  _openPinFor(S.statusPin || '', 'Ingresa la clave para continuar', cb);
}

function _openPinFor(expected, msg, cb) {
  _pinEntry = ''; _pinExpected = expected; _pinCallback = cb;
  updatePinDots();
  $('pinMsg').textContent = msg;
  $('pinMsg').style.color = 'var(--text2)';
  openOverlay('pinOverlay');
}

function pinTap(d) {
  if (_pinEntry.length >= 4) return;
  _pinEntry += d;
  updatePinDots();
  if (_pinEntry.length === 4) setTimeout(checkPin, 150);
}

function pinDel() {
  _pinEntry = _pinEntry.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = $('pd' + i); if (!dot) continue;
    dot.classList.toggle('filled', i < _pinEntry.length);
    dot.classList.remove('error');
  }
}

function checkPin() {
  const ok = _pinExpected === null || _pinEntry === _pinExpected;
  if (ok) {
    closeOverlay('pinOverlay');
    if (_pinCallback) { _pinCallback(); _pinCallback = null; }
  } else {
    $('pinMsg').textContent = '❌ Clave incorrecta';
    $('pinMsg').style.color = 'var(--red)';
    for (let i = 0; i < 4; i++) { const d = $('pd' + i); if (d) d.classList.add('error'); }
    setTimeout(() => {
      _pinEntry = ''; updatePinDots();
      $('pinMsg').textContent = 'Ingresa la clave'; $('pinMsg').style.color = 'var(--text2)';
    }, 700);
  }
}

function changePIN() {
  _openPinFor(S.statusPin || '', 'Ingresa la clave actual', () => {
    _pinEntry = ''; _pinExpected = null; updatePinDots();
    $('pinMsg').textContent = 'Ingresa la NUEVA clave (4 dígitos)';
    $('pinMsg').style.color = 'var(--blue)';
    openOverlay('pinOverlay');
    _pinCallback = () => { S.statusPin = _pinEntry; save(); toast('🔐 Clave actualizada: ' + _pinEntry); };
  });
}


