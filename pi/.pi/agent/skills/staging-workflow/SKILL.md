---
name: staging-workflow
description: Workflow for planning and implementing new features using a staging folder that bridges code changes with documentation updates. Use when the user wants to implement a new feature, make code changes that affect knowledge base docs, or mentions "staging", "feature", "implementar", "nova feature", "melhoria", or "fluxo de desenvolvimento". Also use when the user asks about keeping docs in sync with code changes.
---

# Staging Workflow

This skill guides feature implementation through a structured staging process that keeps knowledge base documentation in sync with code changes.

## When to use staging

- New feature that changes code AND documentation
- Feature affecting multiple systems or files
- User says "implementar", "nova feature", "melhoria", "alteração no código"

Do NOT use staging for:
- Single-line fixes
- Documentation-only corrections (edit vault directly)
- Exploratory analysis without planned implementation

## The staging folder

All feature work lives under `~/prdbook/staging/`:

```
staging/{product}-{feature-slug}/
├── 01-analysis.md       # Gap between current code and desired behavior
├── 02-impact.md         # Systems and docs affected
├── 03-code-changes.md   # Exact code changes (before/after per file)
└── 04-merge-plan.md     # How to merge docs into vault after implementation
```

## Issue capture (before staging)

**ALWAYS capture the issue from the best source available before starting staging.**

### Priority order

1. **Jira** — if the user mentions a Jira key (e.g., "WVC-1234") or has Jira configured, call `jira_fetch_issue("KEY-1234")` to get the full issue
2. **Manual template** — if no Jira, ask the user to fill `staging/.template/00-issue.md`
3. **User prompt** — fallback: use the user's description directly

### Refinement step (with prdbook consultation)

After capturing the issue, **ALWAYS consult the knowledge base BEFORE asking the user questions**:

1. **Consult prdbook**: Call `get_product_knowledge` for the product(s) mentioned in the issue. Also read related vault files directly if needed (e.g., integrations, data-models, services).
2. **Answer what you can**: Cross-reference the issue description with prdbook docs. Many questions (scope, dependencies, data models, architecture) are already documented.
3. **Show a summary** with:
   - Issue understanding (title, context)
   - What prdbook already answers (with file references)
   - What remains unknown (the actual questions)
4. **Ask only the remaining questions** — never ask something already documented in prdbook.
5. Only after user confirms, proceed to `feature_init`.

## Tools available

Use these tools to automate the workflow:

### Staging tools

| Tool | Purpose | Requires confirmation? |
|---|---|---|
| `jira_fetch_issue(key)` | Fetch Jira issue as seed for staging | No |
| `jira_search(jql)` | Search Jira issues by JQL | No |
| `feature_init(product, slug)` | Create a new staging feature from template | No |
| `feature_list()` | List active and archived features | No |
| `feature_preview(slug)` | Preview what `feature_merge` will do to docs | No (read-only) |
| `feature_merge(slug, confirm)` | Apply 04-merge-plan.md to vault documents | ⚠️ YES — requires `confirm: true` |
| `feature_archive(slug, reference?)` | Archive completed feature to .archive/ | No |

## ⚠️ CRITICAL: Confirmation gates

**NEVER skip confirmation.** Every destructive action must be approved by the user.

### Gate 1: Before applying code changes (03-code-changes.md)

When 03-code-changes.md is filled and ready to implement:

1. **Show a summary** of all files that will be changed and what will change
2. **Ask the user explicitly**: "Posso aplicar as mudanças do 03-code-changes.md? (arquivos: X, Y, Z)"
3. **Wait for approval** before calling `edit` or `write` tools
4. If the user asks for adjustments, edit 03-code-changes.md and show the summary again

### Gate 2: Before merging docs (04-merge-plan.md)

When ready to update vault documents:

