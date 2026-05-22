// config-ui.js — Funciones de edición de configuración (etiquetas, couriers, campos extra)
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
let _editLabelIdx = null, _editLabelName = '';
function openLabelEdit(label, idx){
  _editLabelIdx = idx;
  _editLabelName = label;
  const msgs = S.msgTemplates[label] || ['',''];
  const isFixed = idx === null;
  const icon = FIXED_LABEL_ICONS[label] || '🏷️';
  $('labelEditContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
      <span style="font-size:22px">${icon}</span>
      <div>
        <div style="font-size:16px;font-weight:800;color:var(--text);font-family:'Syne',sans-serif">${label}</div>
        <div style="font-size:11px;color:var(--text2)">${isFixed ? 'Etiqueta fija — solo puedes editar sus mensajes' : 'Etiqueta personalizada'}</div>
      </div>
    </div>
    ${!isFixed ? `<div class="fg" style="margin-top:10px"><label class="fl">Nombre de la etiqueta</label><input class="fi" id="labelEditName" value="${label.replace(/"/g,'&quot;')}" maxlength="40"></div>` : ''}
    <div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.8px;margin:14px 0 10px">💬 MENSAJES PREDETERMINADOS</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:26px;height:26px;border-radius:8px;background:var(--blue);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">A</div>
      <span style="font-size:12px;font-weight:600;color:var(--text2)">Mensaje A</span>
    </div>
    <textarea id="labelMsg1" class="fi" rows="3" placeholder="Hola {nombre}, tu pedido está en camino 🚚..." style="resize:none;line-height:1.5;font-family:inherit">${msgs[0]||''}</textarea>
    <div style="display:flex;align-items:center;gap:8px;margin:12px 0 6px">
      <div style="width:26px;height:26px;border-radius:8px;background:var(--green);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">B</div>
      <span style="font-size:12px;font-weight:600;color:var(--text2)">Mensaje B</span>
    </div>
    <textarea id="labelMsg2" class="fi" rows="3" placeholder="Hola {nombre}, tu pedido fue entregado ✅..." style="resize:none;line-height:1.5;font-family:inherit">${msgs[1]||''}</textarea>
    <div style="background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:9px;padding:10px 12px;margin-top:12px;font-size:11px;color:var(--text2);line-height:1.7">
      <b style="color:var(--blue)">Variables disponibles:</b><br>
      {nombre} {telefono} {direccion} {courier} {fecha} {costo} {estado}
    </div>`;
  openOverlay('labelEditOverlay');
}
function saveLabelEdit(){
  let label = _editLabelName;
  if (_editLabelIdx !== null && $('labelEditName')) {
    const newName = $('labelEditName').value.trim();
    if (newName && newName !== label) {
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
  toast('✅ Mensajes guardados');
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

