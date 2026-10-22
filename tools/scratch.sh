# shellcheck shell=bash
# Sourced by the tools that run tests outside the plugin's folder.
# scratch_plugin PLUGIN: a scratch copy of the plugin in $SCRATCH, everything
# but its tests (hidden folders, the manifest and the types, included) and an
# empty tests/, removed when the shell exits.
scratch_plugin() {
  SCRATCH="$(mktemp -d)"
  trap 'rm -rf "$SCRATCH"' EXIT
  find "$1" -mindepth 1 -maxdepth 1 ! -name tests -exec cp -R {} "$SCRATCH/" \;
  mkdir -p "$SCRATCH/tests"
}
