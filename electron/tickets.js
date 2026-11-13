// 🎟 Ticket helper: be ready the second tickets go on sale, the legal way (no buying bots: ticket sites ban them and
// cancel orders). "Tickets for Stray Kids go on sale on Nov 20 at 10am https://www.ticketmaster.es/…" or
// "las entradas de Stray Kids salen el 20 de noviembre a las 10" →
//   • the day before: a checklist (sign in, card saved, bank app for the code, presale code)
//   • 15 minutes before: the last checks
//   • 2 minutes before: the official ticket page opens by itself, so you're in the waiting room in time
//   • the second it starts: "GO!"
// No Electron imports, so it can be tested with plain Node.

const MONTHS = [
  ['jan', 'ene', 'enero', 'january'], ['feb', 'febrero', 'february'], ['mar', 'marzo', 'march'], ['apr', 'abr', 'abril', 'april'], ['may', 'mayo'], ['jun', 'junio', 'june'],
  ['jul', 'julio', 'july'], ['aug', 'ago', 'agosto', 'august'], ['sep', 'sept', 'septiembre', 'setiembre', 'september'], ['oct', 'octubre', 'october'], ['nov', 'noviembre', 'november'], ['dec', 'dic', 'diciembre', 'december'],
];
const DAYS = [['sun', 'sunday', 'domingo'], ['mon', 'monday', 'lunes'], ['tue', 'tuesday', 'martes'], ['wed', 'wednesday', 'miercoles', 'miércoles'], ['thu', 'thursday', 'jueves'], ['fri', 'friday', 'viernes'], ['sat', 'saturday', 'sabado', 'sábado']];
const monthOf = (w) => MONTHS.findIndex((g) => g.includes(w.toLowerCase().replace(/\.$/, '')));

/** Is this about a ticket sale? */
export function looksLikeTickets(text) {
  return /\b(?:tickets?|entradas?|boletos?|presale|pre-?sale|preventa|on ?sale|onsale|salen a la venta|venta de entradas)\b/i.test(text);
}

/** The sale time in text like "Nov 20 at 10am", "20 de noviembre a las 10", "tomorrow at 9:30", "el viernes a las 10h", "20/11 10:00". */
export function parseSaleTime(text, now = new Date()) {
  const t = text.toLowerCase();
  let day = null;
  let m;
  if (/\b(?:today|hoy)\b/.test(t)) day = new Date(now);
  else if (/\btomorrow\b/.test(t) || /(?<!de la )\bmañana\b/.test(t)) {
    day = new Date(now);
    day.setDate(day.getDate() + 1);
  } else if ((m = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-zé]{3,10})\.?\b/)) && monthOf(m[2]) >= 0) {
    day = new Date(now.getFullYear(), monthOf(m[2]), Number(m[1]));
  } else if ((m = t.match(/\b([a-zé]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/)) && monthOf(m[1]) >= 0) {
    day = new Date(now.getFullYear(), monthOf(m[1]), Number(m[2]));
  } else if ((m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/))) {
    // Spain writes day/month.
    day = new Date(m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear(), Number(m[2]) - 1, Number(m[1]));
  } else {
    const d = DAYS.findIndex((g) => g.some((w) => new RegExp(`\\b${w}\\b`).test(t)));
    if (d >= 0) {
      day = new Date(now);
      day.setDate(day.getDate() + (((d - now.getDay() + 7) % 7) || 7));
    }
  }
  // The time: "at 10am", "a las 10", "10:00", "10h", "10 de la mañana", "a las 6 de la tarde".
  const tm = t.match(/\b(?:at|a las|a la|@)\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|h)?/) ?? t.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|h)?\b/) ?? t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (!day || !tm) return null;
  let hour = Number(tm[1]);
  const minute = tm[2] && /^\d+$/.test(tm[2]) ? Number(tm[2]) : 0;
  const mer = (tm[3] ?? (/^(?:am|pm)$/.test(tm[2] ?? '') ? tm[2] : '') ?? '').replace(/\./g, '');
  if (/pm/.test(mer) && hour < 12) hour += 12;
  if (/am/.test(mer) && hour === 12) hour = 0;
  if (!mer && /\bde la (?:tarde|noche)\b/.test(t) && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return null;
  day.setHours(hour, minute, 0, 0);
  if (day < now) day.setFullYear(day.getFullYear() + 1); // "Jan 10" said in December → next year
  return day;
}

