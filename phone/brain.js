// Pocket Bbokari's brain: the Mac Bbokari's real skills, running on the phone. Built into one file by
// phone/build-brain.mjs (Node-only bits are swapped for phone stand-ins; saved things live in localStorage).
//
// BbokariBrain.handle(text) answers with { text, quiz?, open?, focus? } or null (null = just chat with the AI).
//   • on the phone: recipe math, reminders & timers (real iPhone notifications, repeating too), homework planner,
//     flashcards (Apple's on-device AI), memory, to-do list, calculator, coin/dice, weather, translate, focus timer,
//     Spotify ("play …" opens Spotify and searches it)
//   • your Google account, signed in on the phone ("connect google <your iOS client ID>"): grades, homework due,
//     "what did my teacher say", new emails, flashcards for your next test, planning with real due dates
//   • your Mac, as a backup (same Wi-Fi, "link my mac <address> <code>"): everything the Mac Bbokari can do,
//     presentations and Canva included
import { recipeMath } from '../electron/recipeMath.js';
import { parseCommand, formatClock, formatDuration, repeatText } from '../electron/reminders.js';
import { looksLikePlan, makePlan, planText } from '../electron/planner.js';
import { Memory } from '../electron/memory.js';
import { Skills } from '../electron/skills.js';
import { parseQuiz } from '../electron/flashcards.js';
import { parsePlay, parseControl, songQuestion } from '../electron/spotify.js';
import { fetchGrades, formatDue, gradeLine, parseFrom, upcomingWork } from '../electron/inbox.js';
import { findFeedback, looksLikeFeedback } from '../electron/feedback.js';

// The Mac code reads emails with Node's Buffer; a tiny phone version (base64 ↔ text).
if (!globalThis.Buffer) {
  globalThis.Buffer = {
    from(data, enc) {
      const bytes = enc === 'base64' ? Uint8Array.from(atob(String(data).replace(/[^A-Za-z0-9+/=]/g, '')), (c) => c.charCodeAt(0)) : new TextEncoder().encode(String(data));
      return {
        toString(e) {
          if (e !== 'base64') return new TextDecoder().decode(bytes);
          let bin = '';
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          return btoa(bin);
        },
      };
    },
  };
}

const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(`bbokari.${k}`)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`bbokari.${k}`, JSON.stringify(v));
    } catch {}
  },
};

let env = { native: null, askAI: null, startFocus: null, googleApi: null, googleConnect: null, googleConnected: () => false };

// ---------- memory & to-do list, saved on the phone ----------
const memory = new Memory('memory.json');
memory.facts = store.get('memory', []);
memory.save = () => store.set('memory', memory.facts);

const settings = store.get('settings', { homeCity: '' });
const skills = new Skills({
  dir: '',
  settings,
  saveSettings: (patch) => (Object.assign(settings, patch), store.set('settings', settings)),
  translate: async (text, to) => (env.askAI ? env.askAI('You translate text. Reply with only the translation, nothing else.', `Translate into ${to}: ${text}`) : null),
  startFocus: (minutes) => env.startFocus?.(minutes),
  stopFocus: () => env.native?.({ cmd: 'focusStop' }),
  focusLeft: () => null,
});
skills.todos.items = store.get('todos', []);
skills.todos.save = () => store.set('todos', skills.todos.items);

