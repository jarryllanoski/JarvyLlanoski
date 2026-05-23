// suppliers.js — Gestión de proveedores
/* ── SUPPLIERS ── */

/* Global code paste: auto-marca coincidencias en TODOS los proveedores */
function globalSuppSearch(code){
  const c = (code||'').trim().toUpperCase();
  if (!c) return;
  const el = $('globalSuppResult');
  let matched = 0, matchedIn = [];
  S.suppliers.forEach(sup => {
    (sup.items||[]).forEach(item => {
      const name = (item.name||item.text||'').toUpperCase();
      if (name.includes(c) || (c.length >= 3 && name.replace(/\s.*/,'').startsWith(c.substring(0,c.length)))) {
        item.checked = true; matched++;
        if (!matchedIn.includes(sup.name)) matchedIn.push(sup.name);
      }
    });
  });
  if (matched > 0) {
    save(); renderStatsAsSuppliers();
    if (el) { el.style.display='block'; el.innerHTML=`✅ <b>${matched}</b> ítem(s) marcado(s) en: <b>${matchedIn.join(', ')}</b>`; }
  } else {
    if (el) { el.style.display='block'; el.innerHTML=`❌ Código <b>${c}</b> no encontrado en ningún proveedor`; }
  }
}

/* Per-supplier code paste: auto-marca en el proveedor abierto */
function matchSuppCode(code){
  const i = S._suppIdx;
  if (i==null||!S.suppliers[i]) return;
  const c = (code||'').trim().toUpperCase();
  if (!c) return;
  let matched = 0;
  (S.suppliers[i].items||[]).forEach(item => {
    const name = (item.name||item.text||'').toUpperCase();
    if (name.includes(c) || (c.length >= 3 && name.replace(/\s.*/,'').startsWith(c.substring(0,c.length)))) {
      item.checked = true; matched++;
    }
  });
  if (matched > 0) { save(); renderSuppItems(); renderSuppPhone(i); toast(`✅ ${matched} ítem(s) marcado(s) en stock`); }
  else toast(`❌ Código no encontrado en este proveedor`);
}

/* Desmarcar todos los ítems del proveedor activo */
function clearCheckedSupp(){
  const i = S._suppIdx;
  if (i==null||!S.suppliers[i]) return;
  (S.suppliers[i].items||[]).forEach(item => item.checked = false);
  save(); renderSuppItems();
}

function openSupplier(i){
  if (!S.suppliers[i]) return;
  S._suppIdx = i;
  const sup = S.suppliers[i];
  $('suppName').textContent = sup.name;
  renderSuppPhone(i);
  renderSuppItems();
  renderCotizArea(i);
  openOverlay('suppOverlay');
}

function renderSuppPhone(i){
  const sup = S.suppliers[i];
  const el = $('suppPhone');
  if (!el) return;
  if (!sup || !sup.phone) { el.innerHTML = ''; return; }
  const phone = sup.phone.replace(/\D/g,'');
  el.innerHTML = `
    <span style="color:var(--blue);font-size:14px;font-weight:600">📞 ${sup.phone}</span>
    <a href="https://wa.me/51${phone}" target="_blank"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.3);border-radius:8px;color:var(--green);font-weight:700;font-size:12px;text-decoration:none">
      💬 WhatsApp
    </a>`;
}

/* Abre el overlay de edición pre-rellenado */
function openEditSupplierOverlay(){
  const i = S._suppIdx;
  if (i==null||!S.suppliers[i]) return;
  const sup = S.suppliers[i];
  const nameEl = $('suppEditName'), phoneEl = $('suppEditPhone');
  if (nameEl) nameEl.value = sup.name;
  if (phoneEl) phoneEl.value = (sup.phone||'').replace(/\D/g,'').slice(-9);
  openOverlay('suppEditOverlay');
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
  if (!items.length) {
    el.innerHTML = `<div onclick="const i=$('suppNewItem');if(i){i.focus();i.scrollIntoView({behavior:'smooth',block:'center'})}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:120px;cursor:pointer;border:2px dashed var(--bd);border-radius:12px;padding:20px;margin:4px 0;-webkit-tap-highlight-color:transparent;transition:border-color .2s" onmouseenter="this.style.borderColor='var(--blue)'" onmouseleave="this.style.borderColor='var(--bd)'">
      <div style="font-size:28px">📋</div>
      <div style="font-size:13px;font-weight:600;color:var(--text2)">Lista vacía</div>
      <div style="font-size:11px;color:var(--text2);opacity:.7">Toca aquí para agregar tu primer ítem</div>
      <div style="font-size:11px;font-weight:700;color:var(--blue);background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.3);padding:6px 16px;border-radius:20px">＋ Agregar ítem</div>
    </div>`;
    return;
  }
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
  const name = ($('suppNewItem')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre del ítem'); return; }
  if (!S.suppliers[i].items) S.suppliers[i].items = [];
  S.suppliers[i].items.push({name, qty:'', checked:false, verified:false});
  $('suppNewItem').value = '';
  save(); renderSuppItems();
}
function toggleSuppItem(idx, val){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const item = S.suppliers[i].items[idx];
  if (item) { item.checked = val; if (val) item.verified = true; }
  save(); renderStatsAsSuppliers();
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
function sendSuppList(idx){
  const i = (idx != null && S.suppliers[idx] !== undefined) ? idx : S._suppIdx;
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
  const name = ($('suppNewName')||{value:''}).value.trim();
  const phone = ($('suppNewPhone')||{value:''}).value.trim();
  if (!name) { toast('Escribe el nombre del proveedor'); return; }
  if (!S.suppliers) S.suppliers = [];
  S.suppliers.push({name, phone, items:[]});
  $('suppNewName').value = ''; if ($('suppNewPhone')) $('suppNewPhone').value = '';
  save(); renderSuppList();
  closeOverlay('suppNewOverlay');
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
  const nameEl = $('suppEditName'); const phoneEl = $('suppEditPhone');
  if (!nameEl) return;
  const name = nameEl.value.trim();
  if (!name) { toast('Escribe el nombre'); return; }
  S.suppliers[i].name = name;
  if (phoneEl) S.suppliers[i].phone = phoneEl.value.trim();
  if ($('suppName')) $('suppName').textContent = name;
  renderSuppPhone(i);
  save(); renderStatsAsSuppliers();
  closeOverlay('suppEditOverlay');
  toast('✅ Proveedor actualizado');
}

function openSuppDeleteConfirm(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const sup = S.suppliers[i];
  const count = (sup.items||[]).length;
  const msg = $('suppDelConfirmMsg');
  if (msg) msg.innerHTML = `Vas a eliminar <strong>"${sup.name}"</strong>${count > 0 ? ` y sus <strong>${count} ítem${count>1?'s':''}</strong>` : ''}.<br>Esta acción <strong>no se puede deshacer</strong>.`;
  openOverlay('suppDelConfirmOverlay');
}

function doDeleteSupplier(){
  const i = S._suppIdx;
  if (i == null || !S.suppliers[i]) return;
  const name = S.suppliers[i].name;
  S.suppliers.splice(i, 1);
  S._suppIdx = null;
  save();
  closeOverlay('suppDelConfirmOverlay');
  closeOverlay('suppEditOverlay');
  closeOverlay('suppOverlay');
  renderStatsAsSuppliers();
  toast(`🗑 "${name}" eliminado`);
}

