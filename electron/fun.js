// 🎉 Quick fun with Bbokari (instant, no AI): riddles (ask for the answer whenever you want), would-you-rather,
// fun facts, jokes, compliments and a dance party. handle(text) → { text, effect? } or null.

const RIDDLES = [
  ['What has keys but can’t open locks?', 'A piano 🎹'],
  ['What gets wetter the more it dries?', 'A towel 🛁'],
  ['What has hands but can’t clap?', 'A clock ⏰'],
  ['What has to be broken before you can use it?', 'An egg 🥚'],
  ['I’m tall when I’m young and short when I’m old. What am I?', 'A candle 🕯'],
  ['What month of the year has 28 days?', 'All of them! 📅'],
  ['What is full of holes but still holds water?', 'A sponge 🧽'],
  ['What question can you never answer yes to?', '“Are you asleep yet?” 😴'],
  ['What goes up but never comes down?', 'Your age 🎂'],
  ['What can you catch but not throw?', 'A cold 🤧'],
  ['What has a neck but no head?', 'A bottle 🍾'],
  ['What has many teeth but can’t bite?', 'A comb'],
  ['If you have me, you want to share me. If you share me, you don’t have me. What am I?', 'A secret 🤫'],
  ['What runs but never walks, has a mouth but never talks?', 'A river 🌊'],
  ['What can travel around the world while staying in a corner?', 'A stamp 📮'],
  ['The more of this there is, the less you see. What is it?', 'Darkness 🌑'],
  ['What has one eye but can’t see?', 'A needle 🪡'],
  ['What building has the most stories?', 'The library 📚'],
  ['What begins with T, ends with T, and has T in it?', 'A teapot 🫖'],
  ['What kind of band never plays music?', 'A rubber band'],
];

const WOULD = [
  ['be able to fly 🕊', 'be invisible 🫥'],
  ['have a pet dragon 🐉', 'have a pet unicorn 🦄'],
  ['live on the Moon 🌙', 'live under the sea 🌊'],
  ['only eat pizza forever 🍕', 'only eat tteokbokki forever 🌶'],
  ['talk to animals 🐶', 'speak every language 🌍'],
  ['have no homework ever 📚', 'have summer break all year ☀️'],
  ['meet your favourite singer 🎤', 'be a famous singer yourself 🌟'],
  ['have a robot that does your chores 🤖', 'a robot that does your homework (it gets everything wrong) 🙃'],
  ['be super strong 💪', 'be super fast ⚡'],
  ['always have to sing instead of talk 🎶', 'always have to dance when you walk 💃'],
  ['explore space 🚀', 'explore the deep ocean 🐙'],
  ['have a never-ending bag of snacks 🍿', 'a never-ending phone battery 🔋'],
  ['go back in time to see dinosaurs 🦖', 'go forward in time to see flying cars 🚗'],
  ['be a chick like me 🐥', 'be a penguin 🐧'],
];

const FACTS = [
  'Octopuses have three hearts and blue blood 🐙',
  'Honey never goes bad: people have found 3,000-year-old honey that was still good to eat 🍯',
  'A group of flamingos is called a “flamboyance” 🦩',
  'Bananas are berries, but strawberries aren’t 🍌',
  'Sharks are older than trees: they were around before the first trees grew 🦈',
  'Butterflies taste with their feet 🦋',
  'A day on Venus is longer than a year on Venus 🪐',
  'Cows have best friends and get stressed when they’re apart 🐄',
  'Your brain uses about 20% of your body’s energy 🧠',
  'Sea otters hold hands while they sleep so they don’t drift apart 🦦',
  'There are more stars in the universe than grains of sand on all of Earth’s beaches ✨',
  'Wombat poop is cube-shaped 🟫',
  'A bolt of lightning is about five times hotter than the surface of the Sun ⚡',
  'Chicks like me can recognise over 100 different faces 🐥',
  'Koalas sleep up to 22 hours a day 🐨',
  'The Eiffel Tower grows about 15 cm taller in summer because the metal expands in the heat 🗼',
  'Axolotls can regrow their legs, and even parts of their heart and brain 🦎',
  'Hot water can freeze faster than cold water (it’s called the Mpemba effect) 🧊',
  'Snails can sleep for up to three years 🐌',
  'The first oranges weren’t orange: they were green 🍊',
];