// ---------- reminders → iPhone notifications ----------
let reminders = store.get('reminders', []);
const saveReminders = () => store.set('reminders', reminders);
function notify(r) {
  env.native?.({ cmd: 'notify', id: `bbokari-${r.id}`, at: r.at, title: r.kind === 'timer' ? '⏰ Timer done!' : '⏰ Bbokari reminder', body: r.kind === 'timer' ? `Your ${formatDuration(r.duration ?? 0)} timer is done!` : r.label ?? 'This is your reminder!', repeat: r.repeat ?? null });
}
function addReminder(r) {
  const item = { id: Date.now() + Math.floor(Math.random() * 1000), ...r };
  reminders.push(item);
  saveReminders();
  notify(item);
  return item;
}
function liveReminders() {
  const now = Date.now();
  reminders = reminders.filter((r) => r.repeat || r.at > now);
  saveReminders();
  return reminders.sort((a, b) => a.at - b.at);
}
function remindersReply(cmd) {
  if (cmd.type === 'list') {
    const list = liveReminders();
    if (!list.length) return 'You don’t have any reminders or timers right now.';
    return `Here’s what I’m keeping track of:\n${list
      .map((r) => `• ${r.kind === 'timer' ? `a ${formatDuration(r.duration ?? 0)} timer` : `“${r.label ?? 'reminder'}”`} ${r.repeat ? `${repeatText(r.repeat)} at ${formatClock(r.at)}` : `at ${formatClock(r.at)}`}`)
      .join('\n')}`;
  }
  if (cmd.type === 'cancel') {
    const gone = liveReminders().filter((r) => !cmd.kind || r.kind === cmd.kind);
    if (!gone.length) return 'Nothing to cancel!';
    env.native?.({ cmd: 'unnotify', ids: gone.map((r) => `bbokari-${r.id}`) });
    reminders = reminders.filter((r) => !gone.includes(r));
    saveReminders();
    return `Done! I cancelled ${gone.length} ${cmd.kind ?? 'item'}${gone.length === 1 ? '' : 's'}.`;
  }
  if (cmd.type === 'needTime') return cmd.kind === 'timer' ? 'How long? Try “set a timer for 5 minutes”.' : 'When? Try “remind me in 10 minutes to stretch” or “remind me every Monday at 4pm to practice piano”.';
  if (cmd.type === 'add') {
    const r = addReminder(cmd);
    const noPush = env.native ? '' : ' (Notifications only work in the Bbokari app.)';
    if (r.kind === 'timer') return `⏲ Timer set for ${formatDuration(r.duration)}! I’ll buzz at ${formatClock(r.at)}.${noPush}`;
    if (r.repeat) return `Okay! I’ll remind you${r.label ? ` to ${r.label}` : ''} ${repeatText(r.repeat)} at ${formatClock(r.at)} 🔁${noPush}`;
    return `Okay! I’ll remind you${r.label ? ` to ${r.label}` : ''} ${r.duration ? `in ${formatDuration(r.duration)}` : `at ${formatClock(r.at)}`} ⏰${noPush}`;
  }
  return null;
}

