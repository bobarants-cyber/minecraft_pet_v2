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

/** "…but don't type anything, give me a base I can fill in": an empty template instead of written content. */
const TEMPLATE = /\b(?:don'?t|do not|dont)\s+(?:type|write|put|fill|add)\b|\b(?:blank|empty|template|base|layout|skeleton)\b|\b(?:i(?:'ll| will| can)|so i can|that i can|where i can|in which i can|for me to)\s+(?:put|fill|add|write|type)\b|\bfill(?:\s+it)?\s+in\b|\bwithout\s+(?:text|words|writing)\b/i;
const TOPIC_TAIL = /\s*(?:[,;.]|\s(?:but|and|so|with|without|then)\b)?\s*(?:\b(?:don'?t|do not|dont|without|leave|just|only|so i can|that i can|where i can|in which|for me to|i(?:'ll| will| want| need)|give me|make it|blank|empty|template|with (?:a |an |the )?(?:base|layout|space|spaces|place|places|room))\b.*)$/i;

/** Splits "bibimbap dont type anything but give me a base…" into the topic ("bibimbap") and whether it's a template. */
export function splitTopic(raw) {
  const text = clean(raw);
  const template = TEMPLATE.test(text);
  const topic = clean(text.replace(TOPIC_TAIL, '')) || text;
  return { topic: topic.replace(/^(?:a|an|the)\s+/i, (m) => m).slice(0, 120), template };
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

  const create = new RegExp(`${LEAD}(?:make|create|write|do|build|start|prepare|put together)\\s+(?:me\\s+|us\\s+)?(?:a|an|some|the)?\\s*(?:new\\s+|quick\\s+|short\\s+|long\\s+|simple\\s+|cool\\s+|blank\\s+|empty\\s+|template\\s+|basic\\s+)*(?:(?:google slides|google docs|google|canva|keynote|powerpoint|word)\\s+)?(${SLIDE_WORDS}|${DOC_WORDS})\\s+(?:about|on|for|explaining|that explains|of)\\s+(.{2,300}?)${END}`, 'i');
  if ((m = text.match(create))) {
    const word = m[1].toLowerCase();
    // Where ("in canva") can be at the end or in the middle ("about bibimbap in canva, don't type anything").
    const placeMid = m[2].match(/\s+(?:in|on|using|with)\s+(google docs?|docs|pages|microsoft word|word|google slides|slides|canva|keynote|power ?point)\b/i);
    const split = splitPlace(m[2]);
    const rest = placeMid && !split.place ? m[2].slice(0, placeMid.index) + m[2].slice(placeMid.index + placeMid[0].length) : split.rest;
    const place = split.place ?? (placeMid ? PLACES[placeMid[1].toLowerCase().replace(/\s+/g, ' ')] ?? null : null);
    const { topic, template } = splitTopic(rest);
    const kind = new RegExp(`^(?:${SLIDE_WORDS})$`, 'i').test(word) ? 'slides' : 'doc';
    const implied = word === 'canva' ? 'canva' : word === 'keynote' ? 'keynote' : word === 'powerpoint' ? 'powerpoint' : /google/i.test(text.slice(0, m.index + 40)) && kind === 'slides' ? 'gslides' : null;
    const finalPlace = place ?? implied ?? (/\bcanva\b/i.test(text) ? 'canva' : null);
    return { type: 'create', kind, topic, template: template || TEMPLATE.test(text), place: finalPlace ?? (kind === 'doc' ? 'gdocs' : 'gslides'), request: text };
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
  const tpl = TEMPLATE.test(message);
  if (a === 'create_doc' && topic) return { type: 'create', kind: 'doc', template: tpl, topic: splitTopic(topic).topic, place: app && ['gdocs', 'pages', 'word'].includes(app) ? app : 'gdocs', request: String(message) };
  if (a === 'create_slides' && topic) return { type: 'create', kind: 'slides', template: tpl, topic: splitTopic(topic).topic, place: app && ['gslides', 'canva', 'keynote', 'powerpoint'].includes(app) ? app : 'gslides', request: String(message) };
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

const STYLE_RULE =
  ' Also add "theme": one of "korean", "food", "nature", "space", "ocean", "school", "party", "classic" (pick "korean" for anything about Korea), ' +
  'and "hangul": the title in Korean (Hangul) if the theme is "korean", otherwise "".';

function templateRules(kind) {
  const common =
    'The student wants an EMPTY TEMPLATE to fill in themselves: do NOT write the real content (no facts, no recipe steps, no answers). ' +
    'Only give the structure the request asks for, with short placeholder labels. Write in the same language as the request.';
  if (kind === 'slides') {
    return (
      'You make empty presentation templates. Reply with JSON only: ' +
      '{"title": "...", "subtitle": "Add a subtitle", "slides": [{"title": "Ingredients", "bullets": ["Ingredient 1", "Ingredient 2", "Ingredient 3"], "emoji": "🥕"}]}. ' +
      'Make 3 to 6 slides, one per section the student asked for (e.g. Ingredients, Recipe steps), plus anything clearly useful. ' +
      'If school project instructions are given, make one slide for each part the project requires, about the student\'s topic, in the order the project asks. ' +
      'Bullets are placeholder labels like "Ingredient 1", "Step 1", "Fun fact", 3 to 6 per slide. ' +
      'For any slide with numbers, measurements or calculations (amounts, servings, scaling, cost, conversions), use a table instead of bullets: ' +
      '"table": {"columns": ["Ingredient", "Amount for 4", "Amount for 8", "Cost"], "rows": 6} with 2 to 5 short column headers and EMPTY cells for the student. ' +
      common +
      STYLE_RULE
    );
  }
  return (
    'You make empty document templates. Reply with JSON only: {"title": "...", "sections": [{"heading": "Ingredients", "paragraphs": ["Ingredient 1", "Ingredient 2"]}]}. ' +
    'One section per part the student asked for; paragraphs are short placeholder labels. ' +
    common
  );
}

function filledRules(kind) {
  const common =
    'Use ONLY the details, numbers and calculations the student gives. Copy their numbers and calculation steps exactly. ' +
    'Do not add facts, prices, amounts or results they did not give, and do not change their math. If something is missing, leave a short placeholder like "Add photo" or "Your answer". ' +
    'Write in the same language as the request.';
  if (kind === 'slides') {
    return (
      'You turn a student\'s own project details into presentation slides. Reply with JSON only: ' +
      '{"title": "...", "subtitle": "...", "slides": [{"title": "...", "bullets": ["..."], "emoji": "🍚", "table": {"columns": ["Ingredient", "For 2", "For 4"], "rows": [["Rice", "1 cup", "2 cups"]]}}]}. ' +
      'Make one slide per part of the project (follow the project instructions if given). Put amounts and calculations in tables with the student\'s values in the cells; ' +
      'put calculation steps as bullets (e.g. "3/2 × 2 = 6/2 = 3"). 4 to 8 slides. ' +
      common +
      STYLE_RULE
    );
  }
  return (
    'You turn a student\'s own project details into a document. Reply with JSON only: {"title": "...", "sections": [{"heading": "...", "paragraphs": ["..."]}]}. ' +
    'One section per part of the project; show calculations step by step as written by the student. ' +
    common
  );
}

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
      common +
      STYLE_RULE
    );
  }
  return (
    'You write documents. Reply with JSON only: {"title": "...", "sections": [{"heading": "...", "paragraphs": ["...", "..."]}]}. ' +
    'Start with an introduction section and end with a conclusion. Use 4 to 6 sections, each with 1 to 3 paragraphs of 2 to 5 sentences. ' +
    common
  );
}

