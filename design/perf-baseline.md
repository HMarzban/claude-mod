# Chips' draw times before the layouts work

Captured by `tools/golden/capture.sh` with the perf test as of f83c182, which shuts each surface before the next mounts (hooks identical to 40943d3): 200 redraws per case after 20 warm-up redraws, at 200 columns.

```
PERF clockReal true true
PERF chips terminal shut median=0.349ms p95=0.488ms
PERF chips terminal open median=0.730ms p95=2.238ms
PERF chips desktop shut median=0.358ms p95=0.533ms
PERF chips desktop open median=0.729ms p95=2.259ms
```

`clockReal` is `true`: `performance.now` advances in the test sandbox, so the spec's draw-time row stands alongside the tree-size budget.

## After the layouts

Captured by `tests/perf.test.ts` at 7aebb0a (`tools/test-only.sh perf`): each layout in a test of its own, chips first, drawn calm at 200 columns and in the last minute (5m TTL) at 60, on both surfaces, shut and open; 200 redraws per case after 20 warm-up redraws, and chips after an untimed pass of its own as well. Every layout passes its budgets: at most 2× chips' median in the same run, at most 400 nodes shut and 1,500 open, and no store write while drawing.

```
PERF chips calm|terminal|200|shut median=0.598ms
PERF chips calm|terminal|200|open median=0.880ms
PERF chips calm|desktop|200|shut median=0.473ms
PERF chips calm|desktop|200|open median=0.850ms
PERF gauges calm|terminal|200|shut median=0.434ms
PERF gauges calm|terminal|200|open median=0.815ms
PERF gauges calm|desktop|200|shut median=0.365ms
PERF gauges calm|desktop|200|open median=0.697ms
PERF ledger calm|terminal|200|shut median=0.293ms
PERF ledger calm|terminal|200|open median=0.472ms
PERF ledger calm|desktop|200|shut median=0.262ms
PERF ledger calm|desktop|200|open median=0.457ms
PERF rings calm|terminal|200|shut median=0.323ms
PERF rings calm|terminal|200|open median=0.667ms
PERF rings calm|desktop|200|shut median=0.302ms
PERF rings calm|desktop|200|open median=0.648ms
PERF pulse calm|terminal|200|shut median=0.250ms
PERF pulse calm|terminal|200|open median=0.539ms
PERF pulse calm|desktop|200|shut median=0.240ms
PERF pulse calm|desktop|200|open median=0.542ms
PERF tiles calm|terminal|200|shut median=0.268ms
PERF tiles calm|terminal|200|open median=0.685ms
PERF tiles calm|desktop|200|shut median=0.276ms
PERF tiles calm|desktop|200|open median=0.702ms
PERF week calm|terminal|200|shut median=0.291ms
PERF week calm|terminal|200|open median=0.481ms
PERF week calm|desktop|200|shut median=0.246ms
PERF week calm|desktop|200|open median=0.461ms
PERF departures calm|terminal|200|shut median=0.257ms
PERF departures calm|terminal|200|open median=0.612ms
PERF departures calm|desktop|200|shut median=0.243ms
PERF departures calm|desktop|200|open median=0.599ms
PERF forecast calm|terminal|200|shut median=0.225ms
PERF forecast calm|terminal|200|open median=0.565ms
PERF forecast calm|desktop|200|shut median=0.259ms
PERF forecast calm|desktop|200|open median=0.576ms
PERF chips lastMinute|terminal|60|shut median=0.549ms
PERF chips lastMinute|terminal|60|open median=0.921ms
PERF chips lastMinute|desktop|60|shut median=0.568ms
PERF chips lastMinute|desktop|60|open median=0.965ms
PERF gauges lastMinute|terminal|60|shut median=0.489ms
PERF gauges lastMinute|terminal|60|open median=0.851ms
PERF gauges lastMinute|desktop|60|shut median=0.406ms
PERF gauges lastMinute|desktop|60|open median=0.745ms
PERF ledger lastMinute|terminal|60|shut median=0.343ms
PERF ledger lastMinute|terminal|60|open median=0.505ms
PERF ledger lastMinute|desktop|60|shut median=0.302ms
PERF ledger lastMinute|desktop|60|open median=0.500ms
PERF rings lastMinute|terminal|60|shut median=0.438ms
PERF rings lastMinute|terminal|60|open median=0.776ms
PERF rings lastMinute|desktop|60|shut median=0.375ms
PERF rings lastMinute|desktop|60|open median=0.716ms
PERF pulse lastMinute|terminal|60|shut median=0.360ms
PERF pulse lastMinute|terminal|60|open median=0.632ms
PERF pulse lastMinute|desktop|60|shut median=0.345ms
PERF pulse lastMinute|desktop|60|open median=0.653ms
PERF tiles lastMinute|terminal|60|shut median=0.322ms
PERF tiles lastMinute|terminal|60|open median=0.723ms
PERF tiles lastMinute|desktop|60|shut median=0.314ms
PERF tiles lastMinute|desktop|60|open median=0.746ms
PERF week lastMinute|terminal|60|shut median=0.288ms
PERF week lastMinute|terminal|60|open median=0.474ms
PERF week lastMinute|desktop|60|shut median=0.249ms
PERF week lastMinute|desktop|60|open median=0.449ms
PERF departures lastMinute|terminal|60|shut median=0.279ms
PERF departures lastMinute|terminal|60|open median=0.627ms
PERF departures lastMinute|desktop|60|shut median=0.275ms
PERF departures lastMinute|desktop|60|open median=0.636ms
PERF forecast lastMinute|terminal|60|shut median=0.230ms
PERF forecast lastMinute|terminal|60|open median=0.540ms
PERF forecast lastMinute|desktop|60|shut median=0.284ms
PERF forecast lastMinute|desktop|60|open median=0.590ms
```

