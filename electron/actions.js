// Bbokari's "do things for me" powers: open a class, a project, a file or a folder, and write a document or a
// presentation (Google Docs, Google Slides, Canva, Keynote, PowerPoint, Pages, Word) about whatever you ask.
// Only these actions exist: the AI picks one and fills in the blanks, it can't run anything else on your Mac.
// No Electron imports, so it can be tested with plain Node.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { OLLAMA_URL } from './ai.js';

export const DOCS_DIR = path.join(os.homedir(), 'Documents', 'Bbokari Docs');

const LEAD = String.raw`^(?:(?:hey|hi|ok|okay)\s+\w+[,!.]?\s*)?(?:(?:can|could|will|would)\s+you\s+|please\s+|pls\s+|i\s+(?:want|need)\s+you\s+to\s+)?`;
const END = String.raw`(?:\s+(?:please|pls|for me|now))*[.!?]*$`;

const DOC_WORDS = 'doc|document|google doc|essay|report|paper|summary|letter|story|outline|study guide|notes page';
const SLIDE_WORDS = 'presentation|slides|slide deck|slideshow|slide show|deck|powerpoint|keynote|canva';
const PLACES = {
  'google docs': 'gdocs', docs: 'gdocs', 'google doc': 'gdocs', pages: 'pages', word: 'word', 'microsoft word': 'word',
  'google slides': 'gslides', slides: 'gslides', canva: 'canva', keynote: 'keynote', powerpoint: 'powerpoint', 'power point': 'powerpoint',
};

