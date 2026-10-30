# Magic Scroll Ecology


## The spec

[SPEC.md](SPEC.md) is the whole simulation in one file, enough to rebuild it from nothing else: every rule, every setting with its default and range, the default map and the Jobs table. `node tools/spec.js` makes it from rules.js (each page's Implementation details) and the models, so change those and run it again; the checks below fail while it's out of date.

## Checks

`node tests/run.js` plays every page's village, checking the rules day by day (food adds up, floors, couples, crews, crafts, the flock, the water, no NaN), then opens every page at its default settings and with every slider at its lowest and highest. It needs Node 18 or later and Edge or Chrome, nothing to install, and takes about 8 minutes. `--quick` is a few minutes; `--full` adds every number at 0 and at 3×, and Macro against Micro.
