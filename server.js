const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_KEY = process.env.CHATTERMATE_API_KEY || '';

if (!API_KEY) {
  console.log('Create a .env file with CHATTERMATE_API_KEY=...');
}

const SYSTEM_PROMPT = "You are a hospital report assistant. Answer only from the report data given. Never invent numbers. If the data doesn't have the answer, say so. Money is in Taka (Tk). Keep answers short. You cannot change any data; refuse requests to edit or delete. The report data contains ready-made, already calculated numbers: use them exactly and never recalculate or estimate. 'This week' means the last 7 days including today. Put key numbers in **bold**. If the question needs something that is not in the data, say you don't know. If the user asks to add, change or delete anything, reply that you can only answer questions about reports. Discounts are money the hospital chose not to collect: they are never part of money collected and have already been taken off the dues. Doctors whose status is 'On Leave' or 'Left' cannot take new visits. Money collected is the NET amount: refunds are already subtracted (totalRefunded says how much was paid back). Cancelled lab orders are not counted in any total (cancelledCount says how many were cancelled). If earlier messages of the chat are given, use them only to understand a follow-up question such as 'and yesterday?'; every number must still come from the report data, never from an earlier answer. Periods in the data: today, yesterday, last7Days (also 'this week'), thisMonth (the month so far) and lastMonth (the previous calendar month; exact dates are in 'periods'). For one specific date use collectionByDay (the last 62 days: money collected, visits, new patients and lab orders placed on that day); if the date is older than that, or in the future, say you don't know. 'labCatalog' is the lab price list: priceToday is what a patient pays today. 'recentVisits' lists the visits of the last 7 days with patient and doctor names. 'patientSummaries' has one line per patient (visits, labOrders, charges, discount, paid, due, credit); paid is net of refunds. 'discounts.recent' lists billing discounts with who approved them and why.";

const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 1200;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

let cachedDefaultModelId = null;

async function getDefaultModelId(key) {
  if (cachedDefaultModelId) {
    return cachedDefaultModelId;
  }

  const response = await fetch('https://chattermate.ai/api/chat/models', {
    method: 'GET',
    headers: {
      'X-API-Key': key
    },
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const err = new Error('Models request failed with status ' + response.status);
    err.status = response.status;
    err.body = errorBody;
    throw err;
  }

  const json = await response.json();
  let modelId = json.default_model_id;
  if (!modelId && Array.isArray(json.models)) {
    const defaultModel = json.models.find(m => m.is_default);
    modelId = defaultModel ? defaultModel.id : (json.models[0] ? json.models[0].id : null);
  }

  if (!modelId) {
    throw new Error('No default model id available from ChatterMate');
  }

  cachedDefaultModelId = modelId;
  return cachedDefaultModelId;
}

function parseSSEStream(rawText) {
  const lines = rawText.split(/\r?\n/);
  let currentEvent = '';
  let fullAnswer = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      if (currentEvent === 'model_chunk') {
        const payloadStr = line.slice(5).trim();
        try {
          const parsed = JSON.parse(payloadStr);
          if (parsed && typeof parsed.content === 'string') {
            fullAnswer += parsed.content;
          }
        } catch {
          // Ignore invalid JSON chunks
        }
      }
    } else if (line.trim() === '') {
      currentEvent = '';
    }
  }

  return fullAnswer;
}

async function handleAskRoute(req, res) {
  if (!API_KEY) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Server API key is missing. Set CHATTERMATE_API_KEY in .env.' }));
    return;
  }

  let body = '';
  let byteLength = 0;
  const MAX_BYTES = 1024 * 1024; // 1 MB limit

  req.on('data', chunk => {
    byteLength += chunk.length;
    if (byteLength > MAX_BYTES) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Payload exceeds 1 MB limit.' }));
      req.destroy();
      return;
    }
    body += chunk;
  });

  req.on('end', async () => {
    if (byteLength > MAX_BYTES) return;

    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Invalid JSON request.' }));
      return;
    }

    const { question, data } = parsedBody || {};

    // Optional earlier turns of the chat (for follow-up questions). Anything odd is simply dropped.
    const history = Array.isArray(parsedBody && parsedBody.history)
      ? parsedBody.history
          .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
          .slice(-MAX_HISTORY_TURNS)
          .map(m => ({ role: m.role, content: m.content.trim().slice(0, MAX_HISTORY_CHARS) }))
      : [];

    if (typeof question !== 'string' || question.trim().length === 0 || question.length > 500) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Question must be a non-empty string of up to 500 characters.' }));
      return;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Data must be a valid JSON object.' }));
      return;
    }

    try {
      const modelId = await getDefaultModelId(API_KEY);

      const historyText = history.length
        ? ' Earlier in this chat: ' + history.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content).join(' | ') + '.'
        : '';
      const promptPayload = 'Report data: ' + JSON.stringify(data) + historyText + ' Question: ' + question.trim();

      const streamResponse = await fetch('https://chattermate.ai/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          models: [modelId],
          system_prompt: SYSTEM_PROMPT,
          prompt: promptPayload
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!streamResponse.ok) {
        const errorText = await streamResponse.text().catch(() => '');
        if (streamResponse.status === 401) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'The API key is wrong. Check your CHATTERMATE_API_KEY.' }));
          return;
        }
        if (streamResponse.status === 403 || errorText.toLowerCase().includes('credit')) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Access denied or insufficient credits. Please contact the program team.' }));
          return;
        }
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'AI provider error. Please try again later.' }));
        return;
      }

      const streamText = await streamResponse.text();
      const answer = parseSSEStream(streamText);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ answer: answer || 'No response generated from the model.' }));
    } catch (err) {
      if (err.status === 401) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'The API key is wrong. Check your CHATTERMATE_API_KEY.' }));
        return;
      }
      if (err.status === 403 || (err.body && err.body.toLowerCase().includes('credit'))) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Access denied or insufficient credits. Please contact the program team.' }));
        return;
      }
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unable to connect to the report assistant service.' }));
    }
  });
}

function serveStaticFile(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') {
    reqPath = '/index.html';
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(reqPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  let filePath;
  try {
    if (decodedPath.indexOf('\0') !== -1) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request');
      return;
    }
    const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
    filePath = path.join(__dirname, normalizedPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const relativePath = path.relative(__dirname, filePath);
  const segments = relativePath.split(path.sep);

  if (segments.some(seg => seg.startsWith('.')) || relativePath === 'server.js') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  try {
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
        }
      });
      stream.pipe(res);
    });
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

const server = http.createServer((req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/ask') {
      handleAskRoute(req, res);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStaticFile(req, res);
    } else {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('405 Method Not Allowed');
    }
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Internal server error.' }));
    }
  }
});

server.listen(PORT, () => {
  console.log('Server running at http://localhost:3000');
});