import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DESCRIPTION, withDefaultDescription } from './repair.js'
import { apply } from './index.js'
import { defineTool, validateJsonSchemaValue, assertObjectJsonSchema, ToolArgsError } from '@deepseek-ai/dsh-tools'

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

function searchTool({ maxQueries = 4, additionalProperties, items = { type: 'string' } } = {}) {
  const calls = []
  const tool = defineTool({
    name: 'web_search',
    description: 'Provide 1–4 queries in the required queries array.',
    parameters: {
      queries: { type: 'array', required: true, items },
    },
    output: {
      schema: { type: 'string' },
      render: (args, value) => [{ type: 'text', text: `${args.queries.join(', ')}: ${value}` }],
      presentationMeta: (args) => ({ queries: args.queries }),
    },
    timeoutMs: 1000,
    async execute(args, exec) {
      if (args.queries.length === 0) throw new Error('queries must contain at least one query')
      if (args.queries.length > maxQueries) throw new Error(`queries must contain at most ${maxQueries} queries`)
      if (args.queries.some(query => query.trim().length === 0)) throw new Error('each query must be a non-empty string')
      calls.push({ args, exec })
      return 'search result'
    },
    presentCall: args => ({ title: args.queries.join(', ') }),
    presentResult: (args, result) => ({ title: args.queries.join(', '), result }),
    isConcurrencySafe: args => args.queries.length === 1,
  })
  if (additionalProperties !== undefined) tool.parameters.additionalProperties = additionalProperties
  return { tool, calls }
}