/** "Tickets for Stray Kids go on sale…" → { event, at, link } (at may be null if no time was given). */
export function parseTicketSale(text, now = new Date()) {
  if (!looksLikeTickets(text)) return null;
  const link = text.match(/https:\/\/[^\s"'<>]+/)?.[0] ?? null;
  const at = parseSaleTime(text.replace(link ?? '', ' '), now);
  const ev =
    text.match(/\b(?:tickets?|entradas?|boletos?)\s+(?:for|to|para|de|del)\s+(?:the\s+|el\s+|la\s+|los\s+)?(.+?)(?:\s+(?:concert|show|tour|concierto|gira))?(?:\s+(?:go(?:es)?\s+on\s+sale|salen|are|go|is|on|el|at|a las)\b|\s*,|\s*\??$)/i)?.[1] ??
    text.match(/\b(?:ticket sale|preventa|presale|venta)\s+(?:for|de|del)?\s*(.+?)(?:\s+(?:on|el|at|a las|is|es),?|,|$)/i)?.[1] ??
    text.match(/^(?:(?:hey|ok)\s+\w+[,!]?\s*)?(.+?)\s+(?:tickets?|entradas?)\b/i)?.[1] ??
    '';
  return { event: cleanEvent(ev), at, link, question: /^(?:(?:hey|ok)\s+\w+[,!]?\s*)?(?:when|cu[aá]ndo|what time|a qu[eé] hora)\b/i.test(text.trim()) };
}

/** "KATSEYE 25/11", "Hearts2Hearts mañana", "when do stray kids" → just the name. */
function cleanEvent(ev) {
  const words = [...MONTHS.flat(), ...DAYS.flat(), 'today', 'tomorrow', 'hoy', 'mañana', 'when', 'do', 'does', 'cuando', 'cuándo', 'what', 'time', 'my', 'the', 'la', 'las', 'los', 'el', 'on', 'at', 'go', 'goes', 'sale'];
  const out = String(ev)
    .replace(/https:\/\/\S+/g, '')
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, '')
    .replace(/\b(?:at|a las?)\s+\d{1,2}(?:[:.h]\d{2})?\s*(?:am|pm|h)?\b.*$/i, '')
    .split(/\s+/)
    .filter((w) => w && !words.includes(w.toLowerCase().replace(/[.,]$/, '')) && !/^\d{1,2}(?:st|nd|rd|th)?[.,]?$/.test(w))
    .join(' ')
    .replace(/[,.]+$/, '')
    .trim();
  return out.slice(0, 50) || 'the concert';
}

/** Where to find the official sale (Spain first). */
export function findSaleLinks(event) {
  const q = encodeURIComponent(event);
  return [
    `https://www.ticketmaster.es/search?q=${q}`,
    `https://www.google.com/search?q=${encodeURIComponent(`${event} entradas venta fecha preventa`)}`,
  ];
}

/** The reminders to set: [{ at, label, url?, effect? }] (only ones still in the future). */
export function salePlan({ event, at, link }, now = new Date()) {
  const t = at.getTime();
  const steps = [
    {
      step: 'day',
      at: t - 24 * 3600_000,
      label: `🎟 ${event} tickets tomorrow at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}! Today: sign in on the ticket site, save your card (check it hasn’t expired), make sure your bank app works for the payment code, find your presale / fan code, and decide which zone and how many tickets (plus a plan B).`,
    },
    { step: 'checks', at: t - 15 * 60_000, label: `🎟 ${event} tickets in 15 minutes! Sign in now, phone next to you for the bank code, good Wi-Fi, Mac charged, close heavy apps. Use ONE tab on ONE device.` },
    { step: 'open', at: t - 2 * 60_000, label: `🎟 ${event}: 2 minutes! ${link ? 'I’m opening the ticket page now.' : 'Open the ticket page now.'} When you’re in the queue, DON’T refresh.`, url: link ?? undefined },
    { step: 'go', at: t, label: `🎟 GO GO GO! ${event} tickets are on sale NOW! 🍀`, effect: 'dance' },
  ];
  return steps.filter((s) => s.at > now.getTime() + 30_000);
}

export const CHECKLIST = `🎟 How to get tickets fast (the legal way):
1. Make an account on the ticket site days before, and sign in early on the day
2. Save your card and check it hasn’t expired; keep your phone close for the bank’s payment code (in Spain almost every card asks for it)
3. Register for presales / fan sales and keep the code handy
4. Know which zone, how many tickets, and a plan B zone before it starts
5. ONE tab on ONE device: many tabs can get you kicked out of the queue
6. Good Wi-Fi, Mac charged, heavy apps closed
7. In the waiting room: don’t refresh, don’t go back
8. Only buy from the official site (or its official resale). Never from strangers on social media 🚫`;
