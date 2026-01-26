#!/usr/bin/env node
/**
 * Minimal Asana API CLI with OAuth refresh.
 *
 * Reads token from ~/.clawdbot/asana/token.json
 * Requires ASANA_CLIENT_ID + ASANA_CLIENT_SECRET for refresh.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API_BASE = 'https://app.asana.com/api/1.0';
const TOKEN_URL = 'https://app.asana.com/-/oauth_token';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function tokenPath() {
  return path.join(os.homedir(), '.clawdbot', 'asana', 'token.json');
}

function loadToken() {
  const p = tokenPath();
  if (!fs.existsSync(p)) die(`Token file not found: ${p}. Run oauth_oob.mjs token first.`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveToken(tok) {
  const p = tokenPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tok, null, 2));
}

function urlEncode(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, String(v));
  }
  return u.toString();
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: urlEncode(params),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function ensureAccessToken(token) {
  const now = Date.now();
  const expiresAt = token.expires_at_ms;
  if (typeof token.access_token !== 'string') die('Token missing access_token');

  // Refresh if expiring within 2 minutes
  if (expiresAt && now < expiresAt - 120_000) return token;

  if (!token.refresh_token) {
    // Some flows may not return refresh_token; in that case user must re-auth.
    return token;
  }

  const clientId = process.env.ASANA_CLIENT_ID;
  const clientSecret = process.env.ASANA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    die('Token needs refresh but ASANA_CLIENT_ID/ASANA_CLIENT_SECRET are not set.');
  }

  const data = await postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh_token,
  });

  const refreshed = {
    ...token,
    ...data,
    obtained_at_ms: now,
    expires_at_ms: typeof data.expires_in === 'number' ? now + data.expires_in * 1000 : null,
  };

  saveToken(refreshed);
  return refreshed;
}

async function asanaGet(pathname, token, query) {
  const url = new URL(API_BASE + pathname);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function asanaPost(pathname, token, body) {
  const url = API_BASE + pathname;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      flags[k] = v;
    } else {
      positionals.push(a);
    }
  }
  return { cmd, flags, positionals };
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (!cmd) die('Command required: me | workspaces | create-task');

  let tok = loadToken();
  tok = await ensureAccessToken(tok);
  const accessToken = tok.access_token;

  if (cmd === 'me') {
    const r = await asanaGet('/users/me', accessToken);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (cmd === 'workspaces') {
    const r = await asanaGet('/workspaces', accessToken);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (cmd === 'create-task') {
    const workspace = flags.workspace;
    const name = flags.name;
    const notes = flags.notes || '';
    const projects = flags.projects;
    if (!name) die('Missing --name');

    const data = { name, notes };
    if (workspace) data.workspace = String(workspace);
    if (projects) data.projects = String(projects).split(',').map((s) => s.trim()).filter(Boolean);

    const r = await asanaPost('/tasks', accessToken, { data });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  die(`Unknown command: ${cmd}`);
}

main().catch((e) => die(String(e?.stack || e)));