/** Asks the local AI for the content. Returns { title, sections } or { title, subtitle, slides }. */
export async function writeContent({ kind, topic, request, template = false, filled = false, theme = null }, model) {
  const out = await ollamaJSON(
    [
      { role: 'system', content: filled ? filledRules(kind) : template ? templateRules(kind) : writerRules(kind) },
      { role: 'user', content: `Topic: ${topic}\nThe full request was: "${String(request ?? topic).slice(0, 400)}"` },
    ],
    model,
    { temperature: 0.6 },
  );
  const content = { ...tidyContent(kind, out, topic), template, filled };
  if (kind === 'slides') {
    content.theme = theme && THEMES[theme] ? theme : pickTheme(`${topic} ${request ?? ''}`, out?.theme);
    const hangul = clean(out?.hangul);
    content.hangul = content.theme === 'korean' && /[\uAC00-\uD7A3]/.test(hangul) ? hangul.slice(0, 30) : '';
  }
  return content;
}

const KOREAN = /\b(?:korea|korean|hangul|hanbok|seoul|busan|k-?pop|k-?drama|kimchi|bibimbap|bulgogi|tteok\w*|japchae|kimbap|gimbap|ramyeon|soju|chuseok|seollal|hanok|taekwondo|skz|stray kids)\b|[\uAC00-\uD7A3]/i;
/** The look for a presentation: Korean topics always get the Korean theme; otherwise what the AI picked. */
export function pickTheme(text, aiTheme) {
  if (KOREAN.test(text)) return 'korean';
  return THEMES[aiTheme] ? aiTheme : 'classic';
}