// Only the Cordis event/scoped registry boundary is faked. Tool validation,
// execute, presentation, and errors use the real published DSH defineTool.
function installTools(originals, { emitOnRegister = false } = {}) {
  const globals = new Map(originals.map(tool => [tool.name, tool]))
  const local = new Map()
  const prompts = new Map()
  const listeners = new Set()
  let cleanup
  const change = () => { for (const listener of [...listeners]) listener() }
  const agent = { ctx: {
    systemPrompt: {
      getSectionOrder: () => 500,
      section(section) {
        assert.equal(Number.isFinite(section.order), true)
        assert.equal(prompts.has(section.name), false)
        prompts.set(section.name, section)
        return () => prompts.delete(section.name)
      },
    },
    tools: {
      get: name => local.get(name) ?? globals.get(name),
      register(tool) {
        assert.equal(local.has(tool.name), false, 'duplicate scoped registration')
        local.set(tool.name, tool)
        if (emitOnRegister) change()
        return () => {
          assert.equal(local.get(tool.name), tool)
          local.delete(tool.name)
          if (emitOnRegister) change()
        }
      },
    },
    on(event, listener) {
      assert.equal(event, 'tools/change')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    effect(fn) { cleanup = fn },
  } }
  apply({ on(event, listener) {
    assert.equal(event, 'agent/created')
    listener({ agent })
  } })
  return { get: name => agent.ctx.tools.get(name), globals, local, prompts, change, dispose: () => cleanup() }
}

test('reproduces the upstream missing queries error before repair', async () => {
  const { tool } = searchTool()
  await assert.rejects(tool.execute({ query: 'DeepSeek' }, {}), {
    message: 'invalid arguments: missing required property "queries"',
    code: 'INVALID_ARGS',
  })
})

for (const key of ['query', 'q']) {
  for (const value of ['DeepSeek', ['DeepSeek', 'harness']]) {
    test(`web_search repairs ${key} ${Array.isArray(value) ? 'array' : 'string'} before original validation`, async () => {
      const { tool, calls } = searchTool({ additionalProperties: false })
      const originalSchema = structuredClone(tool.parameters)
      const registry = installTools([tool])
      const repaired = registry.get('web_search')
      const args = Object.freeze({ [key]: value })
      const exec = { arguments: args, signal: new AbortController().signal }
      assert.equal(await repaired.execute(args, exec), 'search result')
      assert.deepEqual(calls[0].args, { queries: Array.isArray(value) ? value : [value] })
      assert.equal(calls[0].exec, exec)
      assert.equal(exec.arguments, args)
      assert.deepEqual(tool.parameters, originalSchema)
      assert.deepEqual(repaired.parameters.required, ['query'])
      assert.deepEqual(validateJsonSchemaValue(originalSchema, calls[0].args), [])
      assert.equal(repaired.timeoutMs, tool.timeoutMs)
      registry.dispose()
    })
  }
}

test('advertises a required scalar query instead of the incompatible queries array', async () => {
  const { tool, calls } = searchTool()
  const originalSchema = structuredClone(tool.parameters)
  const repaired = installTools([tool]).get('web_search')
  assert.equal(repaired.name, 'web_search')
  assert.equal(repaired.parameters.properties.query.type, 'string')
  assert.equal(Object.hasOwn(repaired.parameters.properties, 'queries'), false)
  assert.deepEqual(repaired.parameters.required, ['query'])
  assert.doesNotThrow(() => assertObjectJsonSchema(repaired.parameters))
  assert.deepEqual(validateJsonSchemaValue(repaired.parameters, { query: 'DeepSeek' }), [])
  assert.notDeepEqual(validateJsonSchemaValue(repaired.parameters, {}), [])
  assert.notDeepEqual(validateJsonSchemaValue(repaired.parameters, { query: ['DeepSeek'] }), [])
  assert.match(repaired.description, /query.*string/i)
  assert.doesNotMatch(repaired.description, /required queries array/)
  await repaired.execute({ query: 'DeepSeek' }, {})
  assert.deepEqual(calls[0].args, { queries: ['DeepSeek'] })
  assert.deepEqual(tool.parameters, originalSchema)
})

test('keeps extra schema fields, required keys, and item constraints in scalar mode', () => {
  const { tool } = searchTool({ additionalProperties: false, items: { type: 'string', enum: ['allowed'] } })
  tool.parameters.properties.region = { type: 'string' }
  tool.parameters.required.push('region')
  const repaired = installTools([tool]).get('web_search')
  assert.deepEqual(repaired.parameters.required, ['query', 'region'])
  assert.equal(repaired.parameters.additionalProperties, false)
  assert.deepEqual(repaired.parameters.properties.region, { type: 'string' })
  assert.deepEqual(repaired.parameters.properties.query.enum, ['allowed'])
  assert.deepEqual(validateJsonSchemaValue(repaired.parameters, { query: 'allowed', region: 'cn' }), [])
  assert.notDeepEqual(validateJsonSchemaValue(repaired.parameters, { query: 'other', region: 'cn' }), [])
})

test('adds scalar-query guidance and cleans it up with the tool', () => {
  const { tool } = searchTool()
  const registry = installTools([tool], { emitOnRegister: true })
  assert.equal(registry.prompts.size, 1)
  assert.match([...registry.prompts.values()][0].text, /query.*string/i)
  registry.change()
  assert.equal(registry.prompts.size, 1)
  registry.globals.delete('web_search')
  registry.change()
  assert.equal(registry.prompts.size, 0)
  registry.dispose()
})

test('preserves explicit queries without overriding them from aliases', async () => {
  const { tool, calls } = searchTool()
  const repaired = installTools([tool]).get('web_search')
  const args = { queries: ['canonical'], query: 'ignored', q: 'also ignored' }
  await repaired.execute(args, {})
  assert.equal(calls[0].args, args)
})

test('invalid or ambiguous inputs never reach the search body', async () => {
  const { tool, calls } = searchTool()
  const repaired = installTools([tool]).get('web_search')
  for (const args of [
    {}, null, undefined, [], 'DeepSeek',
    { query: null }, { q: 42 }, { query: { query: 'DeepSeek' } },
    { query: ['ok', 42] }, { query: 'a', q: 'b' },
    { queries: null, query: 'fallback' }, { queries: 'wrong', q: 'fallback' },
    { queries: [42] }, { queries: undefined, query: 'fallback' },
  ]) {
    await assert.rejects(repaired.execute(args, {}), ToolArgsError)
  }
  assert.deepEqual(calls, [])
})

test('preserves original blank and deployment-specific query count errors', async () => {
  const { tool, calls } = searchTool({ maxQueries: 2 })
  const repaired = installTools([tool]).get('web_search')
  for (const [args, message] of [
    [{ query: '' }, 'each query must be a non-empty string'],
    [{ q: '  ' }, 'each query must be a non-empty string'],
    [{ query: [] }, 'queries must contain at least one query'],
    [{ q: ['a', 'b', 'c'] }, 'queries must contain at most 2 queries'],
  ]) {
    await assert.rejects(repaired.execute(args, {}), { message })
  }
  assert.deepEqual(calls, [])
})

test('normalizes all argument-consuming search callbacks', async () => {
  const { tool } = searchTool()
  const repaired = installTools([tool]).get('web_search')
  const args = { q: 'DeepSeek' }
  const result = { content: 'search result' }
  assert.deepEqual(repaired.presentCall(args), { title: 'DeepSeek' })
  assert.deepEqual(repaired.presentResult(args, result), { title: 'DeepSeek', result })
  assert.equal(repaired.isConcurrencySafe(args), true)
  assert.deepEqual(repaired.output.render(args, 'value'), [{ type: 'text', text: 'DeepSeek: value' }])
  assert.deepEqual(repaired.output.presentationMeta(args, 'value'), { queries: ['DeepSeek'] })
  assert.equal(repaired.presentCall({}), undefined)
  assert.equal(repaired.isConcurrencySafe({}), false)
})

test('does not wrap unsupported schemas or unrelated tools', () => {
  const { tool } = searchTool({ items: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } } } })
  const other = { ...tool, name: 'custom_search' }
  const registry = installTools([tool, other])
  assert.equal(registry.get('web_search'), tool)
  assert.equal(registry.get('custom_search'), other)
  registry.dispose()
})

