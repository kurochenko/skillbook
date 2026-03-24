# Living System Specification

You are working with a **Living Spec** — a structured knowledge base that describes the domain, behavior, integrations, and design decisions of this project. Read this file completely before writing any code.

## Purpose

This spec is the precondition for coding, not a post-hoc artifact. Before implementing anything:

1. Identify which **Feature** you are working on
2. Traverse its graph to collect all referenced primitives
3. Run the completeness check (described below)
4. If there are gaps — **stop and ask** before writing code

---

## Meta-Model

### Primitives

The spec is composed of typed files. Each file has YAML frontmatter (the structured part) and a markdown body (the prose part). One file per primitive, stored in `.spec/{type}s/`.

| Type | Folder | What it captures |
|---|---|---|
| **Term** | `.spec/terms/` | A named domain concept with an unambiguous definition scoped to one bounded context. |
| **Invariant** | `.spec/invariants/` | A condition that must hold true at all times with zero exceptions. Violating an invariant is a defect. |
| **Rule** | `.spec/rules/` | A configurable business policy. Violating a rule is a business rejection, not a bug. |
| **Event** | `.spec/events/` | A named occurrence that has already happened. Always past tense. |
| **Flow** | `.spec/flows/` | An ordered sequence of steps achieving a domain outcome. The unit of behavior. |
| **Contract** | `.spec/contracts/` | An interface boundary with an external system. |
| **Decision** | `.spec/decisions/` | A design choice with context, rationale, alternatives considered, and consequences. |
| **Feature** | `.spec/features/` | A named capability that declares which primitives it requires. The entry point for completeness checking. |

### Edges

Six typed, directional relationships. Declared in the `links` section of each file's frontmatter.

| Edge | Direction | Meaning |
|---|---|---|
| **depends-on** | any → any | X cannot be defined or function correctly without Y. |
| **constrains** | Invariant\|Rule → Term\|Flow | X imposes a restriction on Y. |
| **includes** | Feature → any; Term → Term | X has Y as a constituent part. |
| **maps-to** | Term → Term; Contract → Term | X in one context/system corresponds to Y in another. |
| **emits** | Flow → Event | X produces Y as a result of execution. |
| **triggers** | Event → Flow; Event → Event | X causes Y to begin. |

### Bounded Context

A named domain boundary that scopes the meaning of primitives. Every file carries a `context` field in frontmatter. Context is not a primitive type — it has no file of its own.

When multiple contexts define the same concept (e.g., billing and recipe both have a "status" term), context becomes part of the identity. The qualified ref becomes `context.prefix:slug` (e.g., `billing.term:status`). If a slug is unique within its type across all contexts, the short form `prefix:slug` still works.

A primitive with no context is a **shared concept** available to all contexts (e.g., `term:money`, `term:timestamp`).

Contexts are implicit — created when the first primitive uses one.

**Cross-context edge conventions:**

- `maps-to` crossing contexts → **healthy**. Explicit mapping between projections of the same real-world concept.
- `triggers` crossing contexts → **healthy**. Event-driven integration — the clean seam between contexts.
- `depends-on` crossing contexts → **smell**. Tight coupling. Consider introducing an event or contract at the boundary.
- `constrains` crossing contexts → **smell**. One context imposing rules on another. The constrained context should own its own invariants/rules.
- `includes` crossing contexts → **fine for features** (they naturally span contexts), **smell for terms** (suggests a missing shared kernel).
- `emits` crossing contexts → **should not happen**. A flow and the events it emits belong to the same context.

**Cross-context integration patterns:**

When the graph reveals cross-context coupling, these patterns guide the fix:

1. **Shared Kernel** — concepts that genuinely belong to no single context. Store them without a context prefix (`term:money`, `term:timestamp`). When two contexts define near-identical terms without a `maps-to` edge, consider extracting to a shared concept.

