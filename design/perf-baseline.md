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

Captured by `tests/perf.test.ts` in the whole suite (`claude plugin test plugins/session-usage-band`), against 7aebb0a's hooks: each layout in a test of its own, drawn calm at 200 columns and in the last minute (5m TTL) at 60, on both surfaces, shut and open; 200 redraws per case after 20 warm-up redraws. A file's first draws run cold for seconds, so every layout is first drawn once, untimed, and a last test holds each layout to 2× chips' median, case by case. Every layout passes its budgets: at most 2× chips' median in the same run, at most 400 nodes shut and 1,500 open, and no store write while drawing.

```
PERF chips calm|terminal|200|shut median=0.325ms
PERF chips calm|terminal|200|open median=0.686ms
PERF chips calm|desktop|200|shut median=0.341ms
PERF chips calm|desktop|200|open median=0.706ms
PERF gauges calm|terminal|200|shut median=0.334ms
PERF gauges calm|terminal|200|open median=0.685ms
PERF gauges calm|desktop|200|shut median=0.292ms
PERF gauges calm|desktop|200|open median=0.626ms
PERF ledger calm|terminal|200|shut median=0.250ms
PERF ledger calm|terminal|200|open median=0.426ms
PERF ledger calm|desktop|200|shut median=0.235ms
PERF ledger calm|desktop|200|open median=0.418ms
PERF rings calm|terminal|200|shut median=0.296ms
PERF rings calm|terminal|200|open median=0.612ms
PERF rings calm|desktop|200|shut median=0.270ms
PERF rings calm|desktop|200|open median=0.590ms
PERF pulse calm|terminal|200|shut median=0.235ms
PERF pulse calm|terminal|200|open median=0.523ms
PERF pulse calm|desktop|200|shut median=0.224ms
PERF pulse calm|desktop|200|open median=0.516ms
PERF tiles calm|terminal|200|shut median=0.256ms
PERF tiles calm|terminal|200|open median=0.645ms
PERF tiles calm|desktop|200|shut median=0.260ms
PERF tiles calm|desktop|200|open median=0.672ms
PERF week calm|terminal|200|shut median=0.278ms
PERF week calm|terminal|200|open median=0.458ms
PERF week calm|desktop|200|shut median=0.241ms
PERF week calm|desktop|200|open median=0.429ms
PERF departures calm|terminal|200|shut median=0.244ms
PERF departures calm|terminal|200|open median=0.588ms
PERF departures calm|desktop|200|shut median=0.233ms
PERF departures calm|desktop|200|open median=0.595ms
PERF forecast calm|terminal|200|shut median=0.205ms
PERF forecast calm|terminal|200|open median=0.536ms
PERF forecast calm|desktop|200|shut median=0.245ms
PERF forecast calm|desktop|200|open median=0.557ms
PERF chips lastMinute|terminal|60|shut median=0.529ms
PERF chips lastMinute|terminal|60|open median=1.014ms
PERF chips lastMinute|desktop|60|shut median=0.553ms
PERF chips lastMinute|desktop|60|open median=0.935ms
PERF gauges lastMinute|terminal|60|shut median=0.463ms
PERF gauges lastMinute|terminal|60|open median=0.814ms
PERF gauges lastMinute|desktop|60|shut median=0.384ms
PERF gauges lastMinute|desktop|60|open median=0.714ms
PERF ledger lastMinute|terminal|60|shut median=0.313ms
PERF ledger lastMinute|terminal|60|open median=0.476ms
PERF ledger lastMinute|desktop|60|shut median=0.287ms
PERF ledger lastMinute|desktop|60|open median=0.476ms
PERF rings lastMinute|terminal|60|shut median=0.403ms
PERF rings lastMinute|terminal|60|open median=0.730ms
PERF rings lastMinute|desktop|60|shut median=0.358ms
PERF rings lastMinute|desktop|60|open median=0.685ms
PERF pulse lastMinute|terminal|60|shut median=0.338ms
PERF pulse lastMinute|terminal|60|open median=0.615ms
PERF pulse lastMinute|desktop|60|shut median=0.332ms
PERF pulse lastMinute|desktop|60|open median=0.649ms
PERF tiles lastMinute|terminal|60|shut median=0.310ms
PERF tiles lastMinute|terminal|60|open median=0.696ms
PERF tiles lastMinute|desktop|60|shut median=0.307ms
PERF tiles lastMinute|desktop|60|open median=0.725ms
PERF week lastMinute|terminal|60|shut median=0.281ms
PERF week lastMinute|terminal|60|open median=0.455ms
PERF week lastMinute|desktop|60|shut median=0.240ms
PERF week lastMinute|desktop|60|open median=0.441ms
PERF departures lastMinute|terminal|60|shut median=0.273ms
PERF departures lastMinute|terminal|60|open median=0.603ms
PERF departures lastMinute|desktop|60|shut median=0.269ms
PERF departures lastMinute|desktop|60|open median=0.610ms
PERF forecast lastMinute|terminal|60|shut median=0.229ms
PERF forecast lastMinute|terminal|60|open median=0.518ms
PERF forecast lastMinute|desktop|60|shut median=0.276ms
PERF forecast lastMinute|desktop|60|open median=0.565ms
```

Chips reads warm (0.325 ms calm, terminal, shut, against P0's 0.349 ms). The slowest case against chips, per layout, in that run: gauges 1.03×, tiles 0.95×, rings 0.91×, departures 0.86×, week 0.85×, forecast 0.79×, ledger 0.77×, pulse 0.76×; two more runs read within 0.02× of these. No layout is near its budget, so Task 28 builds no memo and moves no builder.

### Chips against P0

The like-for-like comparison is P0's own method: the `perf baseline` test from `tools/golden/capture.test.ts`, repeated four times in one file, run against 4882313's hooks (the band before the layouts, with the 0.11.13 hover fix) and against 7aebb0a's, twice each; the fourth round, warm:

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
