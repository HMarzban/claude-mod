// What each kind of token costs against base input, by model, as Anthropic
// lists it: the multipliers the band weighs a bill's tokens by, and the
// price tiers a long prompt pays. The base rate itself is no table's: the
// cache model solves it from the session's own bill.

/** Tokens by kind, as a bill counts them. */
export type TokenCounts = Readonly<{ uncached: number; written: number; read: number; output: number }>

export const NO_TOKENS: TokenCounts = { uncached: 0, written: 0, read: 0, output: 0 }

export const addTokens = (a: TokenCounts, b: TokenCounts): TokenCounts => ({
  uncached: a.uncached + b.uncached,
  written: a.written + b.written,
  read: a.read + b.read,
  output: a.output + b.output,
})

// The price of each kind of token against base input. Writes and output hold
// one ratio across Anthropic's models; reads do not. Claude Code's own ledger
// prices every cache write at 1.25×, whatever its lifetime, so the band does
// too, to agree with the cost it shows.
export const WRITE_MULT = 1.25
const OUTPUT_MULT = 5
/** A cache read against base input, by model; 0.1× elsewhere. Per Anthropic's
 *  list prices as of 2026-10: Opus 5.5 reads at $0.20 on $4.00 input, Sonnet
 *  5.5 at $0.10 on $2.00, Fable and Mythos 5.1 at $0.25 on $10.00. */
const READ_MULT_BY_MODEL: Readonly<Record<string, number>> = {
  'claude-opus-5-5': 0.05,
  'claude-sonnet-5-5': 0.05,
  'claude-fable-5-1': 0.025,
  'claude-mythos-5-1': 0.025,
}
const DEFAULT_READ_MULT = 0.1

/** The model a name bills as. `/model` names a 1M context window with a
 *  suffix, `claude-opus-5-5[1m]`, and the cost record names the model alone. */
export const modelName = (model: string): string => model.replace(/\[[^\]]*\]$/, '')

/** Prices that rise with a request's prompt, by model: past `over` input
 *  tokens, every price is `factor` times the lower tier's. Per Anthropic's
 *  list prices as of 2026-10: Haiku 5.5 is $0.10 input up to 100,000 prompt
 *  tokens and $0.50 over, the cache and output prices alike. */
const TIERS_BY_MODEL: Readonly<Record<string, Readonly<{ over: number; factor: number }>>> = {
  'claude-haiku-5-5': { over: 100_000, factor: 5 },
}

/** How many times the lower tier's prices a request with `prompt` input
 *  tokens pays on `model`: 1 on a model with one tier. */
export const tierFactor = (model: string | undefined, prompt: number): number => {
  const tier = model === undefined ? undefined : TIERS_BY_MODEL[modelName(model)]
  return tier !== undefined && prompt > tier.over ? tier.factor : 1
}

/** What a cache read costs against base input on `model`. */
export const readMultiplier = (model: string | undefined): number =>
  (model === undefined ? undefined : READ_MULT_BY_MODEL[modelName(model)]) ?? DEFAULT_READ_MULT

/** Tokens weighted by their price against base input on `model`: the one
 *  unknown left is the base rate itself. */
export const weightedTokens = (t: TokenCounts, model: string | undefined): number =>
  t.uncached + WRITE_MULT * t.written + readMultiplier(model) * t.read + OUTPUT_MULT * t.output
