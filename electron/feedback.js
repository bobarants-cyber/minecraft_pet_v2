// 📝 "What did my teacher say about my atom homework?" Bbokari searches for the right assignment with the details
// you give (class, topic words), then gathers everything the teacher said about it:
//   1. Google Classroom: the matching assignment, its state and grade (not just the newest one),
//   2. private comments: the Classroom API can't read them, but Classroom emails you a copy of each one, so Gmail,
//   3. comments the teacher left in the document you handed in (Google Drive comments),
//   4. your class journal (e.g. "Science Journal" in your Drive): the teacher's comments there.
// No Electron imports, so it can be tested with plain Node.
import { htmlToText, emailText } from './inbox.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CLASSROOM = 'https://classroom.googleapis.com/v1';
const DRIVE = 'https://www.googleapis.com/drive/v3';

const SUBJECTS = ['math', 'science', 'english', 'history', 'spanish', 'french', 'art', 'music', 'geography', 'biology', 'chemistry', 'physics', 'social', 'pe', 'computer', 'coding', 'arabic', 'korean', 'language', 'literature', 'religion', 'ict', 'design'];
const STOP = new Set('what did my the teacher say said about on in for of to a an and check tell me her his she he ms mr miss mrs sir homework assignment work comment comments feedback correction corrections wrote write class journal private doc document from that this last latest recent give find look please can you could was were is are i en la el de mi que dijo profe profesora profesor sobre tarea qué que me ciencias ciencia matemáticas matematicas mates del los las una'.split(' '));

/** Is this "what did my teacher say about …"? */
export function looksLikeFeedback(text) {
  return /\b(?:what (?:did|does|has) (?:my |the )?(?:[a-z]+ ){0,2}?(?:teacher|she|he|ms\.?|mr\.?|miss|mrs\.?|sir|profe)\b.{0,40}\b(?:say|said|write|wrote|comment|think)|teacher'?s? (?:comments?|feedback|corrections?|notes?)|(?:feedback|corrections?|comments?) (?:on|for|about|in) (?:my|the)|check what (?:the|my) teacher (?:said|wrote)|private comments?|qu[eé] (?:me )?(?:dijo|escribi[oó]|coment[oó]) (?:la|el) (?:profe|profesora|profesor|maestra|maestro))\b/i.test(text);
}

/** The details you gave: { subject, words, journal }. */
export function parseFeedbackQuery(text) {
  const t = text.toLowerCase();
  const subject = SUBJECTS.find((s) => new RegExp(`\\b${s}\\b`).test(t)) ?? (/\bciencias?\b/.test(t) ? 'science' : /\bmatem[aá]ticas?\b|\bmates\b/.test(t) ? 'math' : null);
  const words = [...new Set(t.split(/[^a-z0-9áéíóúñü]+/).filter((w) => w.length > 2 && !STOP.has(w) && w !== subject))];
  return { subject, words, journal: /\bjournal|diario|cuaderno|notebook\b/.test(t) };
}

const plain = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// "átomo" finds "Atom": no accents, and long words also match without their last letter.
const score = (hay, words) => {
  const h = plain(hay);
  return words.reduce((n, w) => {
    const p = plain(w);
    return n + (h.includes(p) || (p.length >= 5 && h.includes(p.slice(0, -1))) ? 1 : 0);
  }, 0);
};
const when = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
const clip = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));

/** The Classroom assignments that best match, newest first among equals: [{ course, work, sub }]. */
async function findWork(api, q) {
  const courses = (await api(`${CLASSROOM}/courses?courseStates=ACTIVE&studentId=me&pageSize=30`)).courses ?? [];
  // The class: by subject ("science") or a word in its name (the teacher's name, "Hayek"). Those words aren't topic words.
  const named = courses.filter((c) => q.words.some((w) => w.length > 3 && plain(c.name).includes(plain(w))));
  const inSubject = q.subject ? courses.filter((c) => c.name.toLowerCase().includes(q.subject)) : named;
  const pool = inSubject.length ? inSubject : courses;
  const courseWords = new Set(q.words.filter((w) => pool.some((c) => plain(c.name).includes(plain(w)))));
  q = { ...q, words: q.words.filter((w) => !courseWords.has(w)) };
  const found = [];
  for (const c of pool) {
    const work = (await api(`${CLASSROOM}/courses/${c.id}/courseWork?orderBy=updateTime%20desc&pageSize=40`).catch(() => ({}))).courseWork ?? [];
    for (const w of work) found.push({ course: c, work: w, s: score(`${w.title} ${w.description ?? ''}`, q.words) });
  }
  // With topic words: only matches, best first. Without: the most recently updated (graded or returned) ones.
  for (const f of found) f.s = score(`${f.work.title} ${f.work.description ?? ''}`, q.words);
  const hits = found.filter((f) => f.s > 0);
  const ranked = q.words.length && hits.length ? hits.sort((a, b) => b.s - a.s || b.work.updateTime.localeCompare(a.work.updateTime)) : found.sort((a, b) => b.work.updateTime.localeCompare(a.work.updateTime));
  const top = ranked.slice(0, 3);
  for (const f of top) {
    f.sub = ((await api(`${CLASSROOM}/courses/${f.course.id}/courseWork/${f.work.id}/studentSubmissions?userId=me`).catch(() => ({}))).studentSubmissions ?? [])[0] ?? null;
  }
  // Prefer ones the teacher has already returned or graded.
  return top.sort((a, b) => Number(b.sub?.state === 'RETURNED') - Number(a.sub?.state === 'RETURNED')).slice(0, 2);
}

