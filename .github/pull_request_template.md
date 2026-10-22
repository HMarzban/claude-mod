## What and why

<!-- What this changes, and the problem it solves. -->

## Screenshots

<!-- For anything visual: the desktop band, collapsed and expanded, before and after. -->

## Checklist

- [ ] A test fails without this change and passes with it
- [ ] `claude plugin validate .` passes
- [ ] `claude plugin validate plugins/nextcost` passes
- [ ] `claude plugin test plugins/nextcost` passes
- [ ] `tsc -p plugins/nextcost` passes locally (CI can't run it; see CONTRIBUTING.md)
- [ ] `tools/views-gate.sh` passes
- [ ] `version` bumped in `plugin.json` and an entry added to `CHANGELOG.md`
- [ ] The plugin README updated, if the band reads differently
- [ ] The plugin README's *What it runs, reads and sends* and `SECURITY.md` updated, if the band runs, reads or hooks anything new
