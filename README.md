# Minecraft Pet v2

A Minecraft-style mob that lives on your Mac desktop, and now it's also your personal assistant.

```bash
npm install
npm start
```

> Use **Node 22** (`brew install node@22`). With very new Node versions, npm may skip Electron's
> download step, and you'll get "Electron failed to install correctly".

## Bbokari as a Mac app 🐥

Make an app with Bbokari's icon that you can open from Launchpad, Spotlight or the Dock, without Terminal:

```bash
npm run make-app
```

It appears in **Applications** as **Bbokari**. Drag it to your Dock if you like. The icon is
`assets/icon/bbokari.png` (1024×1024). If you move the project folder, run `npm run make-app` again. If something
goes wrong when starting, see `~/Library/Logs/Bbokari.log`.

## Bbokari on your iPhone 📱

- **Pocket Bbokari** (`phone/`): a phone-sized Bbokari you can pet, feed, play ball with, dress up and play mini-games with.
  Tap **🪟 Float** to pop him into a little window that stays on top of your other apps. Build it with `node phone/build.mjs`.
- **The iPhone app** (`ios/`): Pocket Bbokari plus floating Bbokari that follows you when you swipe home, Home Screen
  and Lock Screen widgets, and a 🍅 focus timer in the Dynamic Island. See [ios/README.md](ios/README.md) for how to put
  it on your iPhone with Xcode, for free.

## 📚 School projects and recipe math

| Say | What happens |
| --- | --- |
| "check my math project" | Finds it in Google Classroom and explains what it's about, what you need to do and a tip |
| "my math project is: …" (paste the instructions) | Same, without Classroom |
| "yes" (after Bbokari explains a project and asks "Want me to make you a template?") | Makes the template right away (say "yes, I'm doing bibimbap" to give the topic) |
| "make me a template for my math project and fill it in with these details: bibimbap for 2 people: 1 1/2 cups rice, … I will double it and halve it" | A presentation with your details in it; the recipe math (doubled, halved, or "for 6 people") is worked out exactly and put in the tables |
| "make me a template for this project, I'm doing bibimbap, with Korean style" | A blank template built from the project's instructions (tables for the math, photo spots). Opens in Canva if it's connected |
| "add a slide about fun facts", "change the title to …", "make it for 6 people", "make it space themed" | Updates the last thing Bbokari made and opens the new version (Canva keeps the old one too) |
| "scale the recipe from 2 to 6 servings: 1/2 cup rice, 3 tbsp gochujang" | Exact answers with every step |
| "2/3 cup times 4", "3/4 + 2/3", "$12 for 4 servings" | Fractions and cost per serving, with steps |
| "190 g in scientific notation", "convert 1 1/4 cups milk to liters", "convert 1/4 tsp salt to kg" | Scientific notation and kitchen conversions (approximate weights for flour, sugar, salt, butter, rice…) |

## 🎨 Canva: designs open right in Canva

When Canva is connected, "make a presentation about … in Canva" opens the finished design **in the Canva editor**
(no downloading or dragging). Korean topics get a Korean look: hanji colors, 색동 stripes and the title in Hangul.
Other topics get their own theme (food, nature, space, ocean, school, party). Once it's open, use **Elements** on the
left in Canva to add stickers and photos (Canva doesn't let apps add its library elements).

### One-time setup (about 5 minutes)

1. Go to **canva.com/developers/integrations** (sign in with your Canva account) → **Create an integration**.
2. Give it a name (**Bbokari**) and accept the terms.
3. **Scopes**: turn on **design:content → Write** and **design:meta → Read**.
4. **Authentication → Add Authentication** → Redirect URL: `http://127.0.0.1:4519/canva` → save.
5. **Configuration**: copy the **Client ID**, press **Generate secret** and copy the **Client secret**.
6. In Bbokari: menu bar → **🎨 Canva → Enter Canva keys…** → paste both → **Save & connect** → press **Allow** on Canva's page.

Classroom work gets a **📝 Make a template** button too: Bbokari builds a blank template for the assignment (slides if
it sounds like a presentation, otherwise a Google Doc) for you to fill in.

## 📬 Inbox buddy: Gmail, Google Chat and Classroom

Bbokari watches your messages and pops up a card for each new one: who it's from, **the main idea**, and **the question
they're asking you**. Tap **👍 Yes**, **👎 No** or **✏️ My reply** and he writes the answer. You always see it (and can
change it) before you press **Send**. Classroom: new assignments, announcements and a ⏰ warning the day before
something is due that you haven't turned in. Say **"check my messages"**, **"what homework do I have?"** or
**"clean up my inbox"** (junk goes to the Trash only after you press the button; Gmail keeps it there for 30 days).

