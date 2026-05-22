// config.js — Constantes globales y helpers DOM

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const $ = id => document.getElementById(id);

const FIXED_LABELS = ['Nuevo pedido','En proceso','Por alistar','Alistado','Enviado','Llegó a destino','Pendiente de pago','Finalizado'];

const FIXED_LABEL_ICONS = {'Nuevo pedido':'🆕','En proceso':'⚠️','Por alistar':'📦','Alistado':'✅','Enviado':'🚚','Llegó a destino':'📍','Pendiente de pago':'💰','Finalizado':'🏁'};

const STATUS_MIGRATE = {'NUEVO PEDIDO':'Nuevo pedido','EN PROCESO':'En proceso','POR ALISTAR':'Por alistar','ENVIADO':'Enviado','FINALIZADO':'Finalizado','ENTREGADO':'Finalizado','PENDIENTE':'Nuevo pedido','Faltante / pedir proveedor':'En proceso'};

const FIXED_COURIERS = ['SHALOM','OLVA COURIER','MARVISUR','DELIVERY','RETIRO EN TIENDA','ENCOMIENDA'];

const PERMISOS_DEF = [
  { key:'verPedidos',     label:'👁️ Ver pedidos de clientes',  desc:'Ver tarjetas y detalles' },
  { key:'verPrecios',     label:'💰 Ver precios y costos',      desc:'Costos de envío y valores' },
  { key:'editarEstado',   label:'🏷️ Cambiar estado de pedidos', desc:'Mover entre etiquetas' },
  { key:'verProveedores', label:'📚 Ver proveedores',           desc:'Lista y pendientes de proveedores' },
  { key:'tareas',         label:'📋 Ver y gestionar tareas',    desc:'Ver la pizarra de tareas' },
  { key:'config',         label:'⚙️ Ver configuración',         desc:'Cambiar ajustes del negocio' },
];
