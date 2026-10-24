import type { PluginOptions } from 'claude-code'

// Each tab and the git band has a boolean `userConfig` field (`show_<id>`), a row in /config.
// A change there reloads the module with the new options. A field left unset counts as on.
export const isOn = (options: PluginOptions, id: string) => options[`show_${id}`] !== false
