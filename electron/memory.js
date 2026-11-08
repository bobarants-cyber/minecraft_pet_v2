// 🧠 Things you ask Bbokari to remember ("remember that my math teacher is Ms. Lopez"). They're saved on this Mac
// and given to the AI with every question, so he really knows you. No Electron imports, so it can be tested with Node.
import fs from 'node:fs';
import path from 'node:path';

const MAX = 60;

/** "my teacher is Ms. Lopez" → "your teacher is Ms. Lopez", for saying it back. */
const toYou = (t) => t.replace(/\bmy\b/gi, 'your').replace(/\bI am\b/gi, 'you are').replace(/\bI'm\b/gi, 'you’re').replace(/\bI\b/g, 'you').replace(/\bme\b/gi, 'you').replace(/\bmine\b/gi, 'yours');

export class Memory {
  constructor(file) {
    this.file = file;
    try {
      this.facts = JSON.parse(fs.readFileSync(file, 'utf8')).filter((f) => f && typeof f.text === 'string');
    } catch {
      this.facts = [];
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.facts, null, 2));
    } catch {}
  }

  /** For the AI: what you've told him (newest first, kept short). */
  context() {
    if (!this.facts.length) return '';
    return `Things the student asked you to remember about them (use these when they help): ${this.facts
      .slice(-25)
      .reverse()
      .map((f) => f.text)
      .join('; ')}.`;
  }

  /** Handles "remember …", "what do you remember", "forget …". Returns a reply, or null if it's not about memory. */
  handle(input) {
    const t = String(input).trim().replace(/[.!]+$/, '');
    // "Remember to …" is a to-do (the to-do list handles it); "remember" with a time is a reminder.
    const add = t.match(/^(?:(?:hey|ok|okay)\s+\w+[,!]?\s*)?(?:please\s+|can you\s+|could you\s+)?remember\s+(?:that\s+|this:?\s+)?(?!to\b)(.{3,200})$/i);
    if (add && !/\b(?:at \d|in \d+\s*(?:min|hour)|tomorrow at)\b/i.test(t)) {
      let fact = add[1].trim().replace(/\?$/, '');
      // "my teacher is Ms. Lopez" reads better as "Your teacher is Ms. Lopez" when he says it back.
      const said = toYou(fact);
      this.facts = this.facts.filter((f) => f.text.toLowerCase() !== fact.toLowerCase());
      this.facts.push({ text: fact, at: Date.now() });
      if (this.facts.length > MAX) this.facts = this.facts.slice(-MAX);
      this.save();
      return `Got it! I’ll remember: ${said} 🧠`;
    }
    if (/^(?:what do you (?:remember|know)(?: about me)?|what have i told you|show (?:me )?(?:your|my) memor(?:y|ies)|my memories|memories)\??$/i.test(t)) {
      if (!this.facts.length) return 'I don’t remember anything special yet! Tell me things like “remember that my math teacher is Ms. Lopez” or “remember I’m allergic to peanuts” 🧠';
      return `Here’s what I remember about you 🧠\n${this.facts.map((f, i) => `${i + 1}. ${toYou(f.text)}`).join('\n')}\n(Say “forget 2” or “forget everything” to remove things.)`;
    }
    if (/^forget (?:everything|all of it|all)(?: you know| about me)?$/i.test(t)) {
      const n = this.facts.length;
      this.facts = [];
      this.save();
      return n ? `Okay, I forgot all ${n} things. Fresh start! ✨` : 'There was nothing to forget!';
    }
    const num = t.match(/^forget (?:number |#)?(\d{1,2})$/i);
    if (num) {
      const f = this.facts[Number(num[1]) - 1];
      if (!f) return `I don’t have a number ${num[1]}. Say “what do you remember” to see the list.`;
      this.facts.splice(Number(num[1]) - 1, 1);
      this.save();
      return `Forgotten: “${f.text}” 🫧`;
    }
    const about = t.match(/^forget (?:that |about )?(.{3,80})$/i);
    if (about && this.facts.length) {
      const words = about[1].toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !['that', 'the', 'about', 'my'].includes(w));
      const hit = this.facts.findIndex((f) => words.some((w) => f.text.toLowerCase().includes(w)));
      if (hit >= 0) {
        const [f] = this.facts.splice(hit, 1);
        this.save();
        return `Forgotten: “${f.text}” 🫧`;
      }
    }
    return null;
  }
}
