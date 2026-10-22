#!/usr/bin/env bash
# The views gate: no view formats, parses a time, or reads a raw fact; no
# layout but chips borrows chips' look; no hook but the kit writes an <svg>
# root. Prints each offending line and fails if there is one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS="$ROOT/plugins/nextcost/hooks"
VIEWS="$HOOKS/views"
fail() {
  echo "views-gate: $*" >&2
  exit 1
}
# Every view, .ts and .tsx. A missing views directory, or one with no
# views, fails: a gate that reads nothing would pass.
VIEW_FILES=()
for f in "$VIEWS"/*.ts "$VIEWS"/*.tsx; do
  if [ -e "$f" ]; then VIEW_FILES+=("$f"); fi
done
[ "${#VIEW_FILES[@]}" -gt 0 ] || fail "no views found in $VIEWS"
# views/ is flat: a view in a folder of its own would go unread.
NESTED=$(find "$VIEWS" -mindepth 2 -type f \( -name '*.ts' -o -name '*.tsx' \))
[ -z "$NESTED" ] || fail "views/ holds no folders; move each view up into it: $NESTED"

# A module named in any quoting, by any relative path, with or without its
# suffix, in a static import, an export's from or a dynamic import():
# `'../format'`, `"../views/chips.js"`, `import(`./chips-open`)`.
Q="[\"'\`]"
SUFFIX='(\.[cm]?[jt]sx?)?'
module() { printf '%s[^"'\''`]*/%s%s%s' "$Q" "$1" "$SUFFIX" "$Q"; }

# A raw fact, a parse, a format of its own (numbers and dates included), or
# an import of the formatters.
RAW="\\.raw\\b|\\.reading\\.|Date\\.parse|\\.replace\\(|Math\\.round|\\.toFixed\\(|\\.toLocaleString\\(|\\bIntl\\.|$(module format)"
if grep -nE "$RAW" "${VIEW_FILES[@]}"; then
  fail "a view formats or reads a raw fact (see above)"
fi

# The layouts, as LAYOUT_NAMES in snapshot.ts lists them: VIEWS is a
# Record over that list, so the compiler holds VIEWS to it. Written another
# way than one line of quoted names, it fails here rather than be misread.
SNAPSHOT="$HOOKS/snapshot.ts"
LIST=$(sed -nE "s/^export const LAYOUT_NAMES = \[([^]]*)\] as const$/\1/p" "$SNAPSHOT")
[ -n "$LIST" ] || fail "no \`export const LAYOUT_NAMES = [...] as const\` line in $SNAPSHOT"
LAYOUTS=$(printf '%s\n' "$LIST" | tr ',' '\n' | sed -nE "s/^ *'([a-z][a-z0-9]*)' *$/\1/p")
if [ "$(printf '%s\n' "$LAYOUTS" | grep -c .)" -ne "$(printf '%s\n' "$LIST" | tr ',' '\n' | grep -c .)" ]; then
  fail "LAYOUT_NAMES in $SNAPSHOT holds a name that is not a quoted lower-case word: [$LIST]"
fi
printf '%s\n' "$LAYOUTS" | grep -qx chips || fail "LAYOUT_NAMES in $SNAPSHOT has no chips"

# Each layout is VIEWS' entry by its name, the view its own <name>.tsx
# exports, so the files read below are the ones it draws with.
INDEX="$VIEWS/index.ts"
for name in $LAYOUTS; do
  [ -e "$VIEWS/$name.tsx" ] || fail "LAYOUT_NAMES names $name, which has no $name.tsx in $VIEWS"
  grep -qxF "import { ${name}View } from './$name'" "$INDEX" || fail "$INDEX doesn't import ${name}View as \`import { ${name}View } from './$name'\`"
  grep -qxF "  $name: ${name}View," "$INDEX" || fail "$INDEX doesn't hold $name as \`  $name: ${name}View,\`"
done

# Every view is a layout's, its <name>.tsx or a <name>-*.tsx, or shared:
# frame.tsx and shell.tsx, which layouts draw with, and view.ts and
# index.ts, which put them together. A file of no layout would draw
# unread by the look check below.
SHARED='frame.tsx shell.tsx view.ts index.ts'
OWNERS=$(printf '%s\n' "$LAYOUTS" | paste -sd '|' -)
for f in "${VIEW_FILES[@]}"; do
  base=$(basename "$f")
  case " $SHARED " in *" $base "*) continue ;; esac
  printf '%s\n' "$base" | grep -qE "^($OWNERS)(-[a-z0-9-]+)?\\.tsx?$" ||
    fail "$base belongs to no layout: name it <layout>-*.tsx, or share it as frame.tsx or shell.tsx"
done

# Every layout but chips draws its own look: nothing from chips' files
# (chips.tsx and every chips-*.tsx, its open cards among them), and no
# pill, battery or meter, by any name or alias. Read in each layout's
# files, its <name>.tsx and every <name>-*.tsx, and in the shared ones.
LOOK=()
for base in frame.tsx shell.tsx; do
  [ -e "$VIEWS/$base" ] || fail "no shared $base in $VIEWS"
  LOOK+=("$VIEWS/$base")
done
for name in $LAYOUTS; do
  [ "$name" = chips ] && continue
  for f in "$VIEWS/$name".ts "$VIEWS/$name".tsx "$VIEWS/$name"-*.ts "$VIEWS/$name"-*.tsx; do
    if [ -e "$f" ]; then LOOK+=("$f"); fi
  done
done
if grep -nE "$(module 'chips(-[a-z0-9-]+)?')|\\b[pP]ill\\b|[a-z0-9]Pill\\b|[bB]attery|\\b[mM]eter\\b|[a-z0-9]Meter\\b" "${LOOK[@]}"; then
  fail "pulse and departures draw their own look (see above)"
fi

# Every Svg is built by the kit's `svg`, so its size, air and stretch are
# written once: no other hook writes an <svg> root, whatever its attributes.
if grep -rnE '<svg\b' "$HOOKS" | grep -v '/hooks/kit\.tsx:'; then
  fail "build an Svg with kit.svg (see above)"
fi
