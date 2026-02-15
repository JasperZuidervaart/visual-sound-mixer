#!/bin/bash
# ═══════════════════════════════════════════
#  Publiceer Share — Sleep een ZIP hierheen
# ═══════════════════════════════════════════
#
#  Gebruik:
#  1. Sleep een .zip bestand op dit icoon in Finder
#  2. Of dubbelklik en voer het pad in
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARES_DIR="$PROJECT_DIR/public/shares"

# ── Bepaal ZIP pad ──
if [ -n "$1" ]; then
  ZIP_PATH="$1"
else
  echo ""
  echo "  ╔══════════════════════════════════╗"
  echo "  ║     📦 Publiceer Share           ║"
  echo "  ╚══════════════════════════════════╝"
  echo ""
  echo "  Tip: je kunt ook een ZIP op dit bestand slepen!"
  echo ""
  read -p "  Pad naar ZIP (of sleep het bestand hierin): " ZIP_PATH
  # Strip quotes die Finder soms toevoegt
  ZIP_PATH=$(echo "$ZIP_PATH" | sed "s/^'//" | sed "s/'$//" | xargs)
fi

if [ ! -f "$ZIP_PATH" ]; then
  echo ""
  echo "  ❌ Bestand niet gevonden: $ZIP_PATH"
  echo ""
  read -p "  Druk Enter om te sluiten..."
  exit 1
fi

mkdir -p "$SHARES_DIR"

echo ""
echo "  📦 ZIP uitpakken..."
unzip -o "$ZIP_PATH" -d "$SHARES_DIR"

# Get share ID from ZIP contents
SHARE_ID=$(unzip -l "$ZIP_PATH" | grep 'meta.json' | awk '{print $4}' | cut -d'/' -f1)

if [ -z "$SHARE_ID" ]; then
  echo ""
  echo "  ❌ Geen geldige share ZIP (meta.json niet gevonden)"
  echo ""
  read -p "  Druk Enter om te sluiten..."
  exit 1
fi

echo ""
echo "  📁 Share '$SHARE_ID' uitgepakt"

# Git add, commit, push
cd "$PROJECT_DIR"

echo ""
echo "  🔄 Uploaden naar GitHub..."
git add "public/shares/$SHARE_ID"
git commit -m "Add share $SHARE_ID"
git push

SHARE_URL="https://jasperzuidervaart.github.io/visual-sound-mixer/#share-$SHARE_ID"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║  ✅ Share is gepubliceerd!       ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  🔗 $SHARE_URL"
echo ""
echo "  (Link is gekopieerd naar je klembord)"
echo ""

# Kopieer link naar klembord
echo -n "$SHARE_URL" | pbcopy

read -p "  Druk Enter om te sluiten..."
