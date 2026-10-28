import { expect, test } from 'claude-code/testing'

import { printable, redact } from './keys'

// Fake secrets are built from parts so this file holds nothing a scanner would flag.
const pw = 'pass' + 'word'
const value = 'Xq7' + 'Lm2' + 'Pz9' + 'Rt4'

test('redact masks the formats a plain key list misses', () => {
  expect(redact(`DB_${pw.toUpperCase()}="${value}"`)).not.toContain(value)
  expect(redact(`export API_${'KEY'}=${value}`)).not.toContain(value)
  expect(redact(`{"${pw}": "${value}"}`)).not.toContain(value)
  expect(redact(`postgres://admin:${value}@db/app`)).not.toContain(value)
  expect(redact('eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12))).toBe('[secret removed]')
  const pem = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ') + '\nMIIBOgIBAAJBAK\n' + ['-----END RSA', 'PRIVATE KEY-----'].join(' ')
  expect(redact(`before\n${pem}\nafter`)).toBe('before\n[secret removed]\nafter')
})

test('redact leaves ordinary text alone', () => {
  expect(redact('Todo tab shows plain text, 3 tokens left')).toBe('Todo tab shows plain text, 3 tokens left')
})

test('printable drops colour codes and control characters, keeps text and tabs', () => {
  expect(printable('\u001b[31merror\u001b[0m: failed')).toBe('error: failed')
  expect(printable('a\u0007b\u0000c\u007fd\u009be')).toBe('abcde')
  expect(printable('tab\there')).toBe('tab\there')
})
