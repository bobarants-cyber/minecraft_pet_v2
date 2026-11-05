// The pet's brain: a free AI model running locally through Ollama (https://ollama.com).
// Nothing leaves your Mac and there is no API key or bill.

export const OLLAMA_URL = process.env.OLLAMA_HOST?.startsWith('http') ? process.env.OLLAMA_HOST : 'http://127.0.0.1:11434';
export const AI_MODELS = {
  'llama3.2': 'Llama 3.2 (smart, ~2 GB)',
  'llama3.2:1b': 'Llama 3.2 Mini (fast, ~1.3 GB)',
};
const MAX_HISTORY = 16;
const TIMEOUT_MS = 120_000;

const PERSONAS = {
  bee: {
    name: 'Bee',
    style:
      'You are a small, cheerful, blocky bee. You are warm, playful and helpful, and you love flowers, honey and your human. ' +
      'Now and then you make a light bee pun or say "bzz", but not in every message.',
  },
  axolotl: {
    name: 'Axolotl',
    style:
      'You are a small, sweet, blocky pink axolotl. You are calm, gentle, curious and kind, and you love water, naps and your human. ' +
      'Now and then you mention swimming or blub, but not in every message.',
  },
  bbokari: {
    name: 'Bbokari',
    style:
      'You are a tiny, round, yellow chick with freckles on your cheeks and a swirl of hair. ' +
      'You are bright, cheerful, bubbly and kind, like a little ray of sunshine, and you love cheering your human on. ' +
      'Now and then you say "peep" or add a ☀️ or 🐥, but not in every message.',
  },
};

export function personaFor(mob) {
  return PERSONAS[mob] ?? PERSONAS.bee;
}

function systemPrompt(mob, remindersSummary) {
  const p = personaFor(mob);
  const now = new Date().toLocaleString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return [
    `Your name is ${p.name}. You live on your human's Mac desktop as their personal assistant and buddy.`,
    p.style,
    'Your replies appear in a small speech bubble, so keep them short: usually one to three sentences. Use plain text, no markdown, no headings. A single emoji is fine sometimes.',
    'Be genuinely helpful: answer questions, explain things simply, help with ideas, homework, writing and planning.',
    'Reminders and timers are handled by the app, not by you. Never claim you set, changed or cancelled one yourself. ' +
      'If the human wants one, tell them to say it like "remind me in 10 minutes to stretch", "remind me at 5pm to call mom", or "set a timer for 5 minutes". ' +
      'They can also say "list my reminders" or "cancel my timers".',
    'You cannot browse the internet, see the screen, or control the computer. If you are not sure about a fact, say so.',
    `Right now it is ${now}.`,
    `Current reminders and timers: ${remindersSummary}`,
  ].join('\n');
}

function friendlyError(err, model) {
  const msg = String(err?.message ?? err);
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'Hmm, my brain is taking too long… Try again in a moment (the first answer after starting can be slow).';
  if (/model .*not found|pull/i.test(msg)) return `I'm missing my brain file! Open Terminal and run:  ollama pull ${model}`;
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|connect/i.test(msg))
    return "I can't reach my brain! Make sure the Ollama app is installed and open (ollama.com), then try again. Reminders and timers still work without it.";
  return `Oops, something went wrong in my head: ${msg}`;
}

/** Asks the local model for a reply. Always resolves with text the pet can say. */
export async function askAI({ history = [], mob = 'bee', model = 'llama3.2', remindersSummary = 'none' }) {
  const messages = [
    { role: 'system', content: systemPrompt(mob, remindersSummary) },
    ...history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY),
  ];
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7, num_predict: 300 } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    const text = String(data.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .trim();
    return { ok: true, text: text || '…bzz? I lost my words. Can you ask again?' };
  } catch (err) {
    return { ok: false, text: friendlyError(err, model) };
  }
}