// ---------- your Google account, on the phone ----------
async function api(url) {
  const { status, body } = await env.googleApi(url);
  let data = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch {}
  if (status >= 400) throw Object.assign(new Error(data.error?.message || data.error || `Google said ${status}`), { status });
  return data;
}
const noState = { data: {}, seen: () => false };
const isTest = (w) => /\b(?:test|exam|quiz|assessment|midterm|final|prueba|examen|evaluaci[oó]n|control)\b/i.test(`${w.title} ${w.text ?? ''}`);
const GRADES = /\b(?:my grades?|what grades?|which grades?|what did i get|did i get (?:my )?(?:\w+ )?(?:exam|test|quiz|grade)s? back|exam results?|test results?|my results|qu[eé] nota|mis notas|mis calificaciones)\b/i;
const HOMEWORK = /\b(?:homework|what(?:'s| is) due|due this week|assignments?|check (?:my )?classroom|clasroom|what do i have to do|tareas?)\b/i;
const EMAIL = /\b(?:catch me up|what did i miss|new (?:e-?mails?|messages)|check (?:my )?(?:e-?mails?|gmail|inbox)|any (?:e-?mails?|messages))\b/i;

async function googleAnswer(said) {
  try {
    if (looksLikeFeedback(said)) return (await findFeedback(api, said)).text;
    if (GRADES.test(said)) {
      const got = await fetchGrades(api, noState, { all: true, days: 30 });
      if (!got.length) return 'I don’t see any graded work from the last 30 days yet 📭';
      return `🎓 Your recent grades:\n${got.slice(0, 8).map((g) => `• ${new Date(g.time).toLocaleDateString([], { month: 'short', day: 'numeric' })}: ${gradeLine(g.grade)}`).join('\n')}`;
    }
    if (EMAIL.test(said)) {
      const q = encodeURIComponent('is:unread in:inbox -category:promotions -category:social newer_than:3d');
      const list = (await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=8`)).messages ?? [];
      if (!list.length) return 'You’re all caught up! No new emails 📭✨';
      const lines = [];
      for (const { id } of list) {
        const m = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null);
        const h = (n) => m?.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
        if (m) lines.push(`• ${parseFrom(h('from')).name}: ${h('subject') || '(no subject)'}`);
      }
      return `📧 ${lines.length} new email${lines.length === 1 ? '' : 's'}:\n${lines.join('\n')}\n(Open Gmail to read them. On your Mac I can sum them up and help you reply!)`;
    }
    if (HOMEWORK.test(said)) {
      const work = await upcomingWork(api);
      if (!work.length) return 'Nothing due in Classroom this week! 🎉';
      return `📚 Due this week:\n${work.slice(0, 8).map((w) => `• ${w.course.split(/\s+-\s+/)[0]}: ${w.title} (${formatDue(new Date(w.due))})`).join('\n')}\nWant a plan? Say “plan ${work[0].title} due ${new Date(work[0].due).toLocaleDateString([], { weekday: 'long' })}”.`;
    }
  } catch (err) {
    return err.status === 401 || /not signed in/i.test(err.message) ? 'My Google sign-in on the phone expired 😕 Say “connect google” to sign in again.' : `I couldn’t check Google: ${String(err.message).slice(0, 120)}`;
  }
  return null;
}

// ---------- your Mac (same Wi-Fi), as a backup ----------
let mac = store.get('mac', null); // { host, code }
async function macFetch(pathname, body) {
  if (!mac) throw new Error('not linked');
  const res = await fetch(`http://${mac.host}:4520${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Bbokari-Code': mac.code, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(pathname === '/ask' ? 60000 : 6000),
  });
  if (res.status === 401) throw new Error('code');
  if (!res.ok) throw new Error(`Mac said ${res.status}`);
  return res.json();
}
async function askMac(text) {
  try {
    const r = await macFetch('/ask', { text });
    return r.text ? `💻 ${r.text}` : 'My Mac didn’t answer 🤔';
  } catch (err) {
    return err.message === 'code'
      ? 'My Mac says the code is wrong 🤔 On your Mac: menu bar → Bbokari → 📱 Phone link, and tell me the new “link my mac …” sentence.'
      : 'I can’t reach your Mac right now 💻 Is Bbokari open there and are we on the same Wi-Fi?';
  }
}

// ---------- things that need Google or the Mac ----------
const MAC_ONLY = /\b(?:classroom|clasroom|homework|assignments?|due|grades?|exam back|graded|what did i get|my (?:exam|test|quiz) results?|teacher|profe|gmail|e-?mails?|inbox|catch me up|what did i miss|messages|junk|presentation|slides|canva|google docs?|write (?:me )?a doc|template|project|my classes|open my|on my mac|in my mac|nota|tarea)\b/i;
const NEEDS_SETUP = 'For that I need your Google account or your Mac 💻 Two ways:\n• Sign in on the phone: say “connect google” and paste your iOS client ID (Claude can show you how to make it).\n• Or on your Mac: menu bar → Bbokari → 📱 Phone link → Turn on, then tell me the “link my mac …” sentence it shows.';

/** Google on the phone first; then the Mac; then how to set one up. */
async function needsAccount(said) {
  if (env.googleConnected?.()) {
    const a = await googleAnswer(said);
    if (a) return a;
  }
  if (mac) return askMac(said);
  return env.googleConnected?.() ? 'That one only works on your Mac (presentations, Canva…) 💻 Turn on 📱 Phone link there to use it from here!' : NEEDS_SETUP;
}

// ---------- flashcards with Apple's on-device AI ----------
/** Flashcards out of whatever the AI wrote: "Q: … / A: …" lines, JSON (any key names), or "question? – answer". */
export function cardsFrom(out) {
  const text = String(out ?? '').replace(/\*\*|__|`/g, '');
  const tidy = (x) => String(x ?? '').replace(/^["“\s]+|["”\s]+$/g, '').trim();
  let cards = [];
  // 1. Q: … / A: …
  for (const m of text.matchAll(/(?:^|\n)\s*(?:[-•*]\s*)?(?:\d+[.)]\s*)?(?:Q(?:uestion)?|Front|Pregunta)\s*\d*\s*[:.)\-–]\s*(.+?)\s*\n+\s*(?:[-•*]\s*)?(?:A(?:nswer)?|Back|Respuesta)\s*\d*\s*[:.)\-–]\s*(.+)/gi)) cards.push({ q: tidy(m[1]), a: tidy(m[2]) });
  // 2. JSON, with any of the usual key names.
  if (!cards.length) {
    const json = text.match(/[[{][\s\S]*[\]}]/)?.[0];
    try {
      const data = JSON.parse(json);
      const list = Array.isArray(data) ? data : data.cards ?? data.flashcards ?? Object.values(data).find(Array.isArray) ?? [];
      cards = list.map((c) => ({ q: tidy(c.q ?? c.question ?? c.front ?? c.term ?? c.prompt), a: tidy(c.a ?? c.answer ?? c.back ?? c.definition ?? c.response) }));
    } catch {}
  }
  // 3. "What is 1/2 + 1/4? – 3/4"
  if (!cards.length) for (const m of text.matchAll(/^\s*(?:[-•*]\s*)?(?:\d+[.)]\s*)?(.+?\?)\s*[-–—:=]+\s*(.+)$/gm)) cards.push({ q: tidy(m[1]), a: tidy(m[2]) });
  return cards.filter((c) => c.q.length > 3 && c.a).slice(0, 8);
}

/** { cards } or { error: 'noanswer' | 'unreadable' }. Asks twice if the first answer can't be read. */
async function makeCards(source, topic) {
  if (!env.askAI) return { error: 'noanswer' };
  const rules = 'You make study flashcards for a middle school student. Write exactly 6 flashcards and nothing else, in this format:\nQ: a short question\nA: the short correct answer\n\nQ: ...\nA: ...\nEach answer is 1 to 12 words. Only true facts.';
  const prompt = source ? `Make the flashcards ONLY from these notes:\n---\n${source.slice(0, 4000)}\n---` : `Make the flashcards about: ${topic}`;
  let answered = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await env.askAI(rules, attempt ? `${prompt}\n(Remember: only lines starting with "Q:" and "A:".)` : prompt);
    if (out) answered = true;
    const cards = cardsFrom(out);
    if (cards.length) return { cards };
  }
  return { error: answered ? 'unreadable' : 'noanswer' };
}

const HELP = `Here’s what I can do on your phone ✨
📅 “plan my science test due Friday” (with reminders)
🃏 “quiz me on fractions” (flashcards)
⏰ “remind me every Monday at 4pm to practice piano”, “set a timer for 10 minutes”
🍚 “scale the recipe from 4 to 6: rice 1 1/2 cups, egg 4”
🧠 “remember that my math teacher is Ms. Lopez”
☑️ “add math homework to my list”
🎵 “play Back Door” (opens Spotify)
🧮 “what is 15% of 80”, 🌍 “translate thank you to korean”, 🍅 “focus”
🎓 With Google (“connect google”): “what did I get on my exam?”, “what homework do I have?”, “catch me up”, “what did my science teacher say about the atom model?”, “quiz me on my next test”
💻 With your Mac (“link my mac …”): all of that plus presentations and Canva.`;

// ---------- the brain ----------
export const BbokariBrain = {
  setup(e) {
    env = { ...env, ...e };
  },
  memoryContext: () => memory.context(),

  async handle(input) {
    const said = String(input).trim();
    if (!said) return null;

    if (/^(?:help|what can you do|what else can you do|features|everything you can do|qu[eé] puedes hacer|ayuda)\??$/i.test(said)) return { text: HELP };

    // Google on the phone: "connect google 123-abc.apps.googleusercontent.com" (once), then just "connect google".
    const g = said.match(/^(?:connect|sign in to|link|log ?in to)\s+(?:my\s+)?google(?:\s+account)?(?:\s+([\w.-]+\.apps\.googleusercontent\.com))?$/i);
    if (g) {
      if (!env.googleConnect) return { text: 'Signing in to Google works in the Bbokari iPhone app.' };
      const saved = store.get('googleClientId', '');
      const id = g[1] ?? saved;
      if (!id) return { text: 'Paste your Google iOS client ID after it, like: “connect google 1234-abcd.apps.googleusercontent.com” (Claude can show you how to make one).' };
      store.set('googleClientId', id);
      const r = await env.googleConnect(id);
      return { text: r.ok ? `🎉 Signed in as ${r.email}! Now ask me “what did I get on my exam?”, “what homework do I have?” or “catch me up”.` : `Google sign-in didn’t work: ${r.error}` };
    }
    if (/^(?:disconnect|sign out of|log ?out of)\s+(?:my\s+)?google$/i.test(said)) {
      env.native?.({ cmd: 'googleDisconnect' });
      env.googleSignedOut?.();
      return { text: 'Signed out of Google on the phone.' };
    }
    // Your Mac: "link my mac 192.168.1.20 123456".
    const link = said.match(/^(?:link|connect)(?:\s+to)?\s+(?:my\s+)?mac\s+([\w.-]+)\s+(\d{6})$/i);
    if (link) {
      mac = { host: link[1], code: link[2] };
      try {
        const r = await macFetch('/ping');
        store.set('mac', mac);
        return { text: `💻 Linked to your Mac${r.name ? ` (${r.name})` : ''}! When we’re on the same Wi-Fi I can use everything it can do 🎉` };
      } catch (err) {
        mac = store.get('mac', null);
        return { text: err.message === 'code' ? 'That code didn’t work 🤔 Check it on your Mac: menu bar → Bbokari → 📱 Phone link.' : 'I couldn’t reach your Mac 😕 Is Bbokari open there, Phone link turned on, and are we on the same Wi-Fi?' };
      }
    }
    if (/^(?:unlink|disconnect)(?:\s+from)?\s+(?:my\s+)?mac$/i.test(said)) {
      mac = null;
      store.set('mac', null);
      return { text: 'Okay, I’m not linked to your Mac anymore.' };
    }

    // Recipe math.
    const math = recipeMath(said);
    if (math) return { text: math };

    // Reminders and timers.
    const cmd = parseCommand(said);
    if (cmd) return { text: remindersReply(cmd) };

    // Memory.
    const mem = memory.handle(said);
    if (mem) return { text: mem };

    // Homework planner (with reminders). Without a date, the Mac may know it from Classroom.
    if (looksLikePlan(said)) {
      const plan = makePlan(said);
      if (!plan.due) {
        // The due date from Classroom (Google on the phone, or the Mac).
        if (env.googleConnected?.()) {
          const work = await upcomingWork(api).catch(() => []);
          const words = said.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !['plan', 'homework', 'project', 'help'].includes(w));
          const w = work.find((x) => words.some((y) => `${x.title} ${x.course}`.toLowerCase().includes(y)));
          if (w) {
            const p2 = makePlan(said, { due: new Date(w.due), title: w.title, projectText: w.text ?? '' });
            for (const st of p2.steps) addReminder({ kind: 'reminder', at: st.at.getTime(), label: `📅 ${p2.title}: ${st.text}` });
            return { text: planText(p2) };
          }
        } else if (mac) return { text: await askMac(said) };
        return { text: 'When is it due? 📅 Try “plan my science project due Thursday”.' };
      }
      for (const st of plan.steps) addReminder({ kind: 'reminder', at: st.at.getTime(), label: `📅 ${plan.title}: ${st.text}` });
      return { text: planText(plan) };
    }

    // Flashcards. "My next test" asks the Mac which test it is (from Classroom).
    const quiz = parseQuiz(said);
    if (quiz) {
      if (!env.askAI || (env.aiReady && !env.aiReady())) return { text: 'Flashcards need Apple Intelligence (iPhone 15 Pro or newer, turned on in Settings) 🃏' };
      let topic = quiz.topic;
      let title = topic || 'your notes';
      if (!quiz.text && (!topic || /\b(?:next|upcoming|my)\s+(?:\w+\s+)?(?:test|exam|quiz|prueba|examen)\b/i.test(topic))) {
        let t = null;
        try {
          if (env.googleConnected?.()) {
            const work = await upcomingWork(api);
            t = work.find(isTest) ?? null;
          } else if (mac) t = await macFetch('/next-test');
        } catch {}
        if (!t?.title) return { text: env.googleConnected?.() || mac ? 'I don’t see a test in Classroom this week 🤔 Tell me the topic: “quiz me on …”.' : 'What’s it about? 🃏 Tell me the topic, like “quiz me on fractions”. (Or connect Google so I can find your next test.)' };
        topic = `${t.course}: ${t.title}. ${t.text ?? ''}`.slice(0, 600);
        title = t.title;
      }
      const made = await makeCards(quiz.text, topic);
      if (made.error === 'noanswer') return { text: 'My on-device brain didn’t answer 😕 Check Settings → Apple Intelligence & Siri: it must be on and finished downloading. Then try again!' };
      if (made.error) return { text: 'My brain answered in a way I couldn’t turn into cards 😕 Try once more, it often works the second time!' };
      const { cards } = made;
      return { text: `🃏 ${cards.length} flashcards on “${title.slice(0, 40)}”!`, quiz: { title, cards } };
    }

    // Spotify: on the phone Bbokari opens Spotify's search (iPhone apps can't press play inside Spotify).
    const song = parsePlay(said);
    if (song && song.kind !== 'resume') {
      return { text: `🎵 Opening Spotify for “${song.query}”! Tap the song to play it.`, open: `spotify:search:${encodeURIComponent(song.query)}`, fallback: `https://open.spotify.com/search/${encodeURIComponent(song.query)}` };
    }
    if (parseControl(said) || songQuestion(said)) {
      return { text: 'On the phone I can’t control Spotify or see what it’s playing 🎧 Use the buttons in Spotify or Control Center. (On your Mac I can!)' };
    }

    // Quick skills: calculator, time, coin, dice, to-do list, weather, translate, focus.
    const quick = await skills.handle(said).catch(() => null);
    if (quick) return { text: quick.text };

    // Things only the Mac can do (Classroom, grades, Gmail, presentations…).
    if (MAC_ONLY.test(said) || looksLikeFeedback(said) || GRADES.test(said) || EMAIL.test(said)) return { text: await needsAccount(said) };
    return null;
  },
};
window.BbokariBrain = BbokariBrain;