The slowest layout against chips, per layout, in that run: gauges 0.93×, rings 0.84×, tiles 0.83×, departures 0.70×, pulse 0.69×, forecast 0.68×, ledger 0.62×, week 0.55×. No layout is near its budget, so Task 28 builds no memo and moves no builder.

### Chips against P0

Chips' medians in `perf.test.ts` read high (0.60 ms calm, terminal, shut), since chips' calm test is the file's first and the sandbox runs its first draws cold for longer than its warm-up pass. The like-for-like comparison is P0's own method: the `perf baseline` test from `tools/golden/capture.test.ts`, repeated four times in one file, run against 4882313's hooks (the band before the layouts, with the 0.11.13 hover fix) and against 7aebb0a's, twice each; the fourth round, warm:

| Case | P0, run 1 | P0, run 2 | After, run 1 | After, run 2 |
| --- | --- | --- | --- | --- |
| terminal shut | 0.640 ms | 0.345 ms | 0.379 ms | 0.389 ms |
| terminal open | 0.820 ms | 0.735 ms | 0.748 ms | 0.847 ms |
| desktop shut | 0.348 ms | 0.376 ms | 0.378 ms | 0.381 ms |
| desktop open | 0.767 ms | 0.795 ms | 0.875 ms | 0.815 ms |

Chips is within noise of its baseline. Against P0 on the same machine and day, its warm medians are at most 0.04 ms higher shut and at most 0.11 ms open (terminal 0.748–0.847 against 0.735–0.820 ms, desktop 0.815–0.875 against 0.767–0.795 ms), while P0's own two runs differ by up to 0.30 ms (terminal shut). The committed P0 baseline above (0.349 / 0.730 / 0.358 / 0.729 ms) is lower than P0 re-measured today, by up to 0.29 ms: the machine moved, not the code.

### Repaints

Counted from the test side (`engine.invalidates`), terminal, 120 columns, the 1h TTL from a reply at 0; the same for every layout, since the timer reads no layout:

| Walk | Before 7aebb0a | After |
| --- | --- | --- |
| A calm ten minutes | 20 | 10 |
| The first hour | 700 | 650 |
| The cache's last ten minutes | 600 | 600 |
| The cache's last minute | 60 | 60 |

Before 7aebb0a, the timer's minute turned on the boundary while the countdowns turn just past it, so each minute repainted twice, once with nothing new; with the cache cold, a reset countdown stood a minute stale.

Other repaints, over one main-loop turn: 50 steps with usage gave 52 invalidates (50 steps, each changing the tree, and 2 timer ticks); the turn's end gave 2 (`turn.complete` and its git read), for one change: the git read repaints though the workspace is unchanged, one redraw of about 0.5 ms a turn, below what spec §9 asks of a change. No step repaints for nothing, so Task 28 adds no paint key.
