# FaceAway (built by Bbokari)

Bbokari builds and runs this for you: 🛡️ FaceAway → 🔨 Set up / Update FaceAway.
It compiles `FaceAway.swift` (as `main.swift`) + `GlanceFace.swift` + `GlanceUI.swift` into `~/FaceAway/faceaway`
(macOS 14 or newer) and copies the ArcFace model and Glance's videos next to it. Build output: `~/FaceAway/build.log`.

From Glance (https://github.com/jonnyoo/glance), MIT License © 2026 Jonathan Zhou (see LICENSE-glance.txt):
- `GlanceFace.swift`: face recognition (5-point alignment → ArcFace embedding).
- `GlanceUI.swift`: the face setup (nine head poses, the blue sweep, the ring, the checkmark) and the Face ID
  pill with the scan videos (`unlockanimation.mp4`, `unsuccessfulunlockanimation.mp4`, `unlockstatic.png`).
  Always in Glance's "pill" style, for Macs without a notch.

The ArcFace model comes from InsightFace (w600k_mbf), which is for personal, non-commercial use only.

## Guard mode (how Bbokari runs it)
Bbokari starts FaceAway with `--app --guard --no-status-item` (plus `--watch` while 🛡️ Guard my Mac is on):
- Face ID is the lock: the Face ID lock screen comes up when you close the lid, walk away (`--lock-after`, default
  30 s) or press ⌃⌥⌘L, and opens as soon as it sees you. "Use Mac password" on it switches to macOS's own lock.
- Watching only checks who's there: you → nothing happens; someone else → Face ID lock, a photo and an iMessage
  (`--text-me`). Hiding the screen when you look away (decoy) is optional.
- No eye in the menu bar: Bbokari's menu bar icon (the bee in the Face ID brackets) runs everything.
