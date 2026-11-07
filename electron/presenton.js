// Presenton (https://github.com/presenton/presenton, Apache-2.0): an open-source AI presentation maker that runs on
// your own Mac (in Docker, with Ollama) and adds real photos. Bbokari sends it the slides (with the math already done)
// and gets back a .pptx plus a link to Presenton's editor. No Electron imports, so it can be tested with plain Node.
import fs from 'node:fs';
import path from 'node:path';

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
  const res = await fetch(abs(url, '/api/v1/ppt/presentation/generate'), {
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
    signal: AbortSignal.timeout(15 * 60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error('Presenton needs an API key (menu bar → 🖼 Presentation maker → Enter Presenton API key).');
  if (!res.ok) throw new Error(data.detail?.toString?.() || data.message || `Presenton said ${res.status}`);
  if (!data.path) throw new Error('Presenton didn’t send back a file');
  const download = await fetch(abs(url, data.path), { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(120_000) });
  if (!download.ok) throw new Error(`Couldn’t download the file from Presenton (${download.status})`);
  fs.mkdirSync(saveDir, { recursive: true });
  const file = path.join(saveDir, `${String(name).replace(/[/\\:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Presentation'} (Presenton) ${new Date().toISOString().slice(0, 10)}.pptx`);
  fs.writeFileSync(file, Buffer.from(await download.arrayBuffer()));
  return { file, editUrl: data.edit_path ? abs(url, data.edit_path) : url };
}
