declare module 'claude-code' {
  interface PluginState {
    'nextcost': {
      /** Whether the band is showing at all. */
      isHidden: boolean
      /** Whether the band is open: its view beneath the collapsed row. */
      isExpanded: boolean
    }
  }
}
