## What and why

<!-- What this changes, and the problem it solves. -->

## Screenshots

<!-- For anything visual: the desktop band, collapsed and expanded, before and after. -->

## Checklist

- [ ] A test fails without this change and passes with it
- [ ] `claude plugin validate .` passes
- [ ] `claude plugin validate plugins/session-usage-band` passes
- [ ] `claude plugin test plugins/session-usage-band` passes
- [ ] `tsc -p plugins/session-usage-band` passes locally (CI can't run it; see CONTRIBUTING.md)
- [ ] `tools/views-gate.sh` passes
- [ ] `version` bumped in `plugin.json` and an entry added to `CHANGELOG.md`
- [ ] The plugin README updated, if the band reads differently