const clean = (s) => String(s ?? '').trim().replace(/^["“']|["”']$/g, '').replace(/\s+/g, ' ');

/** Where the user asked for it ("in canva", "on google slides"), or null. Also returns the text without it. */
function splitPlace(text) {
  const m = text.match(/\s+(?:in|on|using|with)\s+(google docs?|docs|pages|microsoft word|word|google slides|slides|canva|keynote|power ?point)\s*$/i);
  if (!m) return { rest: text, place: null };
  return { rest: text.slice(0, m.index), place: PLACES[m[1].toLowerCase().replace(/\s+/g, ' ')] ?? null };
}

/**
 * Turns a request into an action, or null if it isn't one:
 *   { type: 'open_class', name }            "open my math class", "join science class"
 *   { type: 'open_project', name, claude }  "open my robot project", "open my history project in claude"
 *   { type: 'open_folder', name }           "open my downloads"
 *   { type: 'open_file', name }             "open my volcano essay", "open the file budget"
 *   { type: 'create', kind: 'doc'|'slides', topic, place, request }  "make a presentation about volcanoes in canva"
 */
export function parseAction(message) {
  const text = clean(message);
  if (!text) return null;
  let m;

  if ((m = text.match(new RegExp(`${LEAD}(?:open|join|start|go to|take me to)\\s+(?:up\\s+)?(?:my\\s+|the\\s+)?(.{1,40}?)\\s+class(?:es)?${END}`, 'i')))) {
    return { type: 'open_class', name: clean(m[1]) };
  }
  if ((m = text.match(new RegExp(`${LEAD}(?:open|show|go to)\\s+(?:up\\s+)?(?:my\\s+|the\\s+)?(.{1,50}?)\\s+project(?:\\s+(?:in|on|from)\\s+(claude|vs ?code|visual studio code|finder))?${END}`, 'i')))) {
    const where = (m[2] ?? '').toLowerCase();
    const name = clean(m[1]).replace(/^claude\s+/i, '');
    return { type: 'open_project', name, claude: where === 'claude' || /^claude\b/i.test(clean(m[1])) };
  }
  if ((m = text.match(new RegExp(`${LEAD}open\\s+(?:up\\s+)?(?:my\\s+|the\\s+)?(downloads|documents|desktop|pictures|music|movies|home|applications)(?:\\s+folder)?${END}`, 'i')))) {
    return { type: 'open_folder', name: m[1].toLowerCase() };
  }
  if ((m = text.match(new RegExp(`${LEAD}open\\s+(?:up\\s+)?(?:my\\s+|the\\s+)(.{1,50}?)\\s+(?:file|doc|document|essay|presentation|slides|spreadsheet|pdf|folder)${END}`, 'i')))) {
    return { type: 'open_file', name: clean(m[1]), folder: /folder\s*[.!?]*$/i.test(text) };
  }
  if ((m = text.match(new RegExp(`${LEAD}open\\s+(?:up\\s+)?(?:the\\s+)?(?:file|doc|document|presentation|folder)\\s+(?:called\\s+|named\\s+)?(.{1,50}?)${END}`, 'i')))) {
    return { type: 'open_file', name: clean(m[1]), folder: /^\s*(?:\S+\s+){0,6}?open\s+(?:up\s+)?(?:the\s+)?folder/i.test(text) };
  }

  const create = new RegExp(`${LEAD}(?:make|create|write|do|build|start|prepare|put together)\\s+(?:me\\s+|us\\s+)?(?:a|an|some|the)?\\s*(?:new\\s+|quick\\s+|short\\s+|long\\s+|simple\\s+|cool\\s+)*(?:(?:google slides|google docs|google|canva|keynote|powerpoint|word)\\s+)?(${SLIDE_WORDS}|${DOC_WORDS})\\s+(?:about|on|for|explaining|that explains|of)\\s+(.{2,300}?)${END}`, 'i');
  if ((m = text.match(create))) {
    const word = m[1].toLowerCase();
    const { rest, place } = splitPlace(m[2]);
    const kind = new RegExp(`^(?:${SLIDE_WORDS})$`, 'i').test(word) ? 'slides' : 'doc';
    const implied = word === 'canva' ? 'canva' : word === 'keynote' ? 'keynote' : word === 'powerpoint' ? 'powerpoint' : /google/i.test(text.slice(0, m.index + 40)) && kind === 'slides' ? 'gslides' : null;
    const finalPlace = place ?? implied ?? (/\bcanva\b/i.test(text) ? 'canva' : null);
    return { type: 'create', kind, topic: clean(rest), place: finalPlace ?? (kind === 'doc' ? 'gdocs' : 'gslides'), request: text };
  }
  return null;
}

/** True when the message *might* be an action the patterns missed, so it's worth asking the AI to sort it out. */
export function mightBeAction(message) {
  const t = String(message ?? '').toLowerCase();
  return /\b(open|join|make|create|write|build|prepare|start)\b/.test(t) && /\b(class|project|doc|document|essay|report|presentation|slides?|deck|canva|keynote|powerpoint|folder|file)\b/.test(t);
}

async function ollamaJSON(messages, model, { timeout = 180_000, temperature = 0.4 } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model, messages, stream: false, format: 'json', options: { temperature } }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return JSON.parse(data?.message?.content ?? '{}');
}

/** Asks the AI which action (if any) the message is. Never returns anything outside the fixed list. */
export async function classifyAction(message, model) {
  const out = await ollamaJSON(
    [
      {
        role: 'system',
        content:
          'You sort a request into one action. Reply with JSON only: {"action": "...", "name": "...", "topic": "...", "app": "..."}.\n' +
          'action is one of: "open_class" (join/open one of their school classes; name = the class), "open_project" (a coding/school project folder; name), ' +
          '"open_file" (a file by name; name), "create_doc" (write a document/essay/report; topic), "create_slides" (make a presentation; topic), "none" (anything else, like a question).\n' +
          'app is where they want it: "gdocs", "pages", "word", "gslides", "canva", "keynote", "powerpoint" or "". Use "none" when unsure.',
      },
      { role: 'user', content: String(message).slice(0, 500) },
    ],
    model,
    { timeout: 60_000, temperature: 0 },
  );
  const a = String(out?.action ?? 'none');
  const name = clean(out?.name).slice(0, 60);
  const topic = clean(out?.topic).slice(0, 300);
  const app = Object.values(PLACES).includes(out?.app) ? out.app : null;
  if (a === 'open_class' && name) return { type: 'open_class', name };
  if (a === 'open_project' && name) return { type: 'open_project', name, claude: /claude/i.test(message) };
  if (a === 'open_file' && name) return { type: 'open_file', name };
  if (a === 'create_doc' && topic) return { type: 'create', kind: 'doc', topic, place: app && ['gdocs', 'pages', 'word'].includes(app) ? app : 'gdocs', request: String(message) };
  if (a === 'create_slides' && topic) return { type: 'create', kind: 'slides', topic, place: app && ['gslides', 'canva', 'keynote', 'powerpoint'].includes(app) ? app : 'gslides', request: String(message) };
  return null;
}

// ---------- classes ----------

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Same subject, other words (English/Spanish), so "spanish" finds "Español" and "maths" finds "Math". */
const SUBJECTS = [['math', 'maths', 'mathematics', 'matematicas', 'mates'], ['spanish', 'espanol', 'castellano'], ['english', 'ingles', 'language arts', 'ela'],
  ['science', 'ciencias', 'ciencia'], ['history', 'historia'], ['social studies', 'sociales', 'ciencias sociales'], ['art', 'arte'], ['music', 'musica'],
  ['pe', 'gym', 'physical education', 'educacion fisica'], ['french', 'frances'], ['biology', 'biologia'], ['chemistry', 'quimica'], ['physics', 'fisica']];
const subjectWords = (q) => SUBJECTS.find((g) => g.includes(q)) ?? [q];

/** Finds the class that best matches a spoken name ("math" → "Math 7", "sci" → "Science"). */
export function findClass(classes, name) {
  const q0 = norm(name);
  if (!q0) return null;
  let best = null;
  let bestScore = 0;
  for (const q of subjectWords(q0)) {
    for (const c of classes ?? []) {
      const n = norm(c.name);
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q) || q.startsWith(n)) score = 80;
      else if (n.split(' ').some((w) => w === q || q.split(' ').includes(w))) score = 60;
      else if (n.includes(q) || q.includes(n)) score = 40;
      if (score && q !== q0) score -= 5; // a direct match beats a translated one
      if (score > bestScore) [best, bestScore] = [c, score];
    }
  }
  return best;
}