### One-time setup (about 15 minutes)

Google only lets apps read your mail after you make your own free "key":

1. Go to **console.cloud.google.com** and sign in with the Google account you want Bbokari to read.
   (School accounts are often blocked by the school. If so, use your personal Gmail.)
2. Top left: **Select a project → New project** → name it **Bbokari** → **Create**, then select it.
3. Search the top bar for each of these and press **Enable**: **Gmail API**, **Google Chat API**, **Google Classroom API**.
4. Search **Google Auth Platform** → **Get started**: App name **Bbokari**, your email → **Audience: External** → finish.
   Then **Audience → Test users → Add users** → add your own email.
5. **Clients → Create client → Application type: Desktop app** → **Create** → **Download JSON**.
6. Only for Google Chat: open **Google Chat API → Configuration**, type an app name (**Bbokari**), an avatar URL
   (any picture link) and a description, turn **off** "Interactive features", and **Save**.
7. In Bbokari: menu bar → **📬 Inbox → Choose Google key file…** → pick the file you downloaded
   (`client_secret_….json` in Downloads).
8. **📬 Inbox → Connect Google account…** → choose your account. Google says "Google hasn't verified this app":
   that's normal because it's your own app. Click **Continue**, tick every box, then **Continue**.

While the app is in "Testing", Google asks you to connect again every 7 days. To stop that: **Google Auth Platform →
Audience → Publish app**.

## Bbokari does things for you 🪄

Type it in the chat or say it with "Hey Bbokari":

| Say | What happens |
| --- | --- |
| "open my math class" | Opens that class's link from 📅 Classes ("spanish" also finds "Español") |
| "open my robot project" | Finds the folder on your Mac and opens it in VS Code (or Finder) |
| "open my history project in Claude" | Opens your projects on claude.ai |
| "open my volcano essay" / "open my downloads" | Finds the file or folder and opens it |
| "make a doc about the solar system" | Writes it with the local AI, opens a new Google Doc and pastes it in |
| "write a report on Egypt in Word" (or Pages) | Saves a Word file and opens it |
| "make a presentation about volcanoes in Canva" | Makes the slides; drag the file onto Canva and it becomes a Canva design |
| "…in Google Slides" / "…in Keynote" / "…in PowerPoint" | Same slides for those apps |
| "make a presentation about bibimbap in Canva, don't type anything, give me a base for the ingredients and recipe" | A blank template: sections with lines to fill in and photo boxes (also "make a blank doc about…") |

Everything Bbokari writes is also saved in **Documents → Bbokari Docs**. Read it over and make it yours: the local AI
can get facts wrong. Bbokari can only do the things in this list; it can't run other programs or delete anything.

## Your assistant

**Right-click the pet → 💬 Chat**, or click the menu-bar icon → **Chat with Bee…**.
A speech bubble opens above the pet. Type and press Enter.

- **Talk instead of typing:** click in the chat box and press **Fn** twice (or the 🎤 key) to use the Mac's free built-in dictation.
- **Reminders and timers:** these work even without the AI:
  - `remind me in 20 minutes to drink water`
  - `remind me at 5pm to call mom` · `remind me tomorrow at noon to eat`
  - `set a timer for 5 minutes` · `10 min timer` · `alarm at 7:30 am`
  - `list my reminders` · `cancel my timers` · `cancel all reminders`

  When one is due, the pet pops up a bubble, gets excited and shows a Mac notification.
  You can also see and cancel them from the menu bar: **Reminders & timers**.
  They're saved, so they survive a restart.
