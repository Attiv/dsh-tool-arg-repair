import { ToolArgsError, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { withDefaultDescription, withWebSearchQueries, unwrapArgEnvelope } from './repair.js'

export const name = 'tool-arg-repair'
export const inject = ['tools']

/** The reserved PTC transport cannot be shadowed (the registry rejects it). */
const RESERVED_TOOL = 'run_code'

/** Tools whose model-facing schema also drops the required `description`. */
const DESCRIPTION_REPAIR = new Set(['bash', 'pwsh'])

/** Always covered, even when the registry cannot enumerate its tools. */
const KNOWN_TOOLS = ['bash', 'pwsh', 'web_search']

function repairSearchDefinition(original) {
  const schema = original.parameters
  // Do not guess at another provider's object items or overwrite real fields.
  if (schema?.type !== 'object' || !schema.required?.includes('queries')
    || schema.properties?.queries?.type !== 'array'
    || schema.properties.queries.items?.type !== 'string'
    || Object.hasOwn(schema.properties, 'query') || Object.hasOwn(schema.properties, 'q')) return original

  const parameters = structuredClone(schema)
  parameters.properties.query = {
    ...parameters.properties.queries.items,
    description: 'Required search query string. Use one search query per call.',
  }
  delete parameters.properties.queries
  parameters.required = parameters.required.map(key => key === 'queries' ? 'query' : key)
  // Envelope first (the wrapper sits outside the aliases), then alias conversion.
  const settle = args => withWebSearchQueries(args)
  const accepts = args => validateJsonSchemaValue(schema, settle(args), '').length === 0
  const normalize = args => settle(unwrapArgEnvelope(args, accepts))
  const repaired = {
    ...original,
    description: 'Search the web for current information. Provide the required query string. Make separate calls for multiple queries. Returns an optional summary answer and a list of source URLs.',
    parameters,
    // Some gateways emit {} for web_search + queries[], but preserve query.
    // Only the model-facing schema changes; execution uses original validation.
    async execute(args, exec) {
      const normalized = normalize(args)
      const violations = validateJsonSchemaValue(schema, normalized, '')
      if (violations.length > 0) throw new ToolArgsError(violations)
      return original.execute(normalized, exec)
    },
    output: { ...original.output },
  }
  // Runtime output and replay/presentation still receive the raw logged args.
  for (const [target, source, methods] of [
    [repaired, original, ['presentCall', 'presentResult', 'isConcurrencySafe']],
    [repaired.output, original.output, ['render', 'presentationMeta']],
  ]) {
    for (const method of methods) {
      if (typeof source?.[method] !== 'function') continue
      target[method] = (args, ...rest) => source[method](normalize(args), ...rest)
    }
  }
  return repaired
}

function repairDefinition(toolName, original) {
  if (toolName === 'web_search') return repairSearchDefinition(original)
  const schema = original.parameters
  // Envelope repair needs an object argument schema; nothing else is touched.
  if (schema?.type !== 'object') return original
  const accepts = args => validateJsonSchemaValue(schema, withDefaultDescription(toolName, args), '').length === 0
  const normalize = args => withDefaultDescription(toolName, unwrapArgEnvelope(args, accepts))
  let parameters = original.parameters
  if (DESCRIPTION_REPAIR.has(toolName)) {
    parameters = structuredClone(original.parameters)
    const required = Array.isArray(parameters.required)
      ? parameters.required.filter((key) => key !== 'description')
      : undefined
    if (required === undefined || required.length === 0) delete parameters.required
    else parameters.required = required
  }
  const repaired = {
    ...original,
    parameters,
    output: { ...original.output },
    // Copy output so wrapping render/presentationMeta below never mutates the
    // original tool's output object: a shared reference would wrap the
    // original's own render and recurse until the stack overflows on every
    // rendered result.
    output: { ...original.output },
    async execute(args, exec) {
      return original.execute(normalize(args), exec)
    },
  }
  for (const [target, source, methods] of [
    [repaired, original, ['presentCall', 'presentResult', 'isConcurrencySafe']],
    [repaired.output, original.output, ['render', 'presentationMeta']],
  ]) {
    for (const method of methods) {
      if (typeof source?.[method] !== 'function') continue
      target[method] = (args, ...rest) => source[method](normalize(args), ...rest)
    }
  }
  return repaired
}

/**
 * Shadow every visible object-parameter tool in the agent scope without
 * changing original definitions. Reuse original execution, validation,
 * sandbox, approval and output behavior.
 */
export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    const disposers = []
    let refreshing = false
    // Enumerate the scope's visible catalog so envelope repair also reaches
    // tools this plugin does not name (subagent family, fs tools, …).
    const toolNames = () => {
      const names = new Set(KNOWN_TOOLS)
      try {
        for (const schema of agent.ctx.tools.schemas?.(agent) ?? []) names.add(schema.name)
      } catch {
        // An older registry without schemas() still gets the known repairs.
      }
      names.delete(RESERVED_TOOL)
      return names
    }
    const install = () => {
      for (const toolName of toolNames()) {
        const original = agent.ctx.tools.get(toolName, agent)
        if (original === undefined) continue
        const repaired = repairDefinition(toolName, original)
        if (repaired !== original) {
          disposers.push(agent.ctx.tools.register(repaired))
          if (toolName === 'web_search' && agent.ctx.systemPrompt !== undefined) {
            disposers.push(agent.ctx.systemPrompt.section({
              name: 'tool-arg-repair:web-search-query',
              order: agent.ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH') + 1,
              text: 'web_search compatibility signature: supply the required query string, for example {"query":"search terms"}. This replaces any queries-array calling guidance for web_search. For multiple queries, make separate calls. Never call it with an empty object.',
            }))
          }
        }
      }
    }
    install()
    const stop = agent.ctx.on('tools/change', () => {
      // Register/dispose can synchronously emit tools/change themselves.
      if (refreshing) return
      refreshing = true
      try {
        while (disposers.length > 0) disposers.pop()()
        install()
      } finally {
        refreshing = false
      }
    })
    agent.ctx.effect(() => () => {
      stop()
      while (disposers.length > 0) disposers.pop()()
    }, 'tool-arg-repair: cleanup')
  })
}

export { withDefaultDescription, withWebSearchQueries, unwrapArgEnvelope } from './repair.js'