test('refreshes tools on change and restores originals on cleanup', async () => {
  const first = searchTool()
  const registry = installTools([first.tool])
  const next = searchTool()
  registry.globals.set('web_search', next.tool)
  registry.change()
  await registry.get('web_search').execute({ query: 'updated' }, {})
  assert.equal(first.calls.length, 0)
  assert.equal(next.calls.length, 1)
  registry.dispose()
  assert.equal(registry.local.size, 0)
  assert.equal(registry.get('web_search'), next.tool)
  registry.change()
  assert.equal(registry.local.size, 0)
})

test('handles synchronous tools/change notifications from its own registrations', async () => {
  const { tool, calls } = searchTool()
  const registry = installTools([tool], { emitOnRegister: true })
  registry.change()
  await registry.get('web_search').execute({ q: 'DeepSeek' }, {})
  assert.equal(calls.length, 1)
  assert.equal(registry.local.size, 1)
  registry.dispose()
  assert.equal(registry.local.size, 0)
})

test('installs a late search tool and removes the repair when the tool disappears', async () => {
  const registry = installTools([], { emitOnRegister: true })
  const { tool, calls } = searchTool()
  registry.globals.set('web_search', tool)
  registry.change()
  await registry.get('web_search').execute({ q: 'late registration' }, {})
  assert.equal(calls.length, 1)
  registry.globals.delete('web_search')
  registry.change()
  assert.equal(registry.get('web_search'), undefined)
  assert.equal(registry.local.size, 0)
  registry.dispose()
})

test('does not drop unknown fields to bypass additionalProperties validation', async () => {
  const { tool, calls } = searchTool({ additionalProperties: false })
  const repaired = installTools([tool]).get('web_search')
  await assert.rejects(repaired.execute({ q: 'DeepSeek', unknown: true }, {}), ToolArgsError)
  assert.equal(calls.length, 0)
})

test('retains original item constraints and unrelated fields', async () => {
  const { tool, calls } = searchTool({ items: { type: 'string', enum: ['allowed'] } })
  const repaired = installTools([tool]).get('web_search')
  await repaired.execute({ query: 'allowed', providerOption: 'keep' }, {})
  assert.deepEqual(calls[0].args, { queries: ['allowed'], providerOption: 'keep' })
  await assert.rejects(repaired.execute({ q: 'not allowed' }, {}), ToolArgsError)
  assert.equal(calls.length, 1)
})

test('does not treat an original query/q schema property as an alias', () => {
  for (const key of ['query', 'q']) {
    const { tool } = searchTool()
    tool.parameters.properties[key] = { type: 'string' }
    assert.equal(installTools([tool]).get('web_search'), tool)
  }
})

test('validates canonical args even for tools not created by defineTool', async () => {
  const { tool } = searchTool()
  let invoked = false
  tool.execute = async () => { invoked = true }
  const repaired = installTools([tool]).get('web_search')
  await assert.rejects(repaired.execute({}, {}), ToolArgsError)
  assert.equal(invoked, false)
})

test('propagates original executor errors unchanged', async () => {
  const { tool } = searchTool()
  const error = new Error('provider unavailable')
  tool.execute = async () => { throw error }
  const repaired = installTools([tool]).get('web_search')
  await assert.rejects(repaired.execute({ q: 'DeepSeek' }, {}), caught => caught === error)
})

for (const name of ['bash', 'pwsh']) {
  test(`${name} still fills description and enforces command validation`, async () => {
    const tool = defineTool({
      name,
      description: 'Run command',
      parameters: {
        command: { type: 'string', required: true },
        description: { type: 'string', required: true },
      },
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async args => args.description,
    })
    const repaired = installTools([tool]).get(name)
    assert.equal(await repaired.execute({ command: 'pwd' }, {}), DEFAULT_DESCRIPTION[name])
    assert.deepEqual(repaired.parameters.required, ['command'])
    assert.deepEqual(tool.parameters.required, ['command', 'description'])
    await assert.rejects(repaired.execute({}, {}), ToolArgsError)
    await assert.rejects(repaired.execute({ command: 42 }, {}), ToolArgsError)
  })
}
