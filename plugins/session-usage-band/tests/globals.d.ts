// The sandbox has console at runtime; the es2023 lib tsc checks against
// doesn't declare it.
declare const console: { log(...a: unknown[]): void }
