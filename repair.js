export const DEFAULT_DESCRIPTION = Object.freeze({
  bash: 'Run a bash command',
  pwsh: 'Run a PowerShell command',
  run_code: 'Run a TypeScript program',
})

/**
 * Envelope keys a model emits around the real arguments instead of passing them
 * at the top level. No DSH tool declares any of these as a parameter, and the
 * unwrap below refuses to treat one as an envelope when the tool does declare it.
 */
export const ARGUMENT_ENVELOPE_KEYS = Object.freeze(['arguments', 'expected'])

/** How many nested envelopes to peel off one call. */
const MAX_ENVELOPE_DEPTH = 3

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function withDefaultDescription(toolName, args) {
  if (!isRecord(args) || Object.hasOwn(args, 'description')) return args
  const description = DEFAULT_DESCRIPTION[toolName]
  return description === undefined ? args : { ...args, description }
}

/**
 * Peel model-authored argument envelopes (`{ arguments: … }`, `{ expected: … }`,
 * possibly nested) off a call.
 *
 * Fail-closed by construction: the original arguments must FAIL `fails` while a
 * peeled candidate must satisfy `accepts`. That gate is what keeps the repair
 * from rewriting a call the tool legitimately accepts (for example a tool that
 * really does declare `arguments`), and it never invents a call out of
 * arguments the tool would still reject — it only removes a wrapper the model
 * added around arguments the repaired tool will accept.
 *
 * Envelopes are rejected as ambiguous unless the wrapper is the call's ONLY
 * key, so a call that also carries real top-level parameters is never rewritten.
 *
 * @param args - the arguments exactly as the model sent them.
 * @param accepts - predicate deciding whether a candidate argument object would
 *   execute once this plugin's other repairs (alias conversion, description
 *   default) are applied.
 * @returns the peeled arguments, or `args` unchanged when no repair applies.
 */
export function unwrapArgEnvelope(args, accepts) {
  if (!isRecord(args) || typeof accepts !== 'function') return args
  if (accepts(args)) return args
  let current = args
  for (let depth = 0; depth < MAX_ENVELOPE_DEPTH; depth++) {
    const keys = Object.keys(current)
    if (keys.length !== 1 || !ARGUMENT_ENVELOPE_KEYS.includes(keys[0])) return args
    const inner = current[keys[0]]
    if (!isRecord(inner)) return args
    current = inner
    if (accepts(current)) return current
  }
  return args
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
