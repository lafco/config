# epic-runner

Extension do pi que executa as **tarefas de uma story refinada** (`~/epics/<STORY-KEY>/`) em ondas paralelas, com worktree por tarefa e evidência de validação.

Ela **não** implementa nada por conta própria: expõe tools que o prompt `/implement-story` usa para orquestrar a tool `subagent` (um worker por tarefa).

## Tools

| Tool | Para quê |
|---|---|
| `list_story_tasks({ storyKey, wave? })` | Lê `tasks/*.md` + `index.md` e devolve a **próxima onda pronta** (dependências concluídas), com `repo`, `branch`, `filesLikelyTouched` e a validação declarada. Avisa conflitos de arquivo. |
| `prepare_task_worktrees({ storyKey, taskIds, repo?, baseBranch?, allowWrite? })` | Cria `git worktree` por tarefa (`<repo>/.worktrees/<KEY>-<TASK>`) na branch declarada, marca a tarefa como `fazendo` no arquivo e no `index.md`. Recusa a leva com arquivos em comum. `allowWrite=false` bloqueia (fluxos só de diagnóstico). |
| `update_task_status({ storyKey, taskId, status })` | Grava `backlog\|fazendo\|pronto\|bloqueado\|cancelado` no frontmatter da tarefa e na tabela do índice. |
| `write_task_evidence({ storyKey, taskId, content, status? })` | Grava `evidence/TASK-NN-<slug>.md` e linka na coluna **Evidência** do índice. |
| `write_task_review({ storyKey, taskId, verdict, category?, findings })` | Grava o veredito do revisor em `review/TASK-NN-<slug>-t<tentativa>.md`, incrementa `attempts` e preenche a coluna **Review**. A tool decide a rota pela categoria: `execucao`/`ambiente` retentam uma vez (`retry`), as demais vão para `bloqueado`. |
| `remove_task_worktrees({ storyKey, repo, tasks })` | Remove worktrees e branches (best-effort). Rode depois do merge/decisão humana. |

## Ciclo esperado

```
1. list_story_tasks        → tarefas da onda N (+ achados herdados das dependências)
2. prepare_task_worktrees  → cwd + branch por tarefa
3. subagent (parallel)     → 1 worker por tarefa, cwd = worktree
4. write_task_evidence     → evidência por tarefa
5. subagent (parallel)     → 1 revisor por tarefa (conformidade + qualidade)
6. write_task_review       → veredito + categoria; leia `route`
   ├── retry        → volta ao passo 3 levando os achados (uma vez)
   └── bloqueado/ok → update_task_status
7. (próxima onda)          → volta ao passo 1
8. remove_task_worktrees   → limpeza
```

O review **não bloqueia** a esteira: ele registra a categoria dos achados para que a falha seja atribuível — `quebra`/`analise` apontam para o refinamento, `execucao`/`ambiente` para o agente. Cada tentativa revisada vira um arquivo (`-t1`, `-t2`), então o histórico da tarefa que voltou fica no disco.

## Pré-requisitos e limites

- `git` no PATH e repositório limpo o bastante para criar worktrees.
- Adicione `.worktrees/` ao `.gitignore` do repositório alvo (as worktrees ficam em `<repo>/.worktrees/`).
- As branches **não** são mergeadas automaticamente: o merge é decisão do orquestrador/humano.
- O despacho roda em subagentes (não-TUI): `pw2_request` só executa sem humano em `local` ou, fora dele, quando a `company` está em `pw2.environments.<env>.autoRunCompanies` e a chamada é de leitura. O resto deve ser declarado `validation.kind = "manual"`.
- Limite de paralelismo da tool `subagent`: 8 tarefas por chamada e 4 em execução simultânea.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.ts` | Registro das cinco tools |
| `tasks.ts` | Parse do frontmatter/índice, `selectReadyWave`, `detectFileConflicts`, `reviewRoute`, escrita de status/evidência/review |
| `worktrees.ts` | Wrapper de `git worktree` |