// ---------- finding projects and files (Spotlight) ----------

const SKIP = /\/(?:Library|\.Trash|node_modules|\.git|\.cache|Applications)(?:\/|$)|\/\.[^/]+/;

function mdfind(query) {
  return new Promise((resolve) => {
    execFile('mdfind', ['-onlyin', os.homedir(), query], { timeout: 15_000, maxBuffer: 4 << 20 }, (err, stdout) => {
      resolve(err ? [] : String(stdout).split('\n').filter(Boolean).slice(0, 400));
    });
  });
}

const spotlightText = (s) => String(s).replace(/["*\\]/g, '').trim();

/** Ranks paths for a name: exact name first, then names that start with it, then shallow and recently changed. */
export function rankPaths(paths, name) {
  const q = norm(name);
  const scored = paths
    .filter((p) => !SKIP.test(p))
    .map((p) => {
      const base = norm(path.basename(p).replace(/\.[^.]+$/, ''));
      let score = base === q ? 100 : base.startsWith(q) ? 70 : base.includes(q) ? 50 : q.split(' ').every((w) => base.includes(w)) ? 40 : 0;
      score -= p.split('/').length * 2;
      if (/\/(Documents|Desktop|Developer|Projects|Code)\//i.test(p)) score += 10;
      let mtime = 0;
      try {
        mtime = fs.statSync(p).mtimeMs;
      } catch {}
      return { p, score, mtime };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return scored.map((x) => x.p);
}

export async function findFolder(name) {
  const n = spotlightText(name);
  if (!n) return null;
  const hits = await mdfind(`kMDItemContentType == "public.folder" && kMDItemFSName == "*${n}*"cd`);
  return rankPaths(hits, n)[0] ?? null;
}

export async function findFile(name) {
  const n = spotlightText(name);
  if (!n) return null;
  const hits = await mdfind(`kMDItemFSName == "*${n}*"cd && kMDItemContentType != "public.folder"`);
  return rankPaths(hits, n)[0] ?? null;
}

const FOLDERS = { downloads: 'Downloads', documents: 'Documents', desktop: 'Desktop', pictures: 'Pictures', music: 'Music', movies: 'Movies', home: '', applications: '/Applications' };
export const standardFolder = (name) => (FOLDERS[name]?.startsWith('/') ? FOLDERS[name] : path.join(os.homedir(), FOLDERS[name] ?? ''));

// ---------- writing documents and presentations ----------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fileSafe = (s) => String(s ?? 'Bbokari').replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Bbokari';

function writerRules(kind) {
  const common =
    'Write in clear, friendly, correct language at the level the request suggests (default: a middle-school student). ' +
    'Be accurate; if a fact is uncertain, keep it general instead of inventing numbers, names or quotes. ' +
    'Write in the same language as the request.';
  if (kind === 'slides') {
    return (
      'You make presentation slides. Reply with JSON only: ' +
      '{"title": "...", "subtitle": "...", "slides": [{"title": "...", "bullets": ["...", "..."], "emoji": "🌋", "notes": "..."}]}. ' +
      'Make 6 to 8 slides (not counting the title), each with 3 or 4 short bullets (under 12 words each), one fitting emoji, ' +
      'and 1-2 sentences of speaker notes. End with a "Summary" or "Fun facts" slide. ' +
      common
    );
  }
  return (
    'You write documents. Reply with JSON only: {"title": "...", "sections": [{"heading": "...", "paragraphs": ["...", "..."]}]}. ' +
    'Start with an introduction section and end with a conclusion. Use 4 to 6 sections, each with 1 to 3 paragraphs of 2 to 5 sentences. ' +
    common
  );
}

/** Asks the local AI for the content. Returns { title, sections } or { title, subtitle, slides }. */
export async function writeContent({ kind, topic, request }, model) {
  const out = await ollamaJSON(
    [
      { role: 'system', content: writerRules(kind) },
      { role: 'user', content: `Topic: ${topic}\nThe full request was: "${String(request ?? topic).slice(0, 400)}"` },
    ],
    model,
    { temperature: 0.6 },
  );
  return tidyContent(kind, out, topic);
}

export function tidyContent(kind, out, topic) {
  const title = clean(out?.title) || topic.replace(/^\p{L}/u, (c) => c.toUpperCase());
  if (kind === 'slides') {
    const slides = (Array.isArray(out?.slides) ? out.slides : [])
      .map((s) => ({
        title: clean(s?.title).slice(0, 80),
        bullets: (Array.isArray(s?.bullets) ? s.bullets : []).map((b) => clean(b).slice(0, 160)).filter(Boolean).slice(0, 6),
        emoji: clean(s?.emoji).slice(0, 4) || '✨',
        notes: clean(s?.notes).slice(0, 600),
      }))
      .filter((s) => s.title || s.bullets.length)
      .slice(0, 12);
    if (!slides.length) throw new Error('The AI didn’t write any slides');
    return { title, subtitle: clean(out?.subtitle).slice(0, 120), slides };
  }
  const sections = (Array.isArray(out?.sections) ? out.sections : [])
    .map((s) => ({ heading: clean(s?.heading).slice(0, 120), paragraphs: (Array.isArray(s?.paragraphs) ? s.paragraphs : [s?.paragraphs]).map(clean).filter(Boolean) }))
    .filter((s) => s.heading || s.paragraphs.length);
  if (!sections.length) throw new Error('The AI didn’t write anything');
  return { title, sections };
}

export function docHTML(doc) {
  const body = doc.sections.map((s) => `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('');
  return `<html><head><meta charset="utf-8"><title>${esc(doc.title)}</title></head><body><h1>${esc(doc.title)}</h1>${body}</body></html>`;
}

export function docText(doc) {
  return [doc.title, '', ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs, ''])].join('\n');
}

/** Saves the document in Documents/Bbokari Docs as .html (and .docx when asked). Returns the paths. */
export async function saveDoc(doc, { docx = false } = {}) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const base = path.join(DOCS_DIR, `${fileSafe(doc.title)} ${new Date().toISOString().slice(0, 10)}`);
  fs.writeFileSync(`${base}.html`, docHTML(doc));
  if (!docx) return { html: `${base}.html` };
  // textutil comes with every Mac and turns the HTML into a real Word document.
  await new Promise((resolve, reject) =>
    execFile('textutil', ['-convert', 'docx', '-output', `${base}.docx`, `${base}.html`], { timeout: 30_000 }, (err) => (err ? reject(err) : resolve())),
  );
  return { html: `${base}.html`, docx: `${base}.docx` };
}

const THEMES = [
  { bg: 'FFF8E1', accent: 'FFB21E', ink: '2B2140', soft: 'FFE7A3' },
  { bg: 'EAF6FF', accent: '4DABF7', ink: '1E2A44', soft: 'CFE8FF' },
  { bg: 'F3F0FF', accent: '9775FA', ink: '2B2140', soft: 'E0D8FF' },
  { bg: 'EBFBEE', accent: '40C057', ink: '1F3326', soft: 'C9F2D2' },
];

/** Builds a .pptx (opens in Keynote and PowerPoint, and imports into Google Slides and Canva). Returns its path. */
export async function savePresentation(deck) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const t = THEMES[Math.floor(Math.random() * THEMES.length)];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = deck.title;
  const font = 'Avenir Next';

  const cover = pptx.addSlide();
  cover.background = { color: t.bg };
  cover.addShape('ellipse', { x: 8.6, y: -1.6, w: 6.5, h: 6.5, fill: { color: t.soft }, line: { color: t.soft } });
  cover.addShape('ellipse', { x: -1.5, y: 5.2, w: 4, h: 4, fill: { color: t.soft }, line: { color: t.soft } });
  cover.addText(deck.slides[0]?.emoji ?? '✨', { x: 9.6, y: 1.2, w: 3, h: 2.6, fontSize: 120, align: 'center' });
  cover.addText(deck.title, { x: 0.8, y: 2.2, w: 8.6, h: 1.8, fontFace: font, fontSize: 48, bold: true, color: t.ink, valign: 'bottom', fit: 'shrink' });
  if (deck.subtitle) cover.addText(deck.subtitle, { x: 0.8, y: 4.1, w: 8.6, h: 0.9, fontFace: font, fontSize: 22, color: t.ink, valign: 'top' });
  cover.addShape('rect', { x: 0.8, y: 4.05, w: 1.6, h: 0.08, fill: { color: t.accent }, line: { color: t.accent } });

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 1.35, fill: { color: t.bg }, line: { color: t.bg } });
    slide.addShape('rect', { x: 0, y: 1.35, w: 13.33, h: 0.07, fill: { color: t.accent }, line: { color: t.accent } });
    slide.addText(s.title, { x: 0.7, y: 0.2, w: 10.4, h: 1, fontFace: font, fontSize: 32, bold: true, color: t.ink, valign: 'middle', fit: 'shrink' });
    slide.addShape('ellipse', { x: 9.4, y: 2.4, w: 3.4, h: 3.4, fill: { color: t.bg }, line: { color: t.bg } });
    slide.addText(s.emoji, { x: 9.4, y: 2.4, w: 3.4, h: 3.4, fontSize: 130, align: 'center', valign: 'middle' });
    if (s.bullets.length) {
      const size = s.bullets.join(' ').length > 220 ? 24 : 28;
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 28 }, paraSpaceAfter: 18 } })),
        { x: 0.9, y: 1.9, w: 8.2, h: 5.1, fontFace: font, fontSize: size, color: t.ink, valign: 'top' },
      );
    }
    if (s.notes) slide.addNotes(s.notes);
  }

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const file = path.join(DOCS_DIR, `${fileSafe(deck.title)} ${new Date().toISOString().slice(0, 10)}.pptx`);
  await pptx.writeFile({ fileName: file });
  return file;
}