/** Private comments, from Classroom's notification emails: [{ teacher, assignment, comment, at }]. */
async function privateComments(api, words, assignmentTitle) {
  const terms = assignmentTitle ? `"${assignmentTitle.replace(/"/g, '').slice(0, 60)}"` : words.slice(0, 3).join(' ');
  const q = encodeURIComponent(`from:classroom.google.com (comment OR comentario) ${terms} newer_than:90d`);
  const list = (await api(`${GMAIL}/messages?q=${q}&maxResults=6`).catch(() => ({}))).messages ?? [];
  const out = [];
  for (const { id } of list) {
    const msg = await api(`${GMAIL}/messages/${id}?format=full`).catch(() => null);
    if (!msg) continue;
    const subject = msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
    const from = (msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value ?? '').replace(/\s*\(.*?\)|<.*?>|"/g, '').trim();
    const body = (emailText(msg.payload) || htmlToText(msg.snippet ?? '')).replace(/\r/g, '');
    // Classroom's email: "<Teacher> added a private comment on <Assignment>" … the comment … "Reply" / "View".
    const comment = commentFromEmail(body);
    if (comment) out.push({ teacher: from.replace(/\s*via\s+.*$/i, '') || 'Your teacher', assignment: subject.replace(/^.*?(?:comment(?:ario)? (?:on|en|sobre)|:)\s*/i, '').replace(/^["“]|["”]$/g, ''), comment, at: Number(msg.internalDate) || Date.now() });
  }
  return out;
}

/** The comment text in a Classroom notification email. */
export function commentFromEmail(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => /private comment|comentario privado|added a comment|comment(?:ed)? on|coment[oó]/i.test(l));
  const stop = (l) => /^(?:reply|responder|view|ver|open|abrir|google classroom|google llc|you received|recibiste|this email|este correo|unsubscribe|notification settings|1600 amphitheatre)/i.test(l);
  const picked = [];
  for (const l of lines.slice(start >= 0 ? start + 1 : 0)) {
    if (stop(l)) break;
    if (/^https?:\/\//.test(l) || /^\W*$/.test(l)) continue;
    picked.push(l);
    if (picked.join(' ').length > 500) break;
  }
  return clip(picked.join(' ').trim(), 500);
}

/** Comments someone else (your teacher) left in a Google Doc: [{ who, said, on, at }]. */
async function docComments(api, fileId) {
  const fields = encodeURIComponent('comments(author(displayName,me),content,quotedFileContent(value),createdTime,resolved,replies(author(displayName,me),content,createdTime))');
  const res = await api(`${DRIVE}/files/${fileId}/comments?fields=${fields}&pageSize=60&includeDeleted=false`).catch(() => ({}));
  const out = [];
  for (const c of res.comments ?? []) {
    if (!c.author?.me) out.push({ who: c.author?.displayName ?? 'Teacher', said: clip(c.content, 300), on: clip(c.quotedFileContent?.value ?? '', 80), at: Date.parse(c.createdTime) || 0 });
    for (const r of c.replies ?? []) if (!r.author?.me && r.content) out.push({ who: r.author?.displayName ?? 'Teacher', said: clip(r.content, 300), on: clip(c.quotedFileContent?.value ?? '', 80), at: Date.parse(r.createdTime) || 0 });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Your class journal in Drive ("Science Journal", "Diario de ciencias"…): { id, name, link } or null. */
async function findJournal(api, subject) {
  const names = ['journal', 'diario', 'cuaderno', 'notebook'];
  const q = encodeURIComponent(`(${names.map((n) => `name contains '${n}'`).join(' or ')}) and mimeType = 'application/vnd.google-apps.document' and trashed = false`);
  const files = (await api(`${DRIVE}/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=20&fields=files(id,name,webViewLink)`)).files ?? [];
  const sub = subject ? files.filter((f) => f.name.toLowerCase().includes(subject) || (subject === 'science' && /cienc/i.test(f.name))) : [];
  const f = sub[0] ?? files[0];
  return f ? { id: f.id, name: f.name, link: f.webViewLink } : null;
}

/**
 * Everything the teacher said that matches your question, as a chat message. `driveOk` is false when the
 * Google sign-in doesn't include Drive yet (then doc and journal comments are skipped with a tip).
 */
export async function findFeedback(api, text) {
  const q = parseFeedbackQuery(text);
  const parts = [];
  const checked = [];
  let link = null;
  let driveBlocked = false;
  const tryDrive = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 403 || err.status === 401) driveBlocked = true;
      return null;
    }
  };

  // 1. The assignment in Classroom.
  let matches = [];
  try {
    matches = await findWork(api, q);
    checked.push('Classroom');
  } catch {}
  const best = matches[0];
  if (best) {
    link = best.sub?.alternateLink ?? best.work.alternateLink;
    const state = { RETURNED: 'returned to you', TURNED_IN: 'turned in (not returned yet)', CREATED: 'not turned in yet', NEW: 'not turned in yet', RECLAIMED_BY_STUDENT: 'unsubmitted' }[best.sub?.state] ?? '';
    const grade = best.sub?.assignedGrade != null ? ` · grade ${best.sub.assignedGrade}${best.work.maxPoints ? `/${best.work.maxPoints}` : ''}` : '';
    parts.push(`📚 “${best.work.title}” (${best.course.name.split(/\s+-\s+/)[0]})${state ? `: ${state}` : ''}${grade}`);
  }

  // 2. Private comments (from Classroom's emails).
  try {
    const pcs = await privateComments(api, q.words, best?.work.title);
    checked.push('private comments');
    for (const pc of pcs.slice(0, 3)) parts.push(`💬 Private comment from ${pc.teacher} (${when(pc.at)}): “${pc.comment}”`);
  } catch {}

  // 3. Comments in the document you handed in.
  const files = (best?.sub?.assignmentSubmission?.attachments ?? []).map((a) => a.driveFile).filter(Boolean).slice(0, 3);
  for (const f of files) {
    const cs = await tryDrive(() => docComments(api, f.id));
    if (cs) checked.push(`your doc “${f.title}”`);
    for (const c of (cs ?? []).slice(0, 4)) parts.push(`📝 In “${f.title}”${c.on ? ` on “${c.on}”` : ''}: ${c.who} wrote “${c.said}”`);
  }

  // 4. Your class journal (always when you mention it; otherwise if nothing else turned up).
  const docFound = parts.some((p) => p.startsWith('📝') || p.startsWith('💬'));
  if (q.journal || !docFound) {
    const j = await tryDrive(() => findJournal(api, q.subject ?? best?.course.name.toLowerCase().match(new RegExp(`\\b(${SUBJECTS.join('|')})\\b`))?.[1]));
    if (j) {
      const cs = await tryDrive(() => docComments(api, j.id));
      checked.push(`your journal “${j.name}”`);
      // With topic words, comments about them first.
      const ranked = (cs ?? []).map((c) => ({ ...c, s: score(`${c.said} ${c.on}`, q.words) })).sort((a, b) => b.s - a.s || b.at - a.at);
      for (const c of ranked.slice(0, 4)) parts.push(`📓 In your ${j.name}${c.on ? ` on “${c.on}”` : ''} (${when(c.at)}): ${c.who} wrote “${c.said}”`);
      if (!link) link = j.link;
    }
  }

  const said = parts.filter((p) => !p.startsWith('📚'));
  if (!parts.length || (!said.length && !best)) {
    return { text: `I looked in ${checked.join(', ') || 'Classroom'} but couldn’t find that 🤔 Give me more details, like the class and a word from the title (“what did my science teacher say about the atom model?”).${driveBlocked ? DRIVE_TIP : ''}`, link: null };
  }
  const head = said.length ? '🔍 Here’s what your teacher said:' : '🔍 I found the assignment, but no comments from your teacher yet:';
  return { text: `${head}\n${parts.join('\n')}\n(Checked: ${checked.join(', ')}.)${driveBlocked ? DRIVE_TIP : ''}`, link };
}

const DRIVE_TIP = '\n💡 To read comments in your docs and journal, reconnect Google once: menu bar → 📬 Inbox → Disconnect Google, then Connect again and press Allow.';
