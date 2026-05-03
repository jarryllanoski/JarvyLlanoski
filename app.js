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
