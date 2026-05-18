// config.js — Constantes globales y helpers DOM

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const $ = id => document.getElementById(id);

const FIXED_LABELS = ['Nuevo pedido','Faltante / pedir proveedor','Por alistar','Alistado','Enviado','Llegó a destino','Pendiente de pago','Finalizado'];

const FIXED_LABEL_ICONS = {'Nuevo pedido':'🆕','Faltante / pedir proveedor':'⚠️','Por alistar':'📦','Alistado':'✅','Enviado':'🚚','Llegó a destino':'📍','Pendiente de pago':'💰','Finalizado':'🏁'};

const STATUS_MIGRATE = {'NUEVO PEDIDO':'Nuevo pedido','EN PROCESO':'Faltante / pedir proveedor','POR ALISTAR':'Por alistar','ENVIADO':'Enviado','FINALIZADO':'Finalizado','ENTREGADO':'Finalizado','PENDIENTE':'Nuevo pedido'};

const FIXED_COURIERS = ['SHALOM','OLVA COURIER','MARVISUR','DINSIDES','DELIVERY','RETIRO EN TIENDA','ENCOMIENDA'];

const PERMISOS_DEF = [
  { key:'envios',    label:'🚚 Envíos',    desc:'Ver y gestionar envíos' },
  { key:'tareas',    label:'📋 Tareas',    desc:'Ver y gestionar tareas' },
  { key:'compartir', label:'🔗 Compartir', desc:'Generar links de clientes' },
  { key:'config',    label:'⚙️ Config',    desc:'Cambiar ajustes del negocio' },
];
