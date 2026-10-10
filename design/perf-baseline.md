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
