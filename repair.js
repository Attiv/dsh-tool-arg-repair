export const DEFAULT_DESCRIPTION = Object.freeze({
  bash: 'Run a bash command',
  pwsh: 'Run a PowerShell command',
  run_code: 'Run a TypeScript program',
})

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function withDefaultDescription(toolName, args) {
  if (!isRecord(args) || Object.hasOwn(args, 'description')) return args
  const description = DEFAULT_DESCRIPTION[toolName]
  return description === undefined ? args : { ...args, description }
}