/** A table: column headers, and either a number of empty rows or the student's values. */
function tidyTable(t) {
  const columns = t.columns.map((c) => clean(c).slice(0, 30)).filter(Boolean).slice(0, 5);
  if (Array.isArray(t.rows)) {
    const cells = t.rows.filter(Array.isArray).slice(0, 12).map((r) => columns.map((_, i) => clean(r[i] ?? '').slice(0, 40)));
    if (cells.length) return { columns, rows: cells.length, cells };
  }
  return { columns, rows: Math.min(10, Math.max(2, Number(t.rows) || 5)), cells: null };
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
        table: Array.isArray(s?.table?.columns) && s.table.columns.length ? tidyTable(s.table) : null,
      }))
      .filter((s) => s.title || s.bullets.length || s.table)
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
  const para = (p) => (doc.template ? `<p><span style="color:#9a9a9a">${esc(p)}:</span> ______________________________</p>` : `<p>${esc(p)}</p>`);
  const body = doc.sections.map((s) => `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${s.paragraphs.map(para).join('')}`).join('');
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

const THEMES = {
  korean: { bg: 'F7F0E1', card: 'FFFDF7', ink: '1F2A44', accent: 'C8102E', accent2: '0F3A7A', soft: 'EADBC0', font: 'Noto Sans KR', title: 'Noto Serif KR' },
  food: { bg: 'FFF4E6', card: 'FFFFFF', ink: '3A2414', accent: 'E8590C', accent2: '2F9E44', soft: 'FFD8A8', font: 'Poppins', title: 'Poppins' },
  nature: { bg: 'EEF7EE', card: 'FFFFFF', ink: '1F3326', accent: '2F9E44', accent2: 'F59F00', soft: 'C9F2D2', font: 'Nunito', title: 'Nunito' },
  space: { bg: '0E1236', card: '1B2155', ink: 'F1F3FF', accent: '9775FA', accent2: 'FFD43B', soft: '2A3170', font: 'Montserrat', title: 'Montserrat' },
  ocean: { bg: 'E7F5FF', card: 'FFFFFF', ink: '0B2545', accent: '1C7ED6', accent2: '12B886', soft: 'C5E5FB', font: 'Nunito', title: 'Nunito' },
  school: { bg: 'FFF9DB', card: 'FFFFFF', ink: '2B2140', accent: 'F08C00', accent2: '4263EB', soft: 'FFEC99', font: 'Poppins', title: 'Poppins' },
  party: { bg: 'FFF0F6', card: 'FFFFFF', ink: '3B1F2B', accent: 'E64980', accent2: '7950F2', soft: 'FFDEEB', font: 'Poppins', title: 'Poppins' },
  classic: { bg: 'F4F6FB', card: 'FFFFFF', ink: '1E2A44', accent: '4C6EF5', accent2: 'F59F00', soft: 'DBE4FF', font: 'Avenir Next', title: 'Avenir Next' },
};
/** 색동 (saekdong): the rainbow stripes of traditional Korean hanbok sleeves. */
const SAEKDONG = ['D7263D', 'F4B400', '1D4ED8', '16A34A', 'EC4899', 'FFFFFF', 'D7263D'];

const box = (slide, x, y, w, h, color, extra = {}) => slide.addShape('rect', { x, y, w, h, fill: { color }, line: { color, width: 0 }, ...extra });
const dot = (slide, x, y, d, color, transparency = 0) => slide.addShape('ellipse', { x, y, w: d, h: d, fill: { color, transparency }, line: { color, width: 0, transparency } });

function stripes(slide, y, h) {
  const each = 13.33 / SAEKDONG.length;
  SAEKDONG.forEach((c, i) => box(slide, i * each, y, each + 0.01, h, c));
}

