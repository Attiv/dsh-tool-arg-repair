import { withDefaultDescription } from './repair.js'

export const name = 'tool-arg-repair'
export const inject = ['tools']

const REPAIRABLE = new Set(['bash', 'pwsh'])

function repairDefinition(ctx, toolName, original) {
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
 * Shadow only the known command/code tools in the agent scope. The registry's
 * original definitions remain untouched; command/code stay required and all
 * original execution, sandbox, approval and output behavior is reused.
 */
export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    const disposers = []
    const install = () => {
      for (const toolName of ['bash', 'pwsh']) {
        const original = agent.ctx.tools.get(toolName, agent)
        if (original === undefined) continue
        disposers.push(agent.ctx.tools.register(repairDefinition(agent.ctx, toolName, original)))
      }
    }
    install()
    const stop = agent.ctx.on('tools/change', () => {
      while (disposers.length > 0) disposers.pop()()
      install()
    })
    agent.ctx.effect(() => {
      stop()
      while (disposers.length > 0) disposers.pop()()
    }, 'tool-arg-repair: cleanup')
  })
}

export { withDefaultDescription } from './repair.js'
