#!/usr/bin/env bash
# The views gate: outside chips, no view formats, parses a time, or reads a
# raw fact. Prints each offending line and fails if there is one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if grep -nE '\.raw\b|\.reading\.|Date\.parse|\.replace\(|Math\.round|from '\''\.\./format'\''' "$ROOT"/plugins/session-usage-band/hooks/views/*.tsx | grep -vE '/(chips|parts|frame)\.tsx:'; then
  echo "views-gate: a view formats or reads a raw fact (see above)" >&2
  exit 1
fi
