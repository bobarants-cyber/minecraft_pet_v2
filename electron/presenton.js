// Presenton (https://github.com/presenton/presenton, Apache-2.0): an open-source AI presentation maker that runs on
// your own Mac (in Docker, with Ollama) and adds real photos. Bbokari sends it the slides (with the math already done)
// and gets back a .pptx plus a link to Presenton's editor. No Electron imports, so it can be tested with plain Node.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

/**
 * A plain HTTP request without fetch's built-in 5-minute wait limit (Presenton can take longer than that with a
 * small local model). Resolves { status, body: Buffer }.
 */
function request(url, { method = 'GET', headers = {}, body = null, timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Presenton took too long (over 30 minutes)')));
    req.on('error', (err) =>
      reject(
        new Error(
          err.code === 'ECONNREFUSED'
            ? 'Presenton isn’t answering (is the Docker container running?)'
            : err.code === 'ECONNRESET' || err.code === 'EPIPE' || /socket hang up/i.test(err.message)
              ? 'Presenton stopped in the middle (it may have run out of memory; try again, or check “docker logs presenton”)'
              : err.message,
        ),
      ),
    );
    if (body) req.write(body);
    req.end();
  });
}

const abs = (base, p) => (/^https?:\/\//i.test(p) ? p : `${base.replace(/\/+$/, '')}/${String(p).replace(/^\/+/, '')}`);

/** Is Presenton running at this address? */
export async function isRunning(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Makes a presentation. Give `slidesMarkdown` (one Markdown string per slide) to keep exact content, or just
 * `content` (a prompt) to let Presenton write it. Saves the .pptx in `saveDir`. Returns { file, editUrl }.
 */
export async function generate({ url, key, content = '', slidesMarkdown = null, instructions = '', nSlides, language = 'English', template = 'general', tone = 'educational', saveDir, name = 'Presentation' }) {
  const res = await request(abs(url, '/api/v1/ppt/presentation/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      content: slidesMarkdown ? '' : content,
      slides_markdown: slidesMarkdown,
      instructions: instructions || null,
      tone,
      verbosity: 'standard',
      n_slides: nSlides ?? (slidesMarkdown ? slidesMarkdown.length : 10),
      language,
      template,
      include_title_slide: !slidesMarkdown,
      export_as: 'pptx',
    }),
  });
  let data = {};
  try {
    data = JSON.parse(res.body.toString('utf8'));
  } catch {}
  if (res.status === 401 || res.status === 403) throw new Error('Presenton didn’t accept the API key (make a new one in Presenton → Settings → Admin → API keys, then menu bar → 🖼 Presentation maker → Enter Presenton API key)');
  if (res.status >= 400) {
    const detail = typeof data.detail === 'string' ? data.detail : data.detail ? JSON.stringify(data.detail).slice(0, 160) : data.message;
    throw new Error(`Presenton said ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (!data.path) throw new Error('Presenton didn’t send back a file');
  const download = await request(abs(url, data.path), { headers: key ? { Authorization: `Bearer ${key}` } : {}, timeoutMs: 5 * 60_000 });
  if (download.status >= 400) throw new Error(`Couldn’t download the file from Presenton (${download.status})`);
  fs.mkdirSync(saveDir, { recursive: true });
  const file = path.join(saveDir, `${String(name).replace(/[/\\:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Presentation'} (Presenton) ${new Date().toISOString().slice(0, 10)}.pptx`);
  fs.writeFileSync(file, download.body);
  return { file, editUrl: data.edit_path ? abs(url, data.edit_path) : url };
}