/** The background and decorations for a theme, drawn as shapes (so they stay editable in Canva and Keynote). */
function decorate(slide, t, name, cover) {
  slide.background = { color: t.bg };
  if (name === 'korean') {
    stripes(slide, 0, cover ? 0.22 : 0.14);
    stripes(slide, 7.5 - (cover ? 0.22 : 0.14), cover ? 0.22 : 0.14);
    // 🇰🇷 in the corners and a cloud (구름) on every slide.
    slide.addText('🇰🇷', { x: cover ? 0.35 : 10.45, y: cover ? 0.4 : 0.42, w: 0.9, h: 0.8, fontSize: cover ? 30 : 34, align: 'center', valign: 'middle' });
    if (cover) {
      dot(slide, 8.2, 0.9, 5.4, t.soft); // a round "moon" like on a folding screen
      slide.addText('🇰🇷', { x: 12.0, y: 0.4, w: 0.9, h: 0.6, fontSize: 30, align: 'center' });
      // A red seal stamp (도장) with 한국, like on traditional paintings.
      slide.addShape('roundRect', { x: 0.8, y: 5.55, w: 1.05, h: 1.05, rectRadius: 0.08, fill: { color: t.accent }, line: { color: t.accent }, rotate: -6 });
      slide.addText('한국', { x: 0.8, y: 5.55, w: 1.05, h: 1.05, fontFace: t.title, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', rotate: -6 });
      slide.addShape('cloud', { x: 2.3, y: 5.6, w: 1.7, h: 0.95, fill: { color: 'FFFFFF' }, line: { color: t.soft, width: 1 } });
      slide.addShape('cloud', { x: 9.6, y: 5.9, w: 1.4, h: 0.8, fill: { color: 'FFFFFF' }, line: { color: t.soft, width: 1 } });
      dot(slide, 11.2, 5.0, 1.0, t.accent, 10);
      dot(slide, 12.0, 4.5, 0.55, t.accent2, 10);
      // Simple clouds (구름) from overlapping circles.
    }
  } else if (name === 'space') {
    for (let i = 0; i < (cover ? 40 : 18); i++) dot(slide, Math.random() * 13.2, Math.random() * 7.4, 0.04 + Math.random() * 0.06, 'FFFFFF', 30);
    if (cover) dot(slide, 9.3, 1.0, 3.6, t.accent, 40);
  } else if (name === 'ocean') {
    for (let i = 0; i < 3; i++) slide.addShape('ellipse', { x: -2 + i * 5.2, y: 6.7, w: 6, h: 1.8, fill: { color: i % 2 ? t.accent : t.soft, transparency: 20 }, line: { color: t.soft, width: 0 } });
  } else if (name === 'food' || name === 'party' || name === 'school' || name === 'nature') {
    const n = cover ? 9 : 4;
    for (let i = 0; i < n; i++) dot(slide, Math.random() * 13, Math.random() < 0.5 ? Math.random() * 0.8 : 6.6 + Math.random() * 0.6, 0.2 + Math.random() * 0.35, i % 2 ? t.accent : t.accent2, 35);
    if (cover) dot(slide, 8.8, -1.4, 6.0, t.soft);
  } else if (cover) {
    dot(slide, 8.8, -1.4, 6.0, t.soft);
  }
}

/** Builds a .pptx (opens in Keynote and PowerPoint, and becomes a real design in Google Slides and Canva). Returns its path. */
export async function savePresentation(deck) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const name = THEMES[deck.theme] ? deck.theme : 'classic';
  const t = THEMES[name];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = deck.title;

  const cover = pptx.addSlide();
  decorate(cover, t, name, true);
  if (deck.hangul) {
    cover.addText(deck.hangul, { x: 8.4, y: 1.6, w: 5, h: 2.6, fontFace: t.title, fontSize: deck.hangul.length > 5 ? 54 : 80, bold: true, color: t.accent, align: 'center', valign: 'middle', fit: 'shrink' });
    cover.addText(deck.slides[0]?.emoji ?? '✨', { x: 9.9, y: 4.1, w: 2, h: 1.6, fontSize: 64, align: 'center' });
  } else {
    cover.addText(deck.slides[0]?.emoji ?? '✨', { x: 9.6, y: 1.2, w: 3, h: 2.6, fontSize: 120, align: 'center' });
  }
  cover.addText(deck.title, { x: 0.8, y: 2.1, w: 7.6, h: 1.9, fontFace: t.title, fontSize: 50, bold: true, color: t.ink, valign: 'bottom', fit: 'shrink' });
  box(cover, 0.8, 4.12, 1.6, 0.09, t.accent);
  if (deck.subtitle) cover.addText(deck.subtitle, { x: 0.8, y: 4.3, w: 7.6, h: 0.9, fontFace: t.font, fontSize: 22, color: t.ink, valign: 'top' });

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    decorate(slide, t, name, false);
    const top = name === 'korean' ? 0.35 : 0.3;
    slide.addText(s.title, { x: 0.8, y: top, w: 10.2, h: 1, fontFace: t.title, fontSize: 32, bold: true, color: t.ink, valign: 'middle', fit: 'shrink' });
    box(slide, 0.8, top + 1.02, 1.2, 0.07, t.accent);
    slide.addText(s.emoji, { x: 11.4, y: top - 0.05, w: 1.3, h: 1.1, fontSize: 48, align: 'center', valign: 'middle' });

    // Content on a soft card, picture (or photo spot) on the right.
    if (s.table?.columns.length) {
      // Numbers slide: a table with the column headers and empty cells to fill in, and a photo spot.
      const head = s.table.columns.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: t.accent }, align: 'center' } }));
      const body = s.table.cells
        ? s.table.cells.map((r) => r.map((v) => ({ text: v })))
        : Array.from({ length: s.table.rows }, () => s.table.columns.map(() => ({ text: '' })));
      slide.addTable([head, ...body], {
        x: 0.7, y: 1.85, w: 8.1, colW: Array(s.table.columns.length).fill(8.1 / s.table.columns.length),
        rowH: Math.min(0.55, 4.9 / (s.table.rows + 1)), fontFace: t.font, fontSize: 16, color: t.ink,
        border: { type: 'solid', pt: 1, color: t.soft }, fill: { color: t.card }, valign: 'middle',
      });
      slide.addShape('roundRect', { x: 9.3, y: 1.75, w: 3.45, h: 4.7, rectRadius: 0.25, fill: { color: t.card }, line: { color: t.accent, width: 2, dashType: 'dash' } });
      slide.addText('📷\nAdd a photo', { x: 9.3, y: 1.75, w: 3.45, h: 4.7, fontFace: t.font, fontSize: 20, color: t.accent, align: 'center', valign: 'middle' });
      if (s.notes) slide.addNotes(s.notes);
      continue;
    }
    slide.addShape('roundRect', { x: 0.6, y: 1.75, w: 8.3, h: 5.2, rectRadius: 0.25, fill: { color: t.card }, line: { color: t.soft, width: 1.5 } });
    if (deck.filled) {
      slide.addShape('roundRect', { x: 9.3, y: 1.75, w: 3.45, h: 5.2, rectRadius: 0.25, fill: { color: t.card }, line: { color: t.accent, width: 2, dashType: 'dash' } });
      slide.addText('📷\nAdd a photo', { x: 9.3, y: 1.75, w: 3.45, h: 5.2, fontFace: t.font, fontSize: 20, color: t.accent, align: 'center', valign: 'middle' });
      const size = s.bullets.join(' ').length > 260 ? 18 : s.bullets.join(' ').length > 160 ? 21 : 24;
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 28 }, paraSpaceAfter: 14 } })),
        { x: 1.0, y: 2.05, w: 7.6, h: 4.7, fontFace: t.font, fontSize: size, color: t.ink, valign: 'top' },
      );
    } else if (deck.template) {
      slide.addShape('roundRect', { x: 9.3, y: 1.75, w: 3.45, h: 5.2, rectRadius: 0.25, fill: { color: t.card }, line: { color: t.accent, width: 2, dashType: 'dash' } });
      slide.addText('📷\nAdd a photo', { x: 9.3, y: 1.75, w: 3.45, h: 5.2, fontFace: t.font, fontSize: 20, color: t.accent, align: 'center', valign: 'middle' });
      slide.addText(
        s.bullets.map((b) => ({ text: `${b}:  ____________________`, options: { bullet: { indent: 28 }, paraSpaceAfter: 20 } })),
        { x: 1.0, y: 2.05, w: 7.6, h: 4.7, fontFace: t.font, fontSize: 22, color: name === 'space' ? 'B8BEE8' : '8A8A8A', valign: 'top' },
      );
    } else {
      dot(slide, 9.35, 2.55, 3.4, t.soft);
      slide.addText(s.emoji, { x: 9.35, y: 2.55, w: 3.4, h: 3.4, fontSize: 120, align: 'center', valign: 'middle' });
      if (s.bullets.length) {
        const size = s.bullets.join(' ').length > 220 ? 22 : 26;
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 28 }, paraSpaceAfter: 18 } })),
          { x: 1.0, y: 2.05, w: 7.6, h: 4.7, fontFace: t.font, fontSize: size, color: t.ink, valign: 'top' },
        );
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  }

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const file = path.join(DOCS_DIR, `${fileSafe(deck.title)} ${new Date().toISOString().slice(0, 10)}.pptx`);
  await pptx.writeFile({ fileName: file });
  return file;
}
