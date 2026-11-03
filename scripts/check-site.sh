#!/bin/bash
# Checks the built site for anything that should not go public. Exits non-zero if it finds a problem.
# Usage: scripts/check-site.sh [site folder]
set -uo pipefail

site=${1:-_site}
failed=0
fail() { echo "FAIL: $1"; failed=1; }

if [ ! -d "$site" ]; then
  echo "No built site at $site. Run: quarto render" >&2
  exit 2
fi

# Files that should never be served.
bad_files=$(find "$site" \( -name '.Rhistory' -o -name '.DS_Store' -o -name '.env*' -o -name '*.qmd' -o -name '*.pem' -o -name '*.key' -o -name '*.docx' -o -name '*.csv' -o -name 'rsconnect' -o -name '_incoming' -o -name 'scripts' \))
[ -n "$bad_files" ] && fail "files that should not be public: $bad_files"

# Page text, leaving out Quarto's own libraries.
scan() {
  grep -rnEI --include='*.html' --include='*.json' --include='*.xml' --exclude-dir=site_libs "$1" "$site"
}
hits=$(scan 'PLACEHOLDER')
[ -n "$hits" ] && fail "unfinished PLACEHOLDER text:"$'\n'"$hits"
hits=$(scan '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}')
[ -n "$hits" ] && fail "unobscured email address:"$'\n'"$hits"
# The edges keep DOIs such as 10.1038/s41436-021-01120-1 from matching.
hits=$(scan '(^|[^0-9A-Za-z/.-])\(?[0-9]{3}\)?[ .-][0-9]{3}[ .-][0-9]{4}([^0-9]|$)')
[ -n "$hits" ] && fail "possible phone number:"$'\n'"$hits"
hits=$(scan '(ghp_|github_pat_|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key|setAccountInfo)')
[ -n "$hits" ] && fail "possible credential:"$'\n'"$hits"

# Anything visitors' browsers would fetch from another server.
hits=$(grep -rnEI --include='*.html' --exclude-dir=site_libs '<(script|img|iframe)[^>]+src="https?://|<link[^>]+href="https?://' "$site")
[ -n "$hits" ] && fail "third-party request:"$'\n'"$hits"
hits=$(grep -rnEI --include='*.css' 'url\(["'"'"']?https?://|@import +["'"'"']?(url\()?["'"'"']?https?://' "$site")
[ -n "$hits" ] && fail "third-party request in CSS:"$'\n'"$hits"

# Hidden metadata in published photos and PDFs.
if command -v exiftool >/dev/null; then
  while IFS= read -r -d '' file; do
    meta=$(exiftool -q -a -s -GPS:all -XMP:all -IPTC:all -Author -Creator -Producer -Artist -Title -Subject -Keywords -Make -Model -DateTimeOriginal -CreateDate "$file")
    [ -n "$meta" ] && fail "metadata in $file:"$'\n'"$meta"
  done < <(find "$site" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.pdf' \) -print0)
else
  fail "exiftool is not installed, so metadata could not be checked"
fi

if [ "$failed" -eq 0 ]; then
  echo "All checks passed."
fi
exit "$failed"
