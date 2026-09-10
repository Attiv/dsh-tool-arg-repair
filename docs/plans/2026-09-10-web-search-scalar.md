# Scalar web_search compatibility plan and evidence

**Goal:** Prevent empty tool arguments for a gateway incompatible with the `web_search` + `queries: string[]` signature.

**Approved design:** Keep the `web_search` name, advertise one required `query` string, normalize to the original `queries` array inside the existing executor wrapper. Multiple searches use separate calls. Continue accepting legacy canonical arrays at execution, without weakening original validation or fabricating missing search terms.

## Evidence

The latest local session recorded repeated `web_search({})`. A minimal synthetic request to the same configured provider captured raw SSE (not just DSH-parsed events):

| Tool signature | Returned argument delta |
| --- | --- |
| `web_search(queries: string[])` | `{}` |
| `web_search(query: string)` | `{"query":"DeepSeek Harness documentation"}` |
| `dsh_web_search(queries: string[])` | `{"queries":["DeepSeek Harness documentation"]}` |

This isolates a signature compatibility difference in the upstream response. It does not prove the internal mechanism of the gateway/model. No credentials or user conversation content are included in these synthetic probes.

## Implementation and verification

1. Add failing tests in `test.mjs` for the scalar advertised schema, preserved original schema/constraints, and scoped calling guidance lifecycle.
2. Update `index.js` to clone and adapt only the advertised schema, update description, and add scoped guidance overriding stale array-signature instructions. Reuse existing normalization, validation, executor and callback wrappers.
3. Bump to 0.1.1; update README installation/update instructions to account for linked plugin dependencies and cached file copies.
4. Run all tests, syntax and package checks. Verify the exact generated schema against the configured provider using a synthetic call.
5. Update the actual linked local installation, restart DSH after the active turn has ended, and check startup. Preserve configuration, credentials and session logs.
