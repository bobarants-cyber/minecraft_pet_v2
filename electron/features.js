// ✨ Everything Bbokari can do, in one list. The feature hub (⌃⌥Space) shows these as cards you can search and click.
// Each one either asks Bbokari something right away (ask), opens the chat with a sentence to finish (prefill), or
// runs something in the app (run). `isNew` marks this update's features.

export const CATEGORIES = [
  ['school', '📚 School'],
  ['time', '⏰ Time & tasks'],
  ['writing', '✍️ Writing'],
  ['you', '🧠 About you'],
  ['messages', '📬 Messages'],
  ['mac', '🚀 Mac helper'],
  ['fun', '🎮 Fun'],
];

export const FEATURES = [
  // School
  { id: 'plan', cat: 'school', emoji: '📅', title: 'Plan my homework', desc: 'Splits a project or test into small daily steps until it’s due, with a reminder for each.', example: 'plan my science test due Friday', prefill: 'plan my  due Thursday', isNew: true, keys: 'study schedule organize project test exam essay due' },
  { id: 'quiz', cat: 'school', emoji: '🃏', title: 'Quiz me (flashcards)', desc: 'Flashcards from your class notes, text you paste, or any topic. Tap to see the answer.', example: 'quiz me on fractions', prefill: 'quiz me on ', isNew: true, keys: 'flashcards study test review practice' },
  { id: 'day', cat: 'school', emoji: '☀️', title: 'Plan my day', desc: 'Your classes, what’s due, reminders and to-dos for today, plus what to do first.', example: 'plan my day', ask: 'plan my day', isNew: true, keys: 'morning today schedule brief agenda' },
  { id: 'classroom', cat: 'school', emoji: '🏫', title: 'What do I have to do?', desc: 'Checks Google Classroom for work due this week and offers to make a template.', example: 'what do I have to do this week', ask: 'what do I have to do this week', keys: 'classroom homework assignments due' },
  { id: 'deck', cat: 'school', emoji: '🖼', title: 'Presentation with my math', desc: 'Send your recipe: Bbokari does all the math and makes designed slides (with real photos).', example: 'make my presentation in canva with my math: bibimbap for 4: rice 1 1/2 cups…', prefill: 'make my presentation in canva with my math: ', keys: 'slides canva recipe kitchen deck' },
  { id: 'fill', cat: 'school', emoji: '🇰🇷', title: 'Fill a Canva template', desc: 'Open a template in Canva, press Customize, then let Bbokari put all your math in it.', example: 'fill it in with my math', ask: 'fill it in with my math', keys: 'canva template korean' },
  { id: 'templates', cat: 'school', emoji: '🔎', title: 'Find Canva templates', desc: 'Opens Canva’s templates for any topic.', example: 'find korean bibimbap templates', prefill: 'find  templates', keys: 'canva search design' },
  { id: 'recipe', cat: 'school', emoji: '🍚', title: 'Recipe math', desc: 'Doubles, halves or resizes a recipe and shows every step with fractions.', example: 'scale the recipe from 4 to 6: rice 1 1/2 cups, egg 4', prefill: 'scale the recipe from 4 to 6: ', keys: 'fractions double half scientific notation convert grams' },
  { id: 'doc', cat: 'school', emoji: '📄', title: 'Write a doc', desc: 'Writes a document and opens it in Google Docs.', example: 'write me a doc about the water cycle', prefill: 'write me a doc about ', keys: 'google docs essay report' },
  { id: 'project', cat: 'school', emoji: '✅', title: 'Check my project', desc: 'Reads your Classroom project and tells you what you still need.', example: 'check my math project', ask: 'check my math project', keys: 'rubric instructions classroom' },
  { id: 'notes', cat: 'school', emoji: '📝', title: 'Take notes', desc: 'Listens in class and writes your notes for you.', example: 'take notes', run: 'notes', keys: 'class lecture listen' },
  { id: 'captions', cat: 'school', emoji: '🎙', title: 'Live captions', desc: 'Shows what’s being said, translated into your language.', example: 'menu → Live captions', run: 'captions', keys: 'subtitles translate listen' },
  // Time & tasks
  { id: 'repeat', cat: 'time', emoji: '🔁', title: 'Repeating reminders', desc: 'Every day, school days, or certain weekdays.', example: 'remind me every Monday and Wednesday at 4pm to practice piano', prefill: 'remind me every Monday at 4pm to ', isNew: true, keys: 'alarm weekly daily weekdays' },
  { id: 'remind', cat: 'time', emoji: '⏰', title: 'Reminder', desc: 'One-time reminder at a time or after a while.', example: 'remind me in 20 minutes to drink water', prefill: 'remind me in 10 minutes to ', keys: 'alarm' },
  { id: 'timer', cat: 'time', emoji: '⏲', title: 'Timer', desc: 'A countdown timer.', example: 'set a timer for 10 minutes', prefill: 'set a timer for 10 minutes', keys: 'countdown' },
  { id: 'focus', cat: 'time', emoji: '🍅', title: 'Focus timer', desc: '25 minutes of focus; Bbokari studies with you.', example: 'focus for 25 minutes', run: 'focus', keys: 'pomodoro study concentrate' },
  { id: 'todo', cat: 'time', emoji: '☑️', title: 'To-do list', desc: 'Add things, tick them off from the menu bar.', example: 'add math homework to my list', prefill: 'add  to my list', keys: 'tasks list' },
  { id: 'diary', cat: 'time', emoji: '📓', title: 'How was my day?', desc: 'How long you spent writing, reading, on videos or games today, and your wins.', example: 'how was my day', ask: 'how was my day', isNew: true, keys: 'diary stats screen time summary' },
  // Writing
  { id: 'check', cat: 'writing', emoji: '🔍', title: 'Check my writing', desc: 'Spots spelling and grammar mistakes in what you’re writing.', example: 'check my writing', run: 'check', keys: 'grammar spelling proofread' },
  { id: 'highlight', cat: 'writing', emoji: '✏️', title: 'Fix highlighted text', desc: 'Highlight text in any app, then ⌃⌥S summarize, ⌃⌥B improve, ⌃⌥H simplify.', example: 'highlight text → ⌃⌥B', tip: 'Highlight text in any app, then press ⌃⌥S (summarize), ⌃⌥B (improve) or ⌃⌥H (make it simpler).', keys: 'summarize improve rewrite shortcut' },
  { id: 'translate', cat: 'writing', emoji: '🌍', title: 'Translate', desc: 'Translates words or sentences.', example: 'translate thank you to korean', prefill: 'translate  to korean', keys: 'language spanish korean english' },
  // About you
  { id: 'remember', cat: 'you', emoji: '🧠', title: 'Remember things about me', desc: 'Tell Bbokari facts and he uses them when he helps you.', example: 'remember that my math teacher is Ms. Lopez', prefill: 'remember that ', isNew: true, keys: 'memory know me facts' },
  { id: 'memories', cat: 'you', emoji: '💭', title: 'What do you remember?', desc: 'See (or delete) what Bbokari knows about you.', example: 'what do you remember', ask: 'what do you remember', isNew: true, keys: 'memory forget' },
  { id: 'chat', cat: 'you', emoji: '💬', title: 'Chat with Bbokari', desc: 'Ask anything.', example: 'why is the sky blue?', run: 'chat', keys: 'talk ask question' },
  { id: 'voice', cat: 'you', emoji: '🗣', title: '“Hey Bbokari” voice', desc: 'Talk instead of typing.', example: 'menu → Hey Bbokari', run: 'voice', keys: 'microphone speak talk' },
  // Messages
  { id: 'catchup', cat: 'messages', emoji: '📬', title: 'Catch me up', desc: 'New emails, Chat messages and Classroom posts, summed up with quick replies.', example: 'catch me up', ask: 'catch me up', keys: 'gmail email inbox google chat' },
  { id: 'junk', cat: 'messages', emoji: '🧹', title: 'Clean my inbox', desc: 'Finds ads and newsletters and clears them.', example: 'clean up my inbox', ask: 'clean up my inbox', keys: 'gmail junk spam' },
  // Mac helper
  { id: 'open', cat: 'mac', emoji: '🚀', title: 'Open anything', desc: 'Apps, websites, files and folders.', example: 'open my math project file', prefill: 'open ', keys: 'app website file folder launch' },
  { id: 'class', cat: 'mac', emoji: '🎒', title: 'Open my class', desc: 'Opens your class link (and 2 minutes before class by itself).', example: 'open my math class', prefill: 'open my  class', keys: 'meet zoom link schedule' },
  { id: 'hide', cat: 'mac', emoji: '🙈', title: 'Hide Bbokari', desc: 'He disappears but keeps working (⌃⌥P).', example: '⌃⌥P', run: 'hide', keys: 'invisible' },
  { id: 'weather', cat: 'mac', emoji: '🌤', title: 'Weather', desc: 'Today’s weather.', example: 'what’s the weather', ask: "what's the weather", keys: 'rain temperature' },
  { id: 'calc', cat: 'mac', emoji: '🧮', title: 'Calculator', desc: 'Quick math.', example: 'what is 15% of 80', prefill: 'what is ', keys: 'math calculate percent' },
  // Fun
  { id: 'pingpong', cat: 'fun', emoji: '🏓', title: 'Ping pong', desc: 'Play against Bbokari.', example: 'menu → Games', run: 'game:pingpong', keys: 'game' },
  { id: 'tictactoe', cat: 'fun', emoji: '⭕', title: 'Tic-tac-toe', desc: 'A quick game.', example: 'menu → Games', run: 'game:tictactoe', keys: 'game' },
  { id: 'rps', cat: 'fun', emoji: '✊', title: 'Rock paper scissors', desc: 'Best of three?', example: 'menu → Games', run: 'game:rps', keys: 'game' },
  { id: 'cups', cat: 'fun', emoji: '🥤', title: 'Cups', desc: 'Find the ball under the cup.', example: 'menu → Games', run: 'game:cups', keys: 'game' },
  { id: 'bubbles', cat: 'fun', emoji: '🫧', title: 'Bubbles', desc: 'Pop the bubbles.', example: 'menu → Games', run: 'game:bubbles', keys: 'game' },
  { id: 'dance', cat: 'fun', emoji: '💃', title: 'Dance!', desc: 'Bbokari dances for you.', example: 'dance', run: 'dance', keys: 'party' },
  { id: 'outfit', cat: 'fun', emoji: '🎀', title: 'Change outfit', desc: 'Party hat, crown, beanie, bow, flower, sunglasses.', example: 'tap to try the next one', run: 'outfit', keys: 'hat clothes dress up' },
  { id: 'coin', cat: 'fun', emoji: '🪙', title: 'Flip a coin / roll a die', desc: 'Or ask the magic 8-ball.', example: 'flip a coin', ask: 'flip a coin', keys: 'random dice 8 ball' },
];

/** The list for the hub window (plain data). */
export const hubData = () => ({ categories: CATEGORIES, features: FEATURES });
