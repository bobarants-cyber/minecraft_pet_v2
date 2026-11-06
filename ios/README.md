# 📱 Bbokari for iPhone

A real iPhone app with Bbokari in it:

- 🐥 **Pocket Bbokari**: pet him, feed him, play ball, dress him up, play mini-games. It's the same as the claude.ai page, minus chat.
- 🪟 **Floating Bbokari**: tap **🪟 Float**, or just swipe home. Bbokari pops into a little window that stays on top of **every app**. Drag it anywhere, pinch it bigger or smaller, or swipe it to the side of the screen to tuck it away. Open the app again and he goes back home.
- 🏠 **Widgets**: Bbokari on your Home Screen and Lock Screen, saying something new every half hour ("Drink some water! 💧", "You got this! 💪"…).
- 🍅 **Focus timer**: tap 🍅 in the app. Bbokari and the countdown show up in the **Dynamic Island** and on the Lock Screen, and you get a notification when time's up.

> Apple doesn't let any app walk around on top of your other apps like Bbokari does on the Mac. The floating
> window is the closest thing iPhones allow. Inside it Bbokari waves, hops, dances and cheers you on, but you
> can't tap him there. Open the app to play with him.

## Build it on your Mac (the first time)

You need: your Mac, your iPhone, its USB cable, and your Apple ID. It's free, and you don't need to pay for a developer account.

1. **Install Xcode** from the Mac App Store. It's big, so this takes a while. Open it once and let it finish installing.
2. In Terminal:
   ```bash
   brew install xcodegen
   ```
   ```bash
   cd ~/Documents/minecraft_pet_v2/ios
   ```
   ```bash
   xcodegen
   ```
   ```bash
   open Bbokari.xcodeproj
   ```
3. In Xcode: **Xcode menu → Settings → Accounts → +** → sign in with your Apple ID.
4. In the left sidebar click the blue **Bbokari** project, then:
   - Click the **Bbokari** target → **Signing & Capabilities** → **Team** → choose your name (Personal Team).
   - Click the **BbokariWidget** target → **Signing & Capabilities** → **Team** → choose your name again.
   - If it says the bundle identifier is taken: open `project.yml`, change `com.bobarants.bbokari` to something
     unique (like `com.yourname.bbokari`), then run `xcodegen` again.
5. Plug in your iPhone and unlock it. Tap **Trust** if it asks.
6. On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. It restarts.
7. In Xcode, at the top, pick **your iPhone** as the device, then press **▶︎ (Run)**.
8. The first time, the iPhone says "Untrusted Developer". Go to **Settings → General → VPN & Device Management**,
   tap your Apple ID, then tap **Trust**. Press ▶︎ again.

Bbokari is now on your Home Screen 🎉

- **Add the widget:** long-press the Home Screen → **Edit → Add Widget** → search "Bbokari". For the Lock Screen:
  long-press the Lock Screen → **Customize** → tap the widget area → pick Bbokari.
- **Floating:** make sure **Settings → General → Picture in Picture → Start PiP Automatically** is on.

## Good to know

- With a free Apple ID, apps you install yourself **stop opening after 7 days**. To fix it, plug in the iPhone,
  open the project in Xcode and press ▶︎ again. Bbokari's stars and outfits stay saved.
- The 3D part needs internet the first time it opens, to download the 3D engine.
- To update after a `git pull`: run `xcodegen` again in the `ios` folder, then press ▶︎ in Xcode.

## How it's made

- `App/`: the SwiftUI app. `WebView.swift` shows `Resources/pocket.html`, and `FloatController.swift` is the floating
  picture-in-picture window. It plays `Resources/float.mp4`, a looping video of Bbokari filmed from the 3D page by
  `phone/render.cjs`. `FocusController.swift` is the Live Activity timer.
- `Widget/`: the Home and Lock Screen widget plus the Dynamic Island timer.
- `Resources/pocket.html` is built by `node phone/build.mjs` from `phone/template.html`.
