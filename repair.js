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

/** Normalize only an unambiguous alias; never replace explicit queries. */
export function withWebSearchQueries(args) {
  if (!isRecord(args) || Object.hasOwn(args, 'queries')) return args
  const aliases = ['query', 'q'].filter(key => Object.hasOwn(args, key))
  if (aliases.length !== 1) return args
  const key = aliases[0]
  const value = args[key]
  const queries = typeof value === 'string' ? [value] : value
  if (!Array.isArray(queries) || !queries.every(query => typeof query === 'string')) return args
  const repaired = { ...args, queries }
  delete repaired[key]
  return repaired
}