2. **Context Mapping** — same real-world thing, different projections per context. `billing.term:customer` (payment method, tax ID) maps-to `crm.term:customer` (contact history, lifecycle stage). Each context owns its own definition; the `maps-to` edge documents the correspondence. Changes to one should prompt review of the other.

3. **Event-Driven Integration** — the clean seam between contexts. Context A's flow emits an event; context B's flow is triggered by it. No direct `depends-on` across the boundary. When you see cross-context `depends-on`, decomposing into emit/trigger is usually the fix.

4. **Contract Boundary** — integration with external or legacy systems. A `contract` primitive in your context translates the external model into your internal terms via `maps-to` edges. The contract declares what you send, what you receive, and failure modes — keeping the external model's complexity at the boundary.

5. **Smell Detection** — the graph reveals structural problems. High cross-context `depends-on` density between two contexts suggests they may be one context or are missing a shared kernel. Same-slug-different-context pairs without `maps-to` edges suggest accidental duplication. A context with zero cross-context edges is either truly independent or missing integration points.

---

## File Format

```yaml
---
type: term | invariant | rule | event | flow | contract | decision | feature
name: Human Readable Name
id: kebab-case-slug
context: bounded-context-name
deprecated: true  # optional — only add when marking a primitive as no longer relevant
links:
  - edge: depends-on | constrains | includes | maps-to | emits | triggers
    target: prefix:target-slug  # or context.prefix:target-slug
tags: [optional, grouping, tags]
---

Prose body goes here. Free-form markdown.
```

### Deprecation

There is no status lifecycle. If a file exists, it's active. The only flag is `deprecated: true` — a soft delete. Do not delete primitive files. Deprecate them instead.

### Naming conventions

- **id** (slug): kebab-case, unique within its (type, context) pair
- **qualified id**: `prefix:slug` or `context.prefix:slug`. Prefixes: `term`, `inv`, `rule`, `evt`, `flow`, `con`, `dec`, `feat`. Short form works when unambiguous; full form required when the same type+slug exists in multiple contexts.
- **type input**: CLI commands accept both the full type name (`feature`) and the prefix (`feat`). Frontmatter always stores the full name.
- **filename**: `{slug}.md` inside the type folder, or `{context}.{slug}.md` when context is present. E.g., `.spec/terms/ltv.md`, `.spec/terms/billing.status.md`
- **target** in links: the qualified id. Use short form when unambiguous, full form when needed. E.g., `target: term:ltv`, `target: billing.term:status`

---

## How to Use This Spec (LLM Instructions)

### Before implementing a feature

1. Read the Feature file for the capability you're implementing
2. Collect all primitives the Feature `includes`
3. Recursively collect `depends-on` targets, `constrains` sources, `emits`/`triggers` targets
4. Check: does every referenced id have a corresponding file?
   - YES → proceed to implement
   - NO → list gaps and ask the user before writing code

### When you find a gap

1. **Stop.** Do not guess or infer.
2. Tell the user exactly what's missing and why you need it.
3. Propose a primitive — suggest the type, name, id, and definition.
4. Wait for confirmation. Write the file only after.

### When starting with an existing project (brownfield)

1. Do NOT reverse-engineer the entire domain at once
2. Start with the Feature you're currently working on
3. Define only the primitives that Feature needs
4. The spec grows naturally through use

### Deriving tests from the spec

Four primitive types are testable — their files tell you exactly what to test:

**Invariants** → unit tests. The file declares a condition and a violation outcome. Write one test asserting the condition holds and one asserting the violation path behaves correctly.

**Rules** → unit tests. Same as invariants, but rules are parameterized. Test the default behavior and boundary values of each parameter.

**Flows** → happy path + error path tests. The file lists steps (the happy path) and error paths (the edge cases). Each step is a test assertion, each error path is a test case.

**Contracts** → integration or contract tests. The file declares what we send, what we receive, and failure modes. Test that the shape matches and failures are handled.

