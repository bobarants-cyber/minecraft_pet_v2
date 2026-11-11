// Pocket Bbokari's brain: the Mac Bbokari's real skills, running on the phone. Built into one file by
// phone/build-brain.mjs (Node-only bits are swapped for phone stand-ins; saved things live in localStorage).
//
// BbokariBrain.handle(text) answers with { text, quiz?, open?, focus? } or null (null = just chat with the AI).
//   • on the phone: recipe math, reminders & timers (real iPhone notifications, repeating too), homework planner,
//     flashcards (Apple's on-device AI), memory, to-do list, calculator, coin/dice, weather, translate, focus timer,
//     Spotify ("play …" opens Spotify and searches it)
//   • things that use your Google account or your Mac (Classroom, grades, Gmail, "what did my teacher say",
//     presentations, Canva…): Bbokari says to ask him on your Mac.
import { recipeMath } from '../electron/recipeMath.js';
import { parseCommand, formatClock, formatDuration, repeatText } from '../electron/reminders.js';
import { looksLikePlan, makePlan, planText } from '../electron/planner.js';
import { Memory } from '../electron/memory.js';
import { Skills } from '../electron/skills.js';
import { parseQuiz } from '../electron/flashcards.js';
import { parsePlay, parseControl, songQuestion } from '../electron/spotify.js';

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

let env = { native: null, askAI: null, startFocus: null };

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

// ---------- things only the Mac Bbokari can do ----------
const MAC_ONLY = /\b(?:classroom|clasroom|homework|assignments?|due|grades?|exam back|graded|what did i get|my (?:exam|test|quiz) results?|teacher|profe|gmail|e-?mails?|inbox|catch me up|what did i miss|messages|junk|presentation|slides|canva|google docs?|write (?:me )?a doc|template|project|my classes|open my|on my mac|in my mac|nota|tarea)\b/i;
const MAC_TEXT = 'That one uses your Google account or your Mac, so ask me on your Mac 💻 (On the phone I can plan homework, quiz you, set reminders, do recipe math and more. Say “help”!)';

// ---------- flashcards with Apple's on-device AI ----------
async function makeCards(source, topic) {
  if (!env.askAI) return null;
  const rules = 'You make study flashcards for a student. Reply with JSON only, no other words: {"cards":[{"q":"short question","a":"short correct answer"}]}. Make 6 cards. Each question has one correct answer of 1 to 12 words. No made-up facts.';
  const prompt = source ? `Make the questions ONLY from these notes:\n"""\n${source.slice(0, 4000)}\n"""` : `The topic: ${topic}. Use facts a middle school student learns in class.`;
  const out = await env.askAI(rules, prompt);
  const json = String(out ?? '').match(/\{[\s\S]*\}/)?.[0];
  try {
    const cards = (JSON.parse(json).cards ?? []).map((c) => ({ q: String(c.q ?? c.question ?? '').trim(), a: String(c.a ?? c.answer ?? '').trim() })).filter((c) => c.q && c.a);
    return cards.length ? cards.slice(0, 8) : null;
  } catch {
    return null;
  }
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
💻 On your Mac: Classroom, grades, Gmail, “what did my teacher say”, presentations and Canva.`;

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
      if (!plan.due) return { text: 'When is it due? 📅 Try “plan my science project due Thursday”.' };
      for (const st of plan.steps) addReminder({ kind: 'reminder', at: st.at.getTime(), label: `📅 ${plan.title}: ${st.text}` });
      return { text: planText(plan) };
    }

    // Flashcards. "My next test" asks the Mac which test it is (from Classroom).
    const quiz = parseQuiz(said);
    if (quiz) {
      if (!env.askAI || (env.aiReady && !env.aiReady())) return { text: 'Flashcards need Apple Intelligence (iPhone 15 Pro or newer, turned on in Settings) 🃏' };
      const topic = quiz.topic;
      const title = topic || 'your notes';
      if (!quiz.text && (!topic || /\b(?:next|upcoming|my)\s+(?:\w+\s+)?(?:test|exam|quiz|prueba|examen)\b/i.test(topic))) {
        return { text: 'What’s it about? 🃏 Tell me the topic, like “quiz me on fractions” or “quiz me on the atom”. (To find your next test in Classroom, ask me on your Mac.)' };
      }
      const cards = await makeCards(quiz.text, topic);
      if (!cards) return { text: 'I couldn’t make good flashcards from that 😕 Try a clearer topic, like “quiz me on fractions”.' };
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
    if (MAC_ONLY.test(said)) return { text: MAC_TEXT };
    return null;
  },
};
window.BbokariBrain = BbokariBrain;
