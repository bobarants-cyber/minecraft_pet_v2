// Sending designs straight into your Canva account (Canva Connect API), so a presentation Bbokari makes opens in the
// Canva editor by itself — no downloading and dragging. Uses your own Canva "integration" keys; the sign-in happens on
// Canva's page and only a token is kept, encrypted, on this Mac.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeStorage, shell } from 'electron';

const API = 'https://api.canva.com/rest/v1';
export const CANVA_PORT = 4519;
export const CANVA_REDIRECT = `http://127.0.0.1:${CANVA_PORT}/canva`;
const SCOPES = 'design:content:write design:meta:read';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Canva {
  constructor({ dir }) {
    this.keysFile = path.join(dir, 'canva-keys.bin');
    this.tokenFile = path.join(dir, 'canva-token.bin');
    this.keys = this.#read(this.keysFile); // { id, secret }
    this.token = this.#read(this.tokenFile); // { access_token, refresh_token, expires_at }
  }

  get hasKeys() {
    return !!(this.keys?.id && this.keys?.secret);
  }

  get connected() {
    return this.hasKeys && !!this.token?.refresh_token;
  }

  #read(file) {
    try {
      const buf = fs.readFileSync(file);
      return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8'));
    } catch {
      return null;
    }
  }

  #write(file, value) {
    const text = JSON.stringify(value);
    fs.writeFileSync(file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text), { mode: 0o600 });
  }

  saveKeys(id, secret) {
    id = String(id ?? '').trim();
    secret = String(secret ?? '').trim();
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) throw new Error('That Client ID doesn’t look right. Copy it from your Canva integration page.');
    if (secret.length < 10) throw new Error('That Client secret looks too short. Press “Generate secret” on the Canva page and copy it.');
    this.keys = { id, secret };
    this.#write(this.keysFile, this.keys);
    this.disconnect();
  }

  /** Opens Canva's sign-in page and waits for you to press Allow. */
  async connect() {
    if (!this.hasKeys) throw new Error('Add your Canva keys first.');
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(12));
    const code = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, CANVA_REDIRECT);
        if (url.pathname !== '/canva') return res.writeHead(404).end();
        const ok = url.searchParams.get('state') === state && url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<body style="font:20px system-ui;text-align:center;padding:60px">${ok ? '🎨 Bbokari is connected to Canva! You can close this tab.' : '😢 That didn’t work. Close this tab and try again.'}</body>`);
        clearTimeout(timer);
        server.close();
        if (ok) resolve(url.searchParams.get('code'));
        else reject(new Error(url.searchParams.get('error_description') || url.searchParams.get('error') || 'Canva sign-in didn’t finish.'));
      });
      const timer = setTimeout(() => {
        server.close();
        reject(new Error('Canva sign-in timed out. Try again.'));
      }, 5 * 60_000);
      server.on('error', (err) => reject(err.code === 'EADDRINUSE' ? new Error(`Something else is using port ${CANVA_PORT}. Quit it and try again.`) : err));
      server.listen(CANVA_PORT, '127.0.0.1', () => {
        const auth = new URL('https://www.canva.com/api/oauth/authorize');
        auth.search = new URLSearchParams({
          code_challenge_method: 's256',
          response_type: 'code',
          client_id: this.keys.id,
          redirect_uri: CANVA_REDIRECT,
          scope: SCOPES,
          code_challenge: challenge,
          state,
        }).toString();
        shell.openExternal(auth.toString());
      });
    });
    await this.#tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CANVA_REDIRECT });
  }

  async #tokenRequest(params) {
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keys.id}:${this.keys.secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (params.grant_type === 'refresh_token') this.disconnect();
      throw new Error(params.grant_type === 'refresh_token' ? 'Your Canva sign-in expired. Use 🎨 Canva → Connect Canva again.' : data.error_description || data.error || data.message || `Canva said ${res.status}`);
    }
    // Canva gives a new refresh token every time; the old one stops working.
    this.token = { access_token: data.access_token, refresh_token: data.refresh_token ?? this.token?.refresh_token, expires_at: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 };
    this.#write(this.tokenFile, this.token);
  }

  async #access() {
    if (!this.connected) throw new Error('Canva isn’t connected.');
    if (Date.now() >= this.token.expires_at) await this.#tokenRequest({ grant_type: 'refresh_token', refresh_token: this.token.refresh_token });
    return this.token.access_token;
  }

  /** Turns a .pptx into a real, editable Canva design. Returns { id, editUrl }. */
  async importPresentation(file, title) {
    const res = await fetch(`${API}/imports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.#access()}`,
        'Content-Type': 'application/octet-stream',
        'Import-Metadata': JSON.stringify({ title_base64: Buffer.from(String(title).slice(0, 50)).toString('base64'), mime_type: PPTX }),
      },
      body: fs.readFileSync(file),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `Canva said ${res.status}`);
    const id = data.job?.id;
    for (let i = 0; i < 60 && id; i++) {
      await sleep(i < 5 ? 1500 : 3000);
      const r = await fetch(`${API}/imports/${id}`, { headers: { Authorization: `Bearer ${await this.#access()}` }, signal: AbortSignal.timeout(30_000) });
      const job = (await r.json().catch(() => ({}))).job ?? {};
      if (job.status === 'success') {
        const design = job.result?.designs?.[0];
        if (design?.urls?.edit_url) return { id: design.id, editUrl: design.urls.edit_url };
        break;
      }
      if (job.status === 'failed') throw new Error(job.error?.message || 'Canva couldn’t open the file');
    }
    throw new Error('Canva took too long to make the design');
  }

  disconnect() {
    this.token = null;
    try {
      fs.unlinkSync(this.tokenFile);
    } catch {}
  }
}
