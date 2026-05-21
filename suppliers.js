// suppliers.js — Gestión de proveedores
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