const JOKES = [
  'Why did the math book look sad? It had too many problems 📕😔',
  'What do you call a chick that’s good at math? A calcu-chicken 🐥🧮',
  'Why can’t a bicycle stand up by itself? It’s two-tired 🚲',
  'What do you call a fish with no eyes? A fsh 🐟',
  'Why did the student eat his homework? The teacher said it was a piece of cake 🍰',
  'What kind of tree fits in your hand? A palm tree 🌴',
  'Why don’t eggs tell jokes? They’d crack each other up 🥚',
  'What do you call a sleeping dinosaur? A dino-snore 🦖💤',
  'How do you make an octopus laugh? With ten-tickles 🐙',
  'Why was the computer cold? It left its Windows open 🪟',
  'What did one plate say to the other? Dinner’s on me 🍽',
  'Why did the scarecrow win an award? He was outstanding in his field 🌾',
];

const COMPLIMENTS = [
  'You’re doing way better than you think 💛',
  'You’re so creative, I love the things you come up with ✨',
  'Your brain is amazing, look at all the stuff you’ve learned! 🧠',
  'You make me the happiest chick on this computer 🐥',
  'You’re a hard worker, I see it every day 💪',
  'You have the best ideas 💡',
];

const pick = (list, avoid) => {
  let x;
  do x = list[Math.floor(Math.random() * list.length)];
  while (list.length > 1 && x === avoid);
  return x;
};
let lastRiddle = null;
let last = {};

export function handle(input) {
  const t = String(input ?? '').trim().toLowerCase().replace(/[.!?]+$/, '').replace(/^(?:hey|ok|oye)\s+\w+[,!]?\s*/, '').replace(/^(?:can you\s+|please\s+)/, '');
  if (lastRiddle && /^(?:what(?:'s| is) the answer|tell me the answer|answer|i give up|give up|me rindo|la respuesta|cu[aá]l es la respuesta)$/.test(t)) {
    const a = lastRiddle[1];
    lastRiddle = null;
    return { text: `It’s… ${a}`, effect: 'wave' };
  }
  if (lastRiddle && t.length < 40 && t.split(' ').length <= 5 && !/^(?:another|next|more)\b/.test(t)) {
    const guess = t.replace(/^(?:is it|it'?s|a|an|the)\s+/g, '');
    const right = lastRiddle[1].toLowerCase().replace(/[^\w ]/g, '').includes(guess.replace(/^(?:a|an|the)\s+/, ''));
    if (right && guess.length > 2) {
      const a = lastRiddle[1];
      lastRiddle = null;
      return { text: `YES!! It’s ${a} 🎉 You’re so smart!`, effect: 'dance' };
    }
    if (/^is it\b/.test(t)) return { text: 'Not quite 😜 Guess again, or say “tell me the answer”!' };
  }
  if (/^(?:tell me |give me |say |another |one more |dime )?(?:a |another |una )?(?:riddle|adivinanza|acertijo)s?$|^riddle me|^(?:another|next) one$/.test(t) || (lastRiddle === null && /^(?:another|next) riddle$/.test(t))) {
    lastRiddle = pick(RIDDLES, last.riddle);
    last.riddle = lastRiddle;
    return { text: `🧩 ${lastRiddle[0]}\n(Guess, or say “tell me the answer”!)` };
  }
  if (/^(?:would you rather|wyr|ask me a would you rather|play would you rather|qu[eé] prefieres)$/.test(t)) {
    const [a, b] = pick(WOULD, last.would);
    last.would = [a, b];
    return { text: `🤔 Would you rather ${a}… or ${b}?` };
  }
  if (/^(?:tell me |give me |say )?(?:a |another )?(?:fun |cool |random )?(?:fact|facts|dato curioso|un dato)$|^did you know$/.test(t)) {
    last.fact = pick(FACTS, last.fact);
    return { text: `🤓 Did you know? ${last.fact}` };
  }
  if (/^(?:tell me |say |give me )?(?:a |another )?(?:joke|funny joke|chiste)$|^make me laugh$|^cu[eé]ntame un chiste$/.test(t)) {
    last.joke = pick(JOKES, last.joke);
    return { text: `😆 ${last.joke}`, effect: 'happy' };
  }
  if (/^(?:compliment me|say something nice|i'?m sad|i feel sad|cheer me up|dime algo bonito|estoy triste)$/.test(t)) {
    last.nice = pick(COMPLIMENTS, last.nice);
    return { text: last.nice, effect: 'wave' };
  }
  if (/^(?:dance(?: party)?|let'?s dance|party time|baila|fiesta)$/.test(t)) return { text: '💃🕺 DANCE PARTY! 🎉 Bbok bbok bbok!', effect: 'dance' };
  return null;
}
