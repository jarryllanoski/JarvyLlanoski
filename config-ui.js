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

