// Signing in to your own Google account (Gmail, Google Chat, Classroom) with your own Google Cloud "key" file.
// The sign-in happens in your browser on Google's page; the app only ever gets a token, stored encrypted on this Mac.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeStorage, shell } from 'electron';

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.modify', // read, archive, move to Trash (never delete forever)
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.memberships.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
];

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class GoogleAuth {
  constructor({ dir }) {
    this.clientFile = path.join(dir, 'google-client.json');
    this.tokenFile = path.join(dir, 'google-token.bin');
    this.token = null; // { access_token, expires_at, refresh_token, email }
    this.#loadToken();
  }

  get hasClient() {
    return fs.existsSync(this.clientFile);
  }

  get connected() {
    return !!this.token?.refresh_token;
  }

  get email() {
    return this.token?.email ?? '';
  }

  #client() {
    const raw = JSON.parse(fs.readFileSync(this.clientFile, 'utf8'));
    const c = raw.installed ?? raw.web ?? raw;
    if (!c.client_id) throw new Error('That file isn’t a Google OAuth client file.');
    return c;
  }

  /** Copies the downloaded client_secret_….json into the app's folder (after checking it's the right kind). */
  importClient(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw.installed?.client_id) {
      throw new Error(raw.web ? 'That key is for a “Web application”. Make a new one and choose “Desktop app”.' : 'That doesn’t look like the Google key file (client_secret_….json).');
    }
    fs.writeFileSync(this.clientFile, JSON.stringify(raw), { mode: 0o600 });
  }

  #loadToken() {
    try {
      const buf = fs.readFileSync(this.tokenFile);
      const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
      this.token = JSON.parse(text);
    } catch {
      this.token = null;
    }
  }

  #saveToken() {
    const text = JSON.stringify(this.token);
    const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text);
    fs.writeFileSync(this.tokenFile, buf, { mode: 0o600 });
  }

  /** Opens Google's sign-in page in the browser and waits for you to say yes. */
  async connect() {
    const client = this.#client();
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(12));

    const { code, redirect } = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/') return res.writeHead(404).end();
        const ok = url.searchParams.get('state') === state && url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<body style="font:20px system-ui;text-align:center;padding:60px">${ok ? '🐥 Bbokari is connected! You can close this tab.' : '😢 That didn’t work. Close this tab and try again.'}</body>`);
        clearTimeout(timer);
        server.close();
        if (ok) resolve({ code: url.searchParams.get('code'), redirect: `http://127.0.0.1:${server.address()?.port ?? port}` });
        else reject(new Error(url.searchParams.get('error') === 'access_denied' ? 'You said no on the Google page.' : 'Google sign-in didn’t finish.'));
      });
      let port = 0;
      const timer = setTimeout(() => {
        server.close();
        reject(new Error('Google sign-in timed out. Try again.'));
      }, 5 * 60_000);
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: `http://127.0.0.1:${port}`,
          response_type: 'code',
          scope: SCOPES.join(' '),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent',
          state,
        }).toString();
        shell.openExternal(auth.toString());
      });
    });

    const tok = await this.#tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
    if (!tok.refresh_token) throw new Error('Google didn’t give a lasting sign-in. Try again.');
    let email = '';
    try {
      email = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64').toString()).email ?? '';
    } catch {}
    this.token = { access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000, refresh_token: tok.refresh_token, email };
    this.#saveToken();
    return email;
  }

  async #tokenRequest(params) {
    const client = this.#client();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret ?? '', ...params }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'invalid_grant') {
        this.disconnect();
        throw new Error('Your Google sign-in expired. Use 📬 Inbox → Connect Google account again.');
      }
      throw new Error(data.error_description || data.error || `Google said ${res.status}`);
    }
    return data;
  }

  async #accessToken() {
    if (!this.connected) throw new Error('Not connected to Google yet.');
    if (this.token.access_token && Date.now() < this.token.expires_at) return this.token.access_token;
    const tok = await this.#tokenRequest({ grant_type: 'refresh_token', refresh_token: this.token.refresh_token });
    this.token.access_token = tok.access_token;
    this.token.expires_at = Date.now() + (tok.expires_in - 60) * 1000;
    this.#saveToken();
    return tok.access_token;
  }

  /** Calls a Google API. Returns the JSON reply (or {} when there's no body). */
  async api(url, { method = 'GET', body, retry = true } = {}) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await this.#accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 && retry) {
      this.token.expires_at = 0;
      return this.api(url, { method, body, retry: false });
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Google said ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  disconnect() {
    this.token = null;
    try {
      fs.unlinkSync(this.tokenFile);
    } catch {}
  }
}
