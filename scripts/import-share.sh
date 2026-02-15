#!/bin/bash
# Import a share ZIP, commit, and push — all in one step
# Usage: npm run import-share path/to/shareId.zip

set -e

if [ -z "$1" ]; then
  echo ""
  echo "  📦 Share Import Tool"
  echo "  ────────────────────"
  echo "  Gebruik: npm run import-share <pad-naar-zip>"
  echo ""
  echo "  Voorbeeld:"
  echo "    npm run import-share ~/Downloads/ndev31ve.zip"
  echo ""
  exit 1
fi

ZIP_PATH="$1"
if [ ! -f "$ZIP_PATH" ]; then
  echo "❌ Bestand niet gevonden: $ZIP_PATH"
  exit 1
fi

# Go to project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SHARES_DIR="$PROJECT_DIR/public/shares"

mkdir -p "$SHARES_DIR"

echo ""
echo "📦 ZIP uitpakken..."
unzip -o "$ZIP_PATH" -d "$SHARES_DIR"

# Get the share folder name from the ZIP
SHARE_ID=$(unzip -l "$ZIP_PATH" | grep 'meta.json' | awk '{print $4}' | cut -d'/' -f1)

if [ -z "$SHARE_ID" ]; then
  echo "❌ Kon meta.json niet vinden in de ZIP"
  exit 1
fi

echo ""
echo "📁 Share '$SHARE_ID' uitgepakt naar public/shares/$SHARE_ID/"

# Git add, commit, push
cd "$PROJECT_DIR"

echo ""
echo "🔄 Git commit & push..."
git add "public/shares/$SHARE_ID"
git commit -m "Add share $SHARE_ID"
git push

echo ""
echo "✅ Klaar! Share is live."
echo ""
echo "🔗 Link: https://jasperzuidervaart.github.io/visual-sound-mixer/#share-$SHARE_ID"
echo ""
echo "   (Het kan ~30 sec duren voor GitHub Pages geüpdatet is)"
echo ""
