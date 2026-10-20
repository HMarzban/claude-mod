declare module 'claude-code' {
  interface PluginState {
    'nextcost': {
      /** Whether the band is showing at all. */
      isHidden: boolean
      /** Whether the expanded line of facts is open. */
      isExpanded: boolean
    }
  }
}