1. **Call `feature_preview` first** — this shows exactly what will be created/updated/removed without applying changes
2. **Show the preview to the user** with a clear summary
3. **Ask the user explicitly**: "Posso aplicar o merge nos docs do vault? (X criações, Y atualizações)"
4. **Wait for approval** before calling `feature_merge` with `confirm: true`
5. If the user asks for adjustments, edit 04-merge-plan.md and call `feature_preview` again

### How to handle adjustments

When the user says something like:
- "Na verdade, não precisa criar o arquivo X"
- "Altera também a seção Y do documento Z"
- "Muda a descrição no 03-code-changes.md"

Do this:
1. Read the relevant staging doc (01, 02, 03, or 04)
2. Edit it with the adjustment
3. Re-run the preview/summary
4. Ask for confirmation again

## Workflow steps with confirmation

### Step 0: Capture the issue

When the user mentions implementing something:

1. **If a Jira key is mentioned** (e.g., "implementa WVC-1234"):
   - Call `jira_fetch_issue("WVC-1234")`
   - Show the structured issue (summary, type, status, description, acceptance criteria, components)
2. **If no Jira key**:
   - Ask: "Tem issue no Jira? Se sim, qual a key?"
   - If not, offer the template: "Quer preencher o template de issue primeiro? (staging/.template/00-issue.md)"
3. **Consult prdbook**: Call `get_product_knowledge` for the affected product(s). Read key files (architecture, integrations, services, data-models) to gather context about the systems involved.
4. **Show refinement summary** — "Entendi que a issue é sobre X. O prdbook já responde Y e Z."
5. **Ask only remaining questions** — never ask about scope, dependencies, or data models that are already documented in prdbook.
6. **Wait for confirmation** before proceeding to Step 1

### Step 1: Init

After issue is refined and confirmed:

1. Call `feature_init` with the product name (escalas, folgas, pontoweb, shared) and a kebab-case slug
2. Tell the user the feature folder was created
3. Proceed to fill documents with the refined issue data

### Step 2: Analyze (fill 01-analysis.md)

Read the relevant source code. Fill 01-analysis.md with:
- Current behavior (what the code does today)
- The gap (what's missing or wrong)
- Code flow tracing the data from source to destination
- Relevant vault documents for context

### Step 3: Impact (fill 02-impact.md)

Based on 01-analysis.md, fill 02-impact.md.

### Step 4: Code changes (fill 03-code-changes.md)

Write exact before/after code blocks. ⚠️ Show summary to user before applying.

### Step 5: Merge plan (fill 04-merge-plan.md)

Specify which vault documents will be created/updated/removed.

### Step 6: ⚠️ GATE 1 — Confirm code changes

```
📋 Mudanças planejadas:
  - ~/ahg/folgas-api/src/.../PontowebService.js: refatorar getSchedulesFromPw()
  - ~/ahg/folgas-api/src/.../PontowebService.js: refatorar _parseToEvent()

Posso aplicar estas mudanças? (responda "sim" ou faça ajustes)
```

**Only proceed after user approval.**

### Step 7: Implement

Apply `03-code-changes.md` to source files using `edit` tool.

### Step 8: ⚠️ GATE 2 — Preview and confirm doc merge

1. Call `feature_preview("produto-slug")`
2. Show the output to the user
3. Ask: "Posso aplicar o merge nos docs do vault?"

**Only proceed after user approval.**

### Step 9: Merge docs

Call `feature_merge("produto-slug", confirm: true)`.

### Step 10: Archive

Call `feature_archive` with the PR/commit reference.

---

## Important rules

1. **NEVER skip confirmation gates** — this is the single most important rule
2. **Staging docs are NOT in the knowledge vault** — they're in `staging/`, not indexed by the prdbook extension
3. **Fill docs in order** — 01 → 02 → 03 → 04, each depends on the previous
4. **Before/after in 03 must match real code** — use `read` to verify exact lines before writing
5. **Merge plan must be explicit** — "update section X of file Y with content Z", not vague instructions
6. **Archive after merge** — don't leave stale staging folders
7. **Allow adjustments** — if user wants changes after seeing preview, edit the staging docs and re-preview
