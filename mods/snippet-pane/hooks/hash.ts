// A short, stable FNV-1a hash in base 36: enough to tell texts or paths apart, never to secure anything.
export const shortHash = (text: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h.toString(36)
}
