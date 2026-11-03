#!/bin/bash
# Strips metadata from a photo or PDF and copies the clean version into assets/.
# Usage: scripts/add-file.sh _incoming/my-photo.heic headshot.jpg
#        scripts/add-file.sh _incoming/my-cv.pdf cv.pdf
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: scripts/add-file.sh <original file> <name in assets/>" >&2
  exit 2
fi
src=$1
out="assets/$2"
in_ext=$(printf '%s' "${src##*.}" | tr '[:upper:]' '[:lower:]')
out_ext=$(printf '%s' "${out##*.}" | tr '[:upper:]' '[:lower:]')
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

case "$out_ext" in
  jpg|jpeg)
    # sips also converts HEIC and PNG originals. It writes JPEG data whatever the input.
    sips -s format jpeg -Z 800 "$src" --out "$tmp/clean.jpg" >/dev/null
    exiftool -q -q -overwrite_original -all= --icc_profile:all -tagsFromFile @ -Orientation "$tmp/clean.jpg"
    mv "$tmp/clean.jpg" "$out"
    ;;
  png)
    sips -s format png -Z 800 "$src" --out "$tmp/clean.png" >/dev/null
    exiftool -q -q -overwrite_original -all= --icc_profile:all "$tmp/clean.png"
    mv "$tmp/clean.png" "$out"
    ;;
  pdf)
    if [ "$in_ext" != pdf ]; then
      echo "Export the file as a PDF first." >&2
      exit 1
    fi
    cp "$src" "$tmp/in.pdf"
    exiftool -q -q -overwrite_original -all:all= "$tmp/in.pdf"
    # exiftool only hides old PDF metadata. Rewriting the file with qpdf removes it.
    qpdf --linearize "$tmp/in.pdf" "$tmp/clean.pdf"
    mv "$tmp/clean.pdf" "$out"
    ;;
  *)
    echo "Use a .jpg, .png or .pdf name in assets/." >&2
    exit 1
    ;;
esac

echo "Saved $out. Remaining metadata:"
exiftool -a -G1 -s "$out" | grep -vE '^\[(ExifTool|System|File|Composite)\]' || true