Four types produce no dedicated tests: Terms (definitions), Decisions (rationale), Events (tested via flows), Features (rollups).

When implementing a feature, collect its invariants, rules, flows, and contracts. These are your test cases.

### Reviewing code against the spec

When reviewing code (yours or others'), check both directions — code against spec and spec against code:

1. **Spec → Code**: For each relevant flow, invariant, and rule in the spec, verify the implementation matches. Are flow steps implemented in the right order? Are invariants actually enforced (not just documented in comments)? Are rule parameters configurable as specified?
2. **Code → Spec**: Look for behaviors in the code that aren't captured in any primitive. Undocumented validation logic, implicit business rules, error handling that constitutes a flow — these are spec gaps. Propose new primitives for them.
3. **Invariant coverage**: Every invariant should have tests for both the holds path and the violation path. If an invariant exists in the spec but has no corresponding test, flag it.
4. **Dead spec**: If a primitive describes behavior that no longer exists in code, it should be deprecated. Stale primitives are worse than missing ones — they actively mislead.
5. **Cross-context hygiene**: Check for direct `depends-on` edges crossing context boundaries. These should typically be decomposed into event-driven integration or contract boundaries.

### CLI Reference

The `lore` CLI manages the spec. All write commands automatically rebuild `.spec/INDEX.md`. All `<ref>` arguments accept both `prefix:slug` and `context.prefix:slug` forms.

**Reading:**

`lore show <ref>` — display a primitive's frontmatter and body

`lore show <ref> --related` — display the primitive plus its connected subgraph (outbound and inbound)

`lore list` — list all primitives

`lore list --type <type>` — filter by type (accepts full name or prefix, e.g. `feature` or `feat`)

`lore list --context <name>` — filter by bounded context

`lore check <ref>` — walk the dependency graph from any primitive, report dead refs and deprecated refs

**Writing:**

`lore add <type> <slug> -n "Name" -b body.md` — create a new primitive (`-b` for body file, or `-b "inline body"`)

`lore add <type> <slug> -n "Name" -c <context> -b body.md` — create a primitive in a specific bounded context

`lore link <source> <edge> <target>` — add a typed edge between two primitives (enforces edge constraints)

`lore unlink <source> <edge> <target>` — remove a typed edge

`lore deprecate <ref>` — mark a primitive as deprecated

`lore rename <ref> <new-slug>` — rename a primitive's slug, rewrite all inbound references

`lore rm <ref>` — delete a primitive (blocked if inbound references exist; use `--force` to override)

`lore reindex` — rebuild INDEX.md from disk (use after manual file edits)

**Scaffolding:**

`lore init [--dir <path>]` — create `.spec/` in the target directory

### Query patterns

Three common ways to use the CLI:

**Direct lookup** — "What is LTV?" → `lore show term:ltv`

**Impact analysis** — "What breaks if I change LTV?" → `lore show term:ltv --related`

**Completeness check** — "Do I have everything for Loan Origination?" → `lore check feat:loan-origination`

---

## Index

`.spec/INDEX.md` is an auto-maintained flat list of all primitives and their links. Rebuilt automatically by the lore CLI on every write command.

---

## Principles

1. **Spec before code — no exceptions.** Every change to behavior must start with updating or creating the relevant spec primitives. Propose the changes, get explicit user confirmation, write the primitives, THEN implement. This is the golden rule. Skipping it means the spec drifts, effort gets wasted on things the user may disagree with, and incorrect changes may slip past unnoticed.
2. **Minimal but complete.** Don't define what you don't need yet.
3. **The spec grows through use.** Let implementation pressure reveal what's needed.
4. **Invariants over comments.** The spec is the source of truth, not code comments.
5. **One qualified id, one file, one meaning.** No ambiguity. IDs are unique per (type, context), qualified with a prefix and optional context namespace.
6. **The graph is the value.** Links enable impact analysis and completeness checking.
7. **Exists means active.** No status lifecycle. `deprecated: true` is the only flag.
