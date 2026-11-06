#!/bin/bash
# Makes a "Bbokari" app you can open from Launchpad, Spotlight or the Dock, with Bbokari's icon.
# Run once from the project folder:  npm run make-app
# (Run it again any time to rebuild the app, e.g. after moving the project folder.)
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
ICON_PNG="$PROJECT/assets/icon/bbokari.png"
BUNDLE_ID="com.bbokari.launcher"

# Where to put it: /Applications if we can write there, otherwise your own Applications folder.
if [ -n "${APP_DIR:-}" ]; then DEST="$APP_DIR"
elif [ -w /Applications ]; then DEST="/Applications"
else DEST="$HOME/Applications"; mkdir -p "$DEST"; fi
APP="$DEST/Bbokari.app"

if [ ! -d "$PROJECT/node_modules/electron" ]; then
  echo "First run 'npm install' in $PROJECT, then try again." >&2
  exit 1
fi

# Only ever replace an app that this script made.
if [ -e "$APP" ]; then
  if [ "$(/usr/bin/defaults read "$APP/Contents/Info" CFBundleIdentifier 2>/dev/null || true)" = "$BUNDLE_ID" ]; then
    rm -rf "$APP"
  else
    echo "There's already a different app at $APP. Move or rename it first." >&2
    exit 1
  fi
fi

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# 1. Icon: every size macOS wants, packed into one .icns file.
WORK="$(mktemp -d)"
ICONSET="$WORK/Bbokari.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_PNG" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$ICON_PNG" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Bbokari.icns"
rm -rf "$WORK"

# 2. The launcher: builds the pet's page, then opens it with Electron (so Bbokari keeps the
#    microphone/Accessibility permissions you already gave Electron).
cat > "$APP/Contents/MacOS/Bbokari" <<'LAUNCHER'
#!/bin/zsh
PROJECT="__PROJECT__"
LOG="$HOME/Library/Logs/Bbokari.log"
source "$HOME/.zprofile" >/dev/null 2>&1
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
ELECTRON="$PROJECT/node_modules/electron/dist/Electron.app"
if [ ! -d "$ELECTRON" ]; then
  osascript -e 'display alert "Bbokari can’t start" message "The minecraft_pet_v2 folder moved or isn’t set up. Open Terminal, go to the folder and run: npm install, then npm run make-app"'
  exit 1
fi
cd "$PROJECT" || exit 1
{ echo "--- $(date)"; npm run build; } >> "$LOG" 2>&1
open -a "$ELECTRON" --args "$PROJECT"
LAUNCHER
sed -i '' "s|__PROJECT__|$PROJECT|" "$APP/Contents/MacOS/Bbokari" 2>/dev/null || sed -i "s|__PROJECT__|$PROJECT|" "$APP/Contents/MacOS/Bbokari"
chmod +x "$APP/Contents/MacOS/Bbokari"

# 3. The app's ID card.
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Bbokari</string>
  <key>CFBundleDisplayName</key><string>Bbokari</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>Bbokari</string>
  <key>CFBundleIconFile</key><string>Bbokari</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Nudge Finder and Launchpad to notice the new icon.
touch "$APP"
echo "✅ Made $APP"
echo "   Open it from Launchpad or Spotlight (⌘ Space, type Bbokari), or drag it to your Dock."
open -R "$APP" 2>/dev/null || true
