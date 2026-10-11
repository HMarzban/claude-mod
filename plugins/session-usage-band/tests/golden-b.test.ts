// tests/golden-b.test.ts — golden, scenarios 11–20. Golden doesn't cover the
// light palette, maxRows under 40, or the ascii tier.
import { goldenSuite } from './golden/suite'
import { GOLDEN_SCENARIOS } from './matrix'

goldenSuite(GOLDEN_SCENARIOS.slice(10))
