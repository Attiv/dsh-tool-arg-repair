# Web Search Argument Repair Implementation Plan

> Execute locally task-by-task using the test-driven-development and verification-before-completion skills.

**Goal:** Repair omitted web_search queries when an unambiguous query/q alias is supplied.

**Architecture:** Extend the existing scoped definition wrapper. Keep the canonical required schema, normalize without mutating inputs before the original defineTool execute validation, and validate canonical arguments before delegating to the original executor. Inspect upstream validation and search definitions before selecting the exact schema adapter.

**Tech Stack:** JavaScript ES modules, Node.js test runner, DSH tool registry/schema validator.

---

### Task 1: Confirm upstream contract and reproduce
- Inspect the published peer package validator and web_search item schema.
- Modify `test.mjs` to test plugin registration with a minimal scoped-registry fixture and realistic search schema.
- Run `node --test test.mjs`; the new alias-to-queries case must fail because web_search is not wrapped.

### Task 2: Implement narrow repair
- Modify `repair.js` with immutable alias normalization; preserve explicit queries and reject absent/ambiguous/invalid aliases.
- Modify `index.js` to shadow web_search only for the supported original schema, normalize alias input before normal execution validation, validate normalized arguments using the original schema, then delegate.
- Keep bash/pwsh behavior and lifecycle intact.
- Run regression tests, including schema restrictions, error propagation, original definition immutability and cleanup.

### Task 3: Document and verify
- Update `README.zh.md` with supported examples, limits and restart instructions.
- Add `npm test` to `package.json`; add any directly imported runtime dependency explicitly.
- Run `npm test`, syntax checks, `git diff --check` and package dry-run.
- Review final diff; report exact test results and clarify that a live DSH session was not available.

## Confirmed upstream contract

The published dsh-tools dispatch calls tool.execute directly. defineTool owns input validation inside its execute wrapper. Therefore web_search can retain its original required queries schema; no schema relaxation or alias advertising is needed. Upstream queries.items is string, and the original search body owns blank/query-count checks. Preserve all argument-consuming presentation/output/concurrency callbacks by normalizing their inputs too.

## Verification notes

- Confirmed missing-required failure and all four query/q string/array regressions failed before implementation, then passed after repair.
- Added synchronous registration-change regression; reproduced duplicate scoped registration, then fixed same-agent re-entry with a refresh guard.
- Tests also exercise real DSH validation, canonical schema preservation, output/presentation callbacks, deployment-specific query limits, error identity, delayed registration/removal and bash/pwsh regressions.
- Reference version: `@deepseek-ai/dsh-tools@0.1.2-rc.1`. No live user DSH session or real search provider was available.
- Upstream search definition: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/tool-web/src/search.ts
- Upstream validation/dispatch: published `@deepseek-ai/dsh-tools@0.1.2-rc.1`, `lib/types/schema.js` and `lib/types/index.js`.
