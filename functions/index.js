const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const https = require('https');

const SHALOM_KEY = defineSecret('SHALOM_API_KEY');
const HOST = 'shalom-api.lat';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function cors(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.set(k, v));
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

function request(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST,
      path,
      method,
      headers: {'x-api-key': apiKey, 'Accept': 'application/json'}
    };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({status: res.statusCode, body: JSON.parse(data)}); }
        catch (e) { resolve({status: res.statusCode, body: data}); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ── GET /agenciasShalom — lista completa de agencias ── */
exports.agenciasShalom = onRequest(
  {secrets: [SHALOM_KEY], region: 'us-central1'},
  async (req, res) => {
    if (cors(req, res)) return;
    try {
      res.set('Cache-Control', 'public, max-age=3600');
      const {status, body} = await request('GET', '/api/agencia-minimal', null, SHALOM_KEY.value());
      res.status(status).json(body);
    } catch (e) {
      res.status(500).json({error: e.message});
    }
  }
);

/* ── GET /buscarAgenciaShalom?q=texto — búsqueda server-side ── */
exports.buscarAgenciaShalom = onRequest(
  {secrets: [SHALOM_KEY], region: 'us-central1'},
  async (req, res) => {
    if (cors(req, res)) return;
    const q = (req.query.q || '').trim();
    if (!q) { res.json([]); return; }
    try {
      const {status, body} = await request('GET', `/api/buscar?q=${encodeURIComponent(q)}`, null, SHALOM_KEY.value());
      res.status(status).json(body);
    } catch (e) {
      res.status(500).json({error: e.message});
    }
  }
);

/* ── POST /trackingShalom — tracking por número de guía + código ── */
exports.trackingShalom = onRequest(
  {secrets: [SHALOM_KEY], region: 'us-central1'},
  async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({error: 'Solo POST'}); return; }
    const {orderNumber, orderCode} = req.body || {};
    if (!orderNumber || !orderCode) {
      res.status(400).json({error: 'Faltan orderNumber y orderCode'}); return;
    }
    try {
      const {status, body} = await request('POST', '/api/track', {orderNumber, orderCode}, SHALOM_KEY.value());
      res.status(status).json(body);
    } catch (e) {
      res.status(500).json({error: e.message});
    }
  }
);
