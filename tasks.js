// tasks.js — Tareas, empleados, permisos, PIN y selector de usuario
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
  const linkedShip  = t.linkedShipmentId ? (S.shipments||[]).find(x => x.id === t.linkedShipmentId) : null;

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
    ${linkedShip ? `<div style="margin:8px 0 4px 36px;background:var(--bg3);border:1px solid var(--bd);border-radius:9px;padding:8px 11px;display:flex;align-items:center;gap:9px">
      <span style="font-size:14px">📦</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${linkedShip.name||'Sin nombre'}</div>
        ${(linkedShip.phone||linkedShip.address||linkedShip.district)?`<div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[linkedShip.phone,linkedShip.address||linkedShip.district].filter(Boolean).join(' · ')}</div>`:''}
      </div>
      ${linkedShip.phone?`<a href="https://wa.me/51${(linkedShip.phone||'').replace(/\D/g,'')}" target="_blank" style="font-size:17px;text-decoration:none;-webkit-tap-highlight-color:transparent" onclick="event.stopPropagation()">💬</a>`:''}
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
let _tfLinkedId = '';

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

function _setTaskDateHoy() {
  _tfDate = new Date().toISOString().slice(0, 10);
  const inp = $('tDue'); if (inp) inp.value = _tfDate;
  _refreshDateBtn();
}

function _refreshDateBtn() {
  const inp = $('tDue'); if (inp && inp.value) _tfDate = inp.value;
  const today = new Date().toISOString().slice(0, 10);
  const btn = $('tDateHoyBtn'); if (!btn) return;
  const isToday = _tfDate === today;
  btn.style.borderColor = isToday ? 'var(--blue)' : 'var(--bd)';
  btn.style.background  = isToday ? 'rgba(79,142,247,.12)' : 'var(--bg3)';
  btn.style.color       = isToday ? 'var(--blue)' : 'var(--text2)';
}

function _setTaskFormDate(d) { _tfDate = d; }

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
  const inp = $('tDue');
  if (inp) inp.value = _tfDate || '';
  _refreshDateBtn();
}

/* ── Linked-shipment helpers ──────────────────────────────────── */
function _refreshLinkedShipArea() {
  const area = $('tLinkedShipArea'); if (!area) return;
  const s = _tfLinkedId ? (S.shipments||[]).find(x => x.id === _tfLinkedId) : null;
  if (s) {
    const info = [s.phone, s.address||s.district].filter(Boolean).join(' · ');
    area.innerHTML =
      `<div onclick="openTaskShipPicker()" style="background:var(--bg3);border:1px solid var(--blue);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;-webkit-tap-highlight-color:transparent">
        <span style="font-size:17px">📦</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name||'Sin nombre'}</div>
          ${info ? `<div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${info}</div>` : ''}
        </div>
        <span style="font-size:12px;color:var(--text2)">✏️</span>
      </div>`;
  } else {
    area.innerHTML =
      `<button onclick="openTaskShipPicker()" style="width:100%;padding:11px 12px;border-radius:10px;border:2px dashed var(--bd);background:var(--bg2);color:var(--text2);font-size:13px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;text-align:left;display:flex;align-items:center;gap:8px">
        <span>📦</span><span>Sin envío vinculado</span><span style="margin-left:auto;opacity:.4">+</span>
      </button>`;
  }
}

function openTaskShipPicker() {
  const inp = $('taskShipSearch'); if (inp) inp.value = '';
  renderTaskShipList();
  openOverlay('taskShipPickerOverlay');
  setTimeout(() => { const el = $('taskShipSearch'); if (el) el.focus(); }, 120);
}

function renderTaskShipList() {
  const el = $('taskShipList'); if (!el) return;
  const q = (($('taskShipSearch')||{value:''}).value||'').toLowerCase().trim();
  const list = (S.shipments||[]).filter(s => {
    if (!q) return true;
    return (s.name||'').toLowerCase().includes(q) || (s.phone||'').includes(q);
  }).slice(0, 50);
  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text2);font-size:13px">Sin resultados</div>`;
    return;
  }
  el.innerHTML = list.map(s => {
    const sel  = s.id === _tfLinkedId;
    const info = [s.phone, s.address||s.district].filter(Boolean).join(' · ');
    return `<div onclick="selectTaskShip('${s.id}')" style="padding:10px 12px;border-radius:10px;margin-bottom:4px;background:${sel?'rgba(79,142,247,.12)':'var(--bg2)'};border:1px solid ${sel?'var(--blue)':'var(--bd)'};display:flex;align-items:center;gap:10px;cursor:pointer;-webkit-tap-highlight-color:transparent">
      <span style="font-size:15px">📦</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name||'Sin nombre'}</div>
        ${info ? `<div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${info}</div>` : ''}
      </div>
      ${sel ? `<span style="color:var(--blue);font-size:15px">✓</span>` : ''}
    </div>`;
  }).join('');
}

function selectTaskShip(id) {
  _tfLinkedId = id;
  closeOverlay('taskShipPickerOverlay');
  _refreshLinkedShipArea();
}

function openTaskForm(id) {
  _editTaskId = id;
  const titleEl = $('taskFormTitle');
  if (titleEl) titleEl.textContent = id ? '✏️ Editar tarea' : '📋 Nueva tarea';
  if (id) {
    const t = S.tasks.find(x => x.id === id);
    if (!t) return;
    $('tTitle').value = t.title;
    _tfEmp      = t.assignedTo      || '';
    _tfDate     = t.dueDate         || '';
    _tfPri      = t.priority        || 'normal';
    _tfLinkedId = t.linkedShipmentId || '';
  } else {
    $('tTitle').value = '';
    _tfEmp      = _taskEmpFilter || '';
    _tfDate     = '';
    _tfPri      = 'normal';
    _tfLinkedId = '';
  }
  _renderEmpChips();
  _renderDateChips();
  _setTaskFormPri(_tfPri);
  _refreshLinkedShipArea();
  openOverlay('taskFormOverlay');
  setTimeout(() => { const el = $('tTitle'); if (el) el.focus(); }, 120);
}

function saveTask() {
  const title = ($('tTitle')||{value:''}).value.trim();
  if (!title) { toast('⚠️ Escribe qué hay que hacer'); return; }
  const duEl = $('tDue'); if (duEl && duEl.value) _tfDate = duEl.value;
  const desc = '';
  if (_editTaskId) {
    const t = S.tasks.find(x => x.id === _editTaskId);
    if (t) {
      t.title = title; t.description = desc;
      t.assignedTo = _tfEmp; t.dueDate = _tfDate; t.priority = _tfPri;
      t.linkedShipmentId = _tfLinkedId || '';
    }
    toast('✅ Tarea actualizada');
  } else {
    S.tasks.push({
      id: 'task_' + Date.now(), title, description: desc,
      assignedTo: _tfEmp, dueDate: _tfDate, priority: _tfPri,
      linkedShipmentId: _tfLinkedId || '',
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

