// Writes only when the value differs (JSON compare, meant for small values). Every write redraws the
// readers of an atom and `update` writes even an equal value, so polls and counters go through here.
// The atom stays at the call site (`() => read($, runs)`, `v => update($, runs, () => v)`): validate
// accepts `read` and `update` only on an atom declared in the same file. True when it wrote.
export async function setIfChanged<T>(get: () => Promise<T>, set: (value: T) => Promise<unknown>, value: T): Promise<boolean> {
  if (JSON.stringify(await get()) === JSON.stringify(value)) return false
  await set(value)

  return true
}