- **Free AI brain:** the pet thinks with [Ollama](https://ollama.com), which runs the AI on your own Mac.
  There's no API key and nothing to pay, and your chats stay on your computer.

### Set up the AI brain (one time)

1. Download Ollama from **https://ollama.com/download**, open the file, drag **Ollama** into **Applications** and open it once. A llama icon appears in your menu bar.
2. In Terminal, download the brain (about 2 GB):
   ```bash
   ollama pull llama3.2
   ```
3. Start the pet (`npm start`) and chat!

For a faster but simpler brain, run `ollama pull llama3.2:1b` and pick **AI brain → Llama 3.2 Mini** in the pet's menu-bar menu.

## My classes 📅

Right-click the pet → **📅 My classes**, the menu bar → **📅 Classes → My classes…**, or type “my classes” in the chat.
Add each class with its name, days, start and end time, and its link (Zoom, Google Meet, …). The week view shows your
timetable with today highlighted; click a class to edit it, delete it or join it now.

**Two minutes before each class**, the pet (waking up first if it's napping) sits at its desk, tells you which class is
starting, shows a Mac notification and opens the class link. If your Mac was asleep and you open it while a class is
still on, it opens it right away. Each class opens once per day, and only links starting with `https://` (or Zoom/Teams
app links) are allowed. The menu bar's **📅 Classes** lists today's classes; click one to join early.

The pet has to be running for this, so tick **Open at login** in its menu-bar menu.

## Ask Bbokari instead of opening an app ⚡

These work instantly in the chat (or with “Hey Bbokari, …”), most of them without the AI or the internet:

| Say… | Bbokari… |
|---|---|
| “what’s 23 x 19”, “15% of 80”, “square root of 144” | 🧮 does the maths |
| “what time is it”, “what’s the date”, “how many days until christmas” | 🕐 tells you |
| “flip a coin”, “roll 2 dice”, “random number from 1 to 50”, “magic 8 ball…”, “pick pizza or tacos” | 🎲 decides for you |
| “add homework to my list”, “my list”, “done homework”, “clear my list” | ✅ keeps your to-do list (also in the menu bar; confetti when it's empty!) |
| “my city is Madrid”, then “weather” (or “weather in Tokyo”) | 🌤 checks the weather (free, open-meteo.com) and wears sunglasses when it's sunny or holds an umbrella when it rains |
| “translate good morning to Korean” | 🌍 translates (with Ollama) |
| “focus” / “focus 50” / “stop focus” | 🍅 starts a focus timer: it works at its desk next to you, with a countdown, then confetti and a break |

## Play with Bbokari 🐥

Right-click the pet:
- **🍓 Feed:** a strawberry or a cookie falls from the sky; it catches it, munches and sends you a heart.
- **⚽ Ball:** a beach ball bounces around and it chases and kicks it.
- **🎀 Outfit:** party hat, crown, beanie, bow, flower or sunglasses (Bbokari only). It remembers what it's wearing.

## Bbokari reacts to what you're doing 👀

Every few seconds the pet checks which app is in front (and, in a browser, the current tab's address and title) and
acts it out:

| You're… | The pet… |
|---|---|
| 🎬 watching a video (YouTube, Netflix, TikTok, Twitch, the TV app…) | sits in a red cinema seat with red/blue 3D glasses, eating popcorn |
| 📝 writing (Google Docs, Pages, Word, Notes, Notion…) | sits in a chair writing in a notebook |
| 🎵 listening to music (Spotify, Apple Music, YouTube Music…) | puts on headphones and bops to the beat |
| 🎥 in a call (Zoom, Meet, FaceTime, Teams) | waves hello, then sits quietly with a headset, nodding |
| 🎮 gaming (Minecraft, Roblox, Poki, chess…) | mashes a controller and cheers |
| 💻 coding (Terminal, VS Code, GitHub, Scratch…) | types at its laptop with glasses on |
| 📖 reading (PDFs, Books, Wikipedia…) | reads an open book, turning pages |
| 🎨 drawing (Canva, Figma, Slides…) | paints at an easel, wearing a beret |

Petting it, chatting or playing interrupts the scene, and it goes back afterwards. It doesn't doze off while you watch
a video, listen to music or sit in a call. Other touches: a daily hello, a **stretch-break** reminder after 50 minutes
of non-stop computer time, and a sleepy nudge after 11 pm.

The first time, macOS asks whether Electron may control your browser (to read the current tab's address). Click
**OK**. Nothing is saved or sent anywhere. Turn it off in the menu bar: **👀 React to what I'm doing** /
**⏰ Stretch break reminders**.

## Spotting mistakes 🔍

While you're writing (Notes, Pages, Word, TextEdit…) or coding (VS Code, Xcode, Terminal…), the pet waits until you
pause typing, reads the text box you're typing in, and asks Ollama for spelling, grammar or code mistakes. If it finds
any, a bubble shows them (~~teh~~ → **the**); otherwise it stays quiet. It checks at most every 90 seconds and only
when the text changed. Some apps, notably **Google Docs**, don't share their text: highlight it and use **✏️ Improve**
(⌃⌥B) instead. It's on by default; turn it off in the menu bar under **⚙️ Settings → 🔍 Spot mistakes while I write or code**.

## Invisible mode 🙈

Right-click the pet → **🙈 Hide me**, the menu bar → **Hide Bbokari**, or press **⌃⌥P**. The pet disappears but
keeps working: notes, captions, reminders, classes and “Hey Bbokari” all still run, and important alerts still
pop up. While hidden, the menu bar shows 🙈 (or 📝 while it's taking notes). Press **⌃⌥P** again to bring it back.

## Hey Bbokari 🗣

A voice assistant: right-click the pet → **🗣 Hey Bbokari** (or the menu bar → **🗣 Hey Bbokari**) to turn it on. Then
say **“Hey Bbokari, …”** followed by your question, e.g. “Hey Bbokari, why is the sky blue?”. You can also say just
“Hey Bbokari”, wait for “Yes? 👂”, then ask. Chat commands work too: “Hey Bbokari, set a timer for 5 minutes”,
“Hey Bbokari, open YouTube”. The answer pops up in a bubble and is added to the chat.

It only listens to **your microphone** and only answers when it hears its name; it never listens to the computer's
sound. It uses the live-captions speech recognizer (set that up first). Tick **Speak answers out loud** to hear the
answers in the Mac's own free voice; the mic pauses while it talks, so it doesn't hear itself.

## Class notes 📝

When the pet opens a class from **My classes**, it also starts taking notes, and when the class ends it writes them up:
a summary, key points, important words, homework and dates, and review questions. You can also start and stop notes yourself:
right-click → **📝 Take notes**, the menu bar → **📝 Notes**, or type “take notes” / “stop notes” in the chat.

While it listens, a **📝 Taking notes** badge with a **Stop** button sits above the pet. It uses the same speech
recognizer as live captions (set those up first): the computer's sound through BlackHole, or your microphone if
BlackHole isn't installed. The summary is written by Ollama.

Notes are saved as text in **Documents → Bbokari Notes**, with the full transcript under the summary. No audio is ever
saved. Turn off automatic notes in the menu bar under **📝 Notes → Take notes automatically in class**. Check that your
school is okay with transcribing classes.

## Open things for you 🚀

Right-click the pet → **🚀 Open for me** (YouTube, Google, Meet, Zoom, or **Other…**), use the menu bar → **🚀 Open**,
or say it in the chat: “open youtube”, “open notes”, “go to wikipedia.org”. The pet sits at its desk and types it for you,
one key at a time: websites in a new tab of Chrome (or Safari), apps in Spotlight. It uses the same Accessibility
permission as the text tools.

The pet only opens things you ask for. It never opens links other people send, for example in a meeting chat,
because anyone could send a harmful link.

## Typing animation ⌨️

Whenever the pet types for you, thinks about a chat answer or rewrites your text, it hops up, a chair and a desk with a
laptop pop in, it puts on its glasses, sits down and types. When it's done, everything shrinks away.

## Live captions 🎙

Right-click the pet → **🎙 Live captions**, or the menu bar → **🎙 Live captions → Show captions**. A small subtitle
panel appears beside the pet and shows what it hears. When something is in another language, a 🌐 translation appears
under it. Pick the language under **Translate into** (English, Español, 한국어 and more). Use 🎤 / 💻 on the panel to choose
what it listens to: your microphone, the computer's sound (Zoom, YouTube…), or both.

It all runs on your Mac with [whisper.cpp](https://github.com/ggml-org/whisper.cpp): free, offline, nothing is saved.
Translations into English come from Whisper; other languages use Ollama.

### Set up captions (one time)

1. Install the speech recognizer:
   ```bash
   brew install whisper-cpp
   ```
2. Download a speech model (about 470 MB) into the project's `models` folder:
   ```bash
   mkdir -p ~/Documents/minecraft_pet_v2/models
   ```
   ```bash
   curl -L -o ~/Documents/minecraft_pet_v2/models/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
   ```
   (For a faster, less accurate model use `ggml-base.bin`, about 140 MB. Don't use the `.en` models: they only understand English.)
3. Start the pet, turn on captions and allow the microphone when macOS asks.

### Captions for the computer's sound (optional)

Macs don't let apps listen to other apps' sound directly, so this uses **BlackHole**, a free virtual audio cable:

1. Install it (it asks for your Mac password):
   ```bash
   brew install blackhole-2ch
   ```
   If it doesn't show up in the next step, restart your Mac.
2. Open **Audio MIDI Setup** (⌘ Space, type it). Click **+** at the bottom left → **Create Multi-Output Device**, then tick
   your speakers or headphones **and** **BlackHole 2ch**.
3. In **System Settings → Sound → Output**, choose **Multi-Output Device**. You'll still hear everything, and the pet
   hears it too. (In Zoom, set **Speaker** to *Same as System* or *Multi-Output Device*.)
4. Click 💻 on the captions panel.

Volume keys don't work with a Multi-Output Device. To have the pet switch for you, install one small free tool:

```bash
brew install switchaudio-osx
```

Then, whenever the pet listens to the computer's sound (💻 captions or notes), it switches your output to the
Multi-Output Device, and back to what you had (speakers, AirPods…) when it stops, so your volume keys work the rest
of the time. If you change the output yourself in between, it leaves your choice alone. Turn it off in the menu bar:
**🎙 Live captions → 🔊 Switch to Multi-Output Device automatically**.

## Games 🎮

Right-click the pet → **🎮 Play a game**, or the menu bar → **🎮 Games**. Each game is a small panel beside the pet at
the bottom of the screen, so the rest of your screen (a Zoom call, say) stays visible and clickable. They're mouse-only,
so your keyboard stays in the app you're using. Press ✕ or **Esc**, or choose **Stop the game**, to stop.

| Game | How to play |
|---|---|
| 🏓 Ping pong | Move your mouse to move your paddle; click the table to serve. First to 7. |
| ⭕ Tic-tac-toe | You're ⭐. Get three in a row before the pet does. It's good, but beatable. |
| ✊ Rock paper scissors | Pick one. The pet notices if you keep choosing the same thing… |
| 🥤 Cups | Watch which cup hides the 🌻 seed, follow the shuffle, click the right cup. Faster every round. |
| 🫧 Bubbles | Pop the bubbles the pet blows, in 30 seconds. Golden ones are worth 3. |

### Ping pong 🏓

Right-click the pet → **🏓 Ping pong**, or the menu bar → **Play ping pong**. A small table appears at the bottom of
the screen with the pet at the far end holding a paddle. Move your mouse to move your paddle, and click the table to serve.
The first to 7 points wins. Press **Esc** or ✕ to stop.

## Fix highlighted text ✏️

Highlight text in any app, then pick a command from the pet's right-click menu, from the menu bar under **✏️ Highlighted text**,
or with a shortcut:

| Command | Shortcut | What it does |
|---|---|---|
| Summarize | ⌃⌥S | Shortens it to the main points |
| Humanize | ⌃⌥H | Makes it sound natural and friendly |
| Make it better | ⌃⌥B | Fixes grammar and spelling and makes it clearer |

The pet shows the result in its bubble: **Replace** puts it where your highlighted text was, and **Copy** copies it.
It uses the same free local AI as the chat (Ollama).

The first time, macOS asks for permission, because the pet presses ⌘C and ⌘V for you. Allow it in **System Settings →
Privacy & Security → Accessibility** (turn on **Electron**, and **Terminal** if it's listed), and allow it to control
**System Events** if asked.

## Characters

Switch with **right-click → Switch mob**, or from the menu bar under **Mob**:

- **Bee** and **Axolotl**, the originals.
- **Bbokari** (a fan model of the SKZOO character, for personal use only). It walks, waves, dances, flaps its arms when it flies,
  and has eyes that blink, squint happily, close for sleep and follow your mouse. See `scripts/bbokari/` for how the model was prepared.

## Your own 3D models

The bee and axolotl come from `assets/models/bee.glb` and `assets/models/axolotl.glb`, and the code
animates their parts by name (`src/bee/BeeRig.js`, `src/axolotl/AxolotlRig.js`). A new model either
uses the same part names or needs its rig file adjusted to match.

## License

MIT
