#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/软糖桌宠.app"
CONTENTS="$APP/Contents"
export CLANG_MODULE_CACHE_PATH="$ROOT/.build-cache/clang-modules"

rm -rf "$APP" "$ROOT/dist/软糖桌宠.app"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources/Web/assets" "$CLANG_MODULE_CACHE_PATH"

xcrun clang \
  -fobjc-arc \
  -fmodules \
  -mmacosx-version-min=12.0 \
  "$ROOT/native/DesktopPetApp.m" \
  -o "$CONTENTS/MacOS/SoftPet" \
  -framework AppKit \
  -framework WebKit

cp "$ROOT/native/Info.plist" "$CONTENTS/Info.plist"
cp "$ROOT/index.html" "$CONTENTS/Resources/Web/index.html"
cp "$ROOT/styles.css" "$CONTENTS/Resources/Web/styles.css"
cp "$ROOT/app.js" "$CONTENTS/Resources/Web/app.js"
cp -R "$ROOT/assets/." "$CONTENTS/Resources/Web/assets/"

chmod +x "$CONTENTS/MacOS/SoftPet"
codesign --force --deep --sign - "$APP"
xattr -cr "$APP" 2>/dev/null || true

echo "构建完成：$APP"
