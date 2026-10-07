declare module 'claude-code' {
  interface PluginState {
    'session-usage-band': {
      /** Whether the band is showing at all. */
      isHidden: boolean
      /** Whether the expanded line of facts is open. */
      isExpanded: boolean
    }
  }
}
