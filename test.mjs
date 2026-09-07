import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DESCRIPTION, withDefaultDescription } from './repair.js'

test('repairs only an omitted description', () => {
  assert.deepEqual(withDefaultDescription('bash', { command: 'pwd' }), {
    command: 'pwd',
    description: DEFAULT_DESCRIPTION.bash,
  })
})

test('preserves an explicit description', () => {
  assert.deepEqual(withDefaultDescription('pwsh', { command: 'Get-Location', description: 'custom' }), {
    command: 'Get-Location',
    description: 'custom',
  })
})

test('does not repair missing command or non-object arguments', () => {
  assert.deepEqual(withDefaultDescription('bash', {}), { description: DEFAULT_DESCRIPTION.bash })
  assert.equal(withDefaultDescription('bash', undefined), undefined)
  assert.equal(withDefaultDescription('bash', null), null)
})
