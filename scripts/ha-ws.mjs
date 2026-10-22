// Send Home Assistant WebSocket API commands and print the results as JSON.
// Needed for things REST can't do: Lovelace resources and dashboard config.
//
// usage: node scripts/ha-ws.mjs '<message json without id>' [...more]
// e.g.   node scripts/ha-ws.mjs '{"type":"lovelace/resources"}'
//
// HA_URL and HA_TOKEN come from the environment or the project's .env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const env = { ...process.env };
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, i).trim();
    env[key] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
if (!env.HA_URL || !env.HA_TOKEN) {
  console.error(`Missing HA_URL and/or HA_TOKEN (environment or ${envFile})`);
  process.exit(1);
}

const msgs = process.argv.slice(2).map((s) => JSON.parse(s));
if (!msgs.length) {
  console.error("usage: node scripts/ha-ws.mjs '{\"type\":\"lovelace/resources\"}' [...]");
  process.exit(1);
}

const ws = new WebSocket(env.HA_URL.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/websocket');
const results = [];
let id = 0;

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: env.HA_TOKEN }));
  else if (m.type === 'auth_invalid') {
    console.error('auth invalid: check HA_TOKEN');
    process.exit(1);
  } else if (m.type === 'auth_ok') next();
  else if (m.type === 'result') {
    results.push(m);
    next();
  }
};
ws.onerror = (e) => {
  console.error('websocket error:', e.message ?? e);
  process.exit(1);
};

// commands run one at a time, in the order given
function next() {
  if (id >= msgs.length) {
    console.log(JSON.stringify(results, null, 1));
    ws.close();
    return;
  }
  ws.send(JSON.stringify({ id: ++id, ...msgs[id - 1] }));
}
