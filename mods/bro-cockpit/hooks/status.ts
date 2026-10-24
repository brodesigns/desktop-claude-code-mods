import type { Call } from '../types'

// Pure status helpers shared by the tabs and the head counts; no `$`, no state.

// A failed tool call. A call denied by a hook (any guard mod) is not a tool error and is not counted.
export const isFailed = (c: Call) => c.isError && c.isDenied !== true
