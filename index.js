import { ToolArgsError, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { withDefaultDescription, withWebSearchQueries } from './repair.js'

export const name = 'tool-arg-repair'
export const inject = ['tools']

const REPAIRABLE = ['bash', 'pwsh', 'web_search']

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
  const repaired = {
    ...original,
    description: 'Search the web for current information. Provide the required query string. Make separate calls for multiple queries. Returns an optional summary answer and a list of source URLs.',
    parameters,
    // Some gateways emit {} for web_search + queries[], but preserve query.
    // Only the model-facing schema changes; execution uses original validation.
    async execute(args, exec) {
      const normalized = withWebSearchQueries(args)
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
      target[method] = (args, ...rest) => source[method](withWebSearchQueries(args), ...rest)
    }
  }
  return repaired
}

function repairDefinition(toolName, original) {
  if (toolName === 'web_search') return repairSearchDefinition(original)
  const parameters = structuredClone(original.parameters)
  const required = Array.isArray(parameters.required)
    ? parameters.required.filter((key) => key !== 'description')
    : undefined
  if (required === undefined || required.length === 0) delete parameters.required
  else parameters.required = required
  const repaired = {
    ...original,
    parameters,
    async execute(args, exec) {
      return original.execute(withDefaultDescription(toolName, args), exec)
    },
  }
  return repaired
}

/**
 * Shadow known tools in the agent scope without changing original definitions.
 * Reuse original execution, validation, sandbox, approval and output behavior.
 */
export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    const disposers = []
    let refreshing = false
    const install = () => {
      for (const toolName of REPAIRABLE) {
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
    agent.ctx.effect(() => {
      stop()
      while (disposers.length > 0) disposers.pop()()
    }, 'tool-arg-repair: cleanup')
  })
}

export { withDefaultDescription, withWebSearchQueries } from './repair.js'
