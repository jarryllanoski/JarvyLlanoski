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
