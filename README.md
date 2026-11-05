# Minecraft Pet v2

A Minecraft-style mob that lives on your Mac desktop, and now it's also your personal assistant.

```bash
npm install
npm start
```

> Use **Node 22** (`brew install node@22`). With very new Node versions, npm may skip Electron's
> download step, and you'll get "Electron failed to install correctly".

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

## Your own 3D models

The bee and axolotl come from `assets/models/bee.glb` and `assets/models/axolotl.glb`, and the code
animates their parts by name (`src/bee/BeeRig.js`, `src/axolotl/AxolotlRig.js`). A new model either
uses the same part names or needs its rig file adjusted to match.

## License

MIT
