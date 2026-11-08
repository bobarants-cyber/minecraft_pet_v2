// 🃏 "Quiz me": flashcards from your class notes, text you paste, or just a topic, made by the local AI.
// No Electron imports, so it can be tested with plain Node.
import fs from 'node:fs';
import path from 'node:path';
import { OLLAMA_URL } from './ai.js';

/** The newest notes file in the notes folder (class notes Bbokari took), as { name, text }, or null. */
export function latestNotes(dir) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(md|txt)$/i.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!files.length) return null;
    return { name: files[0].f.replace(/\.(md|txt)$/i, ''), text: fs.readFileSync(path.join(dir, files[0].f), 'utf8').slice(0, 6000) };
  } catch {
    return null;
  }
}

/** Notes whose file name matches a word in `topic` ("quiz me on my science notes"), or null. */
export function findNotes(dir, topic) {
  const words = String(topic).toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !['notes', 'class', 'quiz', 'about', 'with'].includes(w));
  if (!words.length) return null;
  try {
    const f = fs.readdirSync(dir).find((x) => /\.(md|txt)$/i.test(x) && words.some((w) => x.toLowerCase().includes(w)));
    return f ? { name: f.replace(/\.(md|txt)$/i, ''), text: fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 6000) } : null;
  } catch {
    return null;
  }
}

/** What to quiz on: "quiz me on fractions" → { topic: 'fractions' }; "quiz me: <pasted text>" → { text }. */
export function parseQuiz(said) {
  const t = String(said).trim();
  if (!/^(?:(?:hey|ok)\s+\w+[,!]?\s*)?(?:can you\s+|please\s+)?(?:quiz me|test me|make (?:me )?(?:some )?flash ?cards|flash ?cards|study with me)\b/i.test(t)) return null;
  const colon = t.indexOf(':');
  if (colon > 0 && t.length - colon > 60) return { text: t.slice(colon + 1).trim().slice(0, 6000) };
  const topic = t
    .replace(/^.*?(?:quiz me|test me|flash ?cards|study with me)\s*/i, '')
    .replace(/^(?:on|about|for|from|in)\s+/i, '')
    .replace(/^(?:my|the)\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim();
  return { topic };
}

/** Asks the AI for flashcards: [{ q, a }] (up to `count`). Throws a friendly error if the AI can't be reached. */
export async function makeCards({ text = '', topic = '', model = 'llama3.2', count = 6 }) {
  const source = text
    ? `Make the questions ONLY from these notes:\n"""\n${text}\n"""`
    : `The topic: ${topic || 'general knowledge for a middle school student'}. Use facts a middle school student learns in class.`;
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0.4, num_predict: 900 },
      messages: [
        {
          role: 'system',
          content: `You make study flashcards for a student. Reply with JSON only: {"cards":[{"q":"short question","a":"short correct answer"}]}. Make ${count} cards. Questions must be clear and have one correct answer. Answers are 1 to 12 words. No made-up facts.`,
        },
        { role: 'user', content: source },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch((err) => {
    throw new Error(/ECONNREFUSED|fetch failed/i.test(String(err?.message)) ? 'I can’t reach my brain! Open the Ollama app and try again.' : 'My brain took too long. Try again!');
  });
  const data = await res.json().catch(() => ({}));
  let cards = [];
  try {
    const parsed = JSON.parse(data.message?.content ?? '{}');
    cards = (Array.isArray(parsed) ? parsed : parsed.cards ?? parsed.flashcards ?? []).map((c) => ({ q: String(c.q ?? c.question ?? '').trim(), a: String(c.a ?? c.answer ?? '').trim() }));
  } catch {}
  cards = cards.filter((c) => c.q.length > 3 && c.a).slice(0, count);
  if (!cards.length) throw new Error('I couldn’t make good flashcards from that. Try a clearer topic, like “quiz me on fractions”.');
  return cards;
}
