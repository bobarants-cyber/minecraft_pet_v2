// Class notes: collects what was said during a class (from the live-captions speech recogniser) and, at the end,
// turns it into study notes with the local AI. Saved as a text file in Documents/Bbokari Notes, with the full
// transcript underneath. No audio is ever kept, only text.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OLLAMA_URL } from './ai.js';

export const NOTES_DIR = path.join(os.homedir(), 'Documents', 'Bbokari Notes');
const CHUNK_CHARS = 7000;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const safeName = (s) => s.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Notes';

async function chat(model, system, user, maxTokens = 1400) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.3, num_predict: maxTokens, num_ctx: 8192 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return String(data.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

const NOTES_PROMPT = (title) =>
  `You are a helpful student writing study notes from the transcript of a class${title ? ` called "${title}"` : ''}. ` +
  'The transcript comes from automatic speech recognition, so fix obvious mistakes and ignore chit-chat. ' +
  'Write in the same language the class was taught in, using these sections with Markdown headings:\n' +
  '## Summary — 3 to 5 sentences.\n' +
  '## Key points — bullet points of the main ideas, facts, steps or examples.\n' +
  '## Important words — "term: meaning" bullets for new vocabulary or concepts (skip if none).\n' +
  '## Homework & dates — anything the teacher said to do, hand in or remember, with dates (write "None mentioned" if none).\n' +
  '## Review questions — 3 short questions to test yourself on this class.\n' +
  'Use only what is in the transcript. Do not invent facts.';

/** Turns transcript text into notes; long classes are summarised in parts first, then combined. */
export async function writeNotes({ transcript, title, model }) {
  if (transcript.length <= CHUNK_CHARS) return chat(model, NOTES_PROMPT(title), transcript);
  const parts = [];
  for (let i = 0; i < transcript.length; i += CHUNK_CHARS) parts.push(transcript.slice(i, i + CHUNK_CHARS));
  const partial = [];
  for (const [i, part] of parts.entries()) {
    partial.push(
      await chat(
        model,
        `Write compact bullet-point notes of everything important in this part (${i + 1} of ${parts.length}) of a class transcript: ` +
          'ideas, facts, examples, new words, homework and dates. Same language as the transcript. Bullets only.',
        part,
        700,
      ),
    );
  }
  return chat(model, NOTES_PROMPT(title), `Notes from each part of the class, in order:\n\n${partial.join('\n\n')}`);
}

export class NotesSession {
  constructor({ title = 'Notes', endAt = null, auto = false } = {}) {
    this.title = title;
    this.startedAt = new Date();
    this.endAt = endAt ? new Date(endAt) : null;
    this.auto = auto;
    this.lines = [];
  }

  add(line) {
    const text = String(line?.text ?? '').trim();
    if (!text) return;
    this.lines.push({ time: new Date(line.time ?? Date.now()), text, kind: line.kind, translation: line.translation ?? null });
  }

  transcript({ withTimes = false } = {}) {
    return this.lines.map((l) => `${withTimes ? `[${stamp(l.time)}] ` : ''}${l.text}`).join('\n');
  }

  /** Writes the notes file. Resolves with { file, markdown, notesOk }. */
  async finish({ model }) {
    const ended = new Date();
    let notes = null;
    let problem = null;
    if (this.lines.length) {
      try {
        notes = await writeNotes({ transcript: this.transcript(), title: this.title, model });
      } catch (err) {
        problem = String(err?.message ?? err);
      }
    }
    const day = this.startedAt.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const md = [
      `# ${this.title}`,
      `${day} · ${stamp(this.startedAt)}–${stamp(ended)}`,
      '',
      notes ?? (this.lines.length ? `_I couldn't write the summary (${problem}). Is the Ollama app open? The full transcript is below._` : '_I didn’t hear anything during this session._'),
      '',
      '---',
      '',
      '## Full transcript',
      '',
      this.transcript({ withTimes: true }) || '_(empty)_',
      '',
    ].join('\n');
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    const d = this.startedAt;
    const file = path.join(NOTES_DIR, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())} - ${safeName(this.title)}.md`);
    fs.writeFileSync(file, md);
    return { file, markdown: md, notes, notesOk: !!notes, lines: this.lines.length };
  }
}
