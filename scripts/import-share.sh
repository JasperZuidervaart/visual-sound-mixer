#!/bin/bash
# Import a share ZIP into public/shares/
# Usage: npm run import-share path/to/shareId.zip

if [ -z "$1" ]; then
  echo "Usage: npm run import-share <path-to-zip>"
  echo "Example: npm run import-share ~/Downloads/abc12345.zip"
  exit 1
fi

ZIP_PATH="$1"
if [ ! -f "$ZIP_PATH" ]; then
  echo "Error: File not found: $ZIP_PATH"
  exit 1
fi

# Get the directory where this script lives, then go to project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SHARES_DIR="$PROJECT_DIR/public/shares"

mkdir -p "$SHARES_DIR"

# Unzip into public/shares/ (the ZIP contains a folder named after the shareId)
unzip -o "$ZIP_PATH" -d "$SHARES_DIR"

# Get the share folder name from the ZIP
SHARE_ID=$(unzip -l "$ZIP_PATH" | grep 'meta.json' | awk '{print $4}' | cut -d'/' -f1)

if [ -z "$SHARE_ID" ]; then
  echo "Error: Could not find meta.json in ZIP"
  exit 1
fi

echo ""
echo "Share '$SHARE_ID' imported to public/shares/$SHARE_ID/"
echo ""
echo "Next steps:"
echo "  git add public/shares/$SHARE_ID"
echo "  git commit -m 'Add share $SHARE_ID'"
echo "  git push"
echo ""
echo "Share URL: https://jasperzuidervaart.github.io/visual-sound-mixer/#share-$SHARE_ID"
