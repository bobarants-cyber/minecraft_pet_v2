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
