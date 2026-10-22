#!/usr/bin/env bash
# The views gate: no view formats, parses a time, or reads a raw fact.
# Prints each offending line and fails if there is one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWS="$ROOT/plugins/nextcost/hooks/views"
# Every view. A missing views directory, or one with no views, fails: a
# gate that reads nothing would pass.
VIEW_FILES=()
for f in "$VIEWS"/*.tsx; do
  if [ -e "$f" ]; then VIEW_FILES+=("$f"); fi
done
if [ "${#VIEW_FILES[@]}" -eq 0 ]; then
  echo "views-gate: no views found in $VIEWS" >&2
  exit 1
fi
# A raw fact, a parse, a format of its own (numbers and dates included), or
# an import of the formatters in any quoting, with or without its suffix.
RAW='\.raw\b|\.reading\.|Date\.parse|\.replace\(|Math\.round|\.toFixed\(|\.toLocaleString\(|\bIntl\.|["'\''`]\.\./format(\.tsx?)?["'\''`]'
if grep -nE "$RAW" "${VIEW_FILES[@]}"; then
  echo "views-gate: a view formats or reads a raw fact (see above)" >&2
  exit 1
fi
# Pulse and departures draw their own look: nothing from chips' files
# (chips.tsx and every chips-*.tsx, its open cards among them), no pill,
# battery or meter. Their files are, for each layout index.ts
# imports but chips, its `<name>.tsx` and every `<name>-*.tsx`.
INDEX="$VIEWS/index.ts"
NAMES=$(sed -nE "s/^import \{ [A-Za-z]+View \} from '\.\/([a-z-]+)'$/\1/p" "$INDEX" | grep -vx chips || true)
if [ -z "$NAMES" ]; then
  echo "views-gate: no layout but chips found in $INDEX" >&2
  exit 1
fi
# Every layout VIEWS holds is one read here: an import written another way
# would drop its files from the check.
IMPORTED=$(( $(printf '%s\n' "$NAMES" | wc -l) + 1 ))
HELD=$(grep -cE '^  [a-z]+: [A-Za-z]+View,$' "$INDEX" || true)
if [ "$IMPORTED" -ne "$HELD" ]; then
  echo "views-gate: $INDEX holds $HELD layouts but imports $IMPORTED as \`import { xView } from './x'\`" >&2
  exit 1
fi
LOOK=()
for name in $NAMES; do
  if [ ! -e "$VIEWS/$name.tsx" ]; then
    echo "views-gate: $INDEX names $name, which has no $name.tsx" >&2
    exit 1
  fi
  for f in "$VIEWS/$name.tsx" "$VIEWS/$name"-*.tsx; do
    if [ -e "$f" ]; then LOOK+=("$f"); fi
  done
done
if grep -nE "from ['\"]\./chips(-[a-z-]+)?(\.tsx)?['\"]|[pP]ill\(|[bB]attery|meter\(" "${LOOK[@]}"; then
  echo "views-gate: pulse and departures draw their own look (see above)" >&2
  exit 1
fi
# Every Svg is built by the kit's `svg`, so its size, air and stretch are
# written once: no other hook writes an <svg> root.
if grep -rn '<svg xmlns' "$ROOT"/plugins/nextcost/hooks | grep -v '/hooks/kit\.tsx:'; then
  echo "views-gate: build an Svg with kit.svg (see above)" >&2
  exit 1
fi
