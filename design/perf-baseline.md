# Chips' draw times before the layouts work

Captured by `tools/golden/capture.sh` at 6540ef38d729186e8ab58f9333f67b625277f38a (hooks identical to 40943d3): 200 redraws per case after 20 warm-up redraws, at 200 columns.

```
PERF clockReal true true
PERF chips terminal shut median=0.394ms p95=0.794ms
PERF chips terminal open median=0.867ms p95=2.688ms
PERF chips desktop shut median=0.849ms p95=2.552ms
PERF chips desktop open median=0.369ms p95=0.606ms
```

`clockReal` is `true`: `performance.now` advances in the test sandbox, so the spec's draw-time row stands alongside the tree-size budget.
