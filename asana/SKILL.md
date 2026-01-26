---
name: asana
description: "Integrate Asana with Clawdbot via the Asana REST API. Use when you need to list/search/create/update Asana tasks/projects/workspaces, or to set up Asana OAuth (authorization code grant) for a personal local-only integration (OOB/manual code paste)."
---

# Asana (Clawdbot skill)

This skill is designed for a **personal local-only** Asana integration using **OAuth** with an **out-of-band/manual code paste** flow.

## What this skill provides
- A small Node CLI to:
  - generate the Asana authorize URL
  - exchange an authorization code for access/refresh tokens
  - auto-refresh the access token
  - make basic API calls (e.g. `/users/me`, `/workspaces`, tasks)

## Setup (OAuth, OOB/manual code)

### 0) Create an Asana app
In Asana Developer Console (My apps):
- Create app
- Enable scopes you will need (typical: `tasks:read`, `tasks:write`, `projects:read`)
- Set redirect URI to the OOB value (manual code):
  - `urn:ietf:wg:oauth:2.0:oob`

### 1) Export credentials
Set environment variables (shell/session):
- `ASANA_CLIENT_ID`
- `ASANA_CLIENT_SECRET`

### 2) Run OAuth
From the repo root:

1) Print the authorize URL:
```bash
node asana/scripts/oauth_oob.mjs authorize
```
2) Open the printed URL, click **Allow**, copy the code.
3) Exchange code and save tokens locally:
```bash
node asana/scripts/oauth_oob.mjs token --code "PASTE_CODE_HERE"
```

Tokens are stored at:
- `~/.clawdbot/asana/token.json`

## Using the API helper

Sanity check (who am I):
```bash
node asana/scripts/asana_api.mjs me
```

List workspaces:
```bash
node asana/scripts/asana_api.mjs workspaces
```

Create a task (minimal):
```bash
node asana/scripts/asana_api.mjs create-task --workspace <gid> --name "Test task" --notes "from clawdbot"
```

## Notes / gotchas
- OAuth access tokens expire; refresh tokens are used to obtain new access tokens.
- If you later want multi-user support, replace OOB with a real redirect/callback.
- Don’t log tokens.
