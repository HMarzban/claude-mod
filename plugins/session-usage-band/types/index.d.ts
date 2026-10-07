declare module 'claude-code' {
  interface PluginState {
    'session-usage-band': {
      /** Whether the band is showing at all. */
      isHidden: boolean
      /** Whether the rate-limit and cache rows are open. */
      isExpanded: boolean
    }
  }
}
