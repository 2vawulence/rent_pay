/**
 * RENT PAY — Serveur Local & Récepteur de Webhooks Jèko (Ahyi Rent)
 * Démarrage : node server.js
 * Application : http://localhost:3000
 * Endpoint Webhook Jèko : POST /webhooks/jeko
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_LOG_FILE = path.join(ROOT_DIR, 'jeko-webhooks.json');

// Chargement optionnel du fichier .env s'il existe
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const JEKO_WEBHOOK_SECRET = process.env.JEKO_WEBHOOK_SECRET || '';
const ALLOWED_FILES = new Map([
  ['/',             { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html',   { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/style.css',    { file: 'style.css',  type: 'text/css; charset=utf-8' }],
  ['/app.js',       { file: 'app.js',     type: 'application/javascript; charset=utf-8' }],
  ['/DESIGN.md',    { file: 'DESIGN.md',  type: 'text/markdown; charset=utf-8' }],
  ['/README.md',    { file: 'README.md',  type: 'text/markdown; charset=utf-8' }],
]);

function loadWebhookEvents() {
  try {
    if (fs.existsSync(WEBHOOK_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(WEBHOOK_LOG_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveWebhookEvents(events) {
  try {
    fs.writeFileSync(WEBHOOK_LOG_FILE, JSON.stringify(events.slice(0, 100), null, 2), 'utf8');
  } catch (_) {}
}

function verifyJekoSignature(rawBodyBuffer, signatureHeader, secret) {
  if (!secret) return { verified: false, mode: 'no-secret-configured' };
  if (!signatureHeader) return { verified: false, mode: 'missing-header' };
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBodyBuffer)
    .digest('hex');
  const cleanSig = String(signatureHeader).trim().replace(/^sha256=/i, '');
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(cleanSig, 'utf8');
  if (a.length !== b.length) return { verified: false, mode: 'mismatch' };
  const match = crypto.timingSafeEqual(a, b);
  return { verified: match, mode: match ? 'hmac-sha256-verified' : 'mismatch' };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Vérification / Réception Webhook Jèko (/webhooks/jeko)
  if (pathname === '/webhooks/jeko') {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        merchant: 'Ahyi Rent',
        endpoint: '/webhooks/jeko',
        paymentLink: 'https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b',
        hmacConfigured: Boolean(JEKO_WEBHOOK_SECRET)
      });
    }

    if (req.method === 'POST') {
      const chunks = [];
      let totalBytes = 0;
      const MAX_BYTES = 64 * 1024;

      req.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BYTES) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        const rawBody = Buffer.concat(chunks);
        const sigHeader = req.headers['jeko-signature'] || '';
        const eventHeader = req.headers['jeko-event'] || 'JEKO_WEBHOOK';
        const sigCheck = verifyJekoSignature(rawBody, sigHeader, JEKO_WEBHOOK_SECRET);

        if (JEKO_WEBHOOK_SECRET && !sigCheck.verified) {
          return sendJson(res, 401, { error: 'Invalid Jeko-Signature' });
        }

        let parsed = {};
        try {
          parsed = JSON.parse(rawBody.toString('utf8') || '{}');
        } catch (_) {
          parsed = { raw: rawBody.toString('utf8') };
        }

        const events = loadWebhookEvents();
        const entry = {
          id: 'WH-' + Date.now(),
          receivedAt: new Date().toISOString(),
          event: eventHeader,
          signatureVerification: sigCheck.mode,
          status: parsed.status || parsed?.data?.status || 'received',
          payload: parsed
        };
        events.unshift(entry);
        saveWebhookEvents(events);

        console.log(`[Jèko Webhook] Événement reçu : ${eventHeader} (${sigCheck.mode})`);
        return sendJson(res, 200, { received: true, id: entry.id });
      });
      return;
    }

    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  // 2. Consultation des Webhooks reçus par l'interface Rent Pay
  if (pathname === '/api/jeko/webhooks' && req.method === 'GET') {
    return sendJson(res, 200, {
      merchant: 'Ahyi Rent',
      hmacConfigured: Boolean(JEKO_WEBHOOK_SECRET),
      events: loadWebhookEvents()
    });
  }

  // 3. Fichiers statiques de l'application Rent Pay
  if (req.method === 'GET' && ALLOWED_FILES.has(pathname)) {
    const entry = ALLOWED_FILES.get(pathname);
    const fullPath = path.join(ROOT_DIR, entry.file);
    try {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, {
        'Content-Type': entry.type,
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(content);
    } catch (_) {
      sendJson(res, 404, { error: 'File not found' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`  RENT PAY (Ahyi Rent) — Serveur actif sur http://localhost:${PORT}`);
  console.log(`  Lien Jèko : https://pay.jeko.africa/pl/7932bfdd-fef8-4626-89f1-2939dff6160b`);
  console.log(`  Endpoint Webhook Jèko : http://localhost:${PORT}/webhooks/jeko`);
  console.log(`============================================================`);
});
