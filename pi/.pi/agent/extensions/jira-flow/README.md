# jira-flow

Extension do pi que automatiza o refinamento de um epic do Jira:

```
/refinar-issue <KEY> [--force]
/refinar-issue --setup
```

O **harness** (esta extension) faz o I/O; a **LLM** só faz análise e quebra.

## O que o fluxo faz

1. Lê as credenciais do Jira (`~/.pi/agent/secrets.json`, com fallback em env vars).
2. Busca a issue no Jira via REST (Cloud = API v3/ADF, DC = API v2/texto) e também os filhos do epic.
3. Filtra o payload: ADF/texto → markdown, descartando ids internos, `self` URLs, avatares, changelog, watchers, contadores e campos vazios.
4. Cria a pasta de trabalho e grava `jira-source.md` (auditoria + fonte do refinamento).
5. Mostra um resumo e pede confirmação.
6. Dispara o turno do LLM com o conteúdo filtrado + as instruções internas de refinamento.
7. O LLM entrega a análise e as tarefas chamando a tool `emit_epic_artifacts`; o harness grava os arquivos.

## Artefatos gerados

```
<epicsDir>/<KEY>/
├── jira-source.md      # fonte filtrada (imutável; só o harness escreve)
├── epic.md             # análise refinada do epic
├── index.md            # painel: tabela de tarefas, ondas, status
└── tasks/
    └── TASK-01-<slug>.md
```

`<epicsDir>` é `epicsDir` (secrets) / `EPICS_DIR` (env) quando configurado e acessível; senão **`~/epics`** — centralizado, independente do repo onde o pi roda.

## Credenciais

**Fonte única:** `~/.pi/agent/secrets.json` (0600, fora do git).

Configure pelo próprio pi — não é preciso escrever JSON nem ajustar permissão na mão:

```
/refinar-issue --setup
```

O setup pergunta a URL e o token, **testa de verdade** (`GET /rest/api/2/myself`) e só grava o arquivo se a autenticação funcionar.

Jira Data Center:

```json
{
  "jira": {
    "url": "https://jiraproducao.totvs.com.br",
    "deployment": "dc",
    "personalToken": "SEU_PAT"
  },
  "epicsDir": "/home/voce/epics"
}
```

Jira Cloud usa `"deployment": "cloud"`, `"email"` e `"apiToken"` no lugar de `personalToken`. O `deployment` é inferido pela URL (`*.atlassian.net` → cloud) quando omitido.

Campos opcionais: `jira.acceptanceField` (ex.: `customfield_10001`) e `epicsDir`.

### Fallback por variáveis de ambiente

Se um campo não estiver no arquivo, ele é lido do ambiente: `JIRA_URL`, `JIRA_API_TOKEN` (PAT no DC), `JIRA_PERSONAL_TOKEN` (alias), `JIRA_EMAIL`, `JIRA_USERNAME`, `JIRA_DEPLOYMENT`, `JIRA_ACCEPTANCE_FIELD`, `EPICS_DIR`. O arquivo tem precedência campo a campo.

> O pi **não** carrega `.env` sozinho — as variáveis precisam estar no ambiente do processo.

## Onde ajustar sem mexer no TypeScript

| Arquivo | Para quê |
|---|---|
| `templates/epic.md` | Formato final do `epic.md` (placeholders `{{...}}`) |
| `templates/index.md` | Formato final do `index.md` |
| `templates/task.md` | Formato final de cada arquivo de tarefa |
| `instructions/epic-refinement.md` | Instruções que a LLM recebe (fases, regras, padrões de quebra) |
| `filter.ts` → `filterIssue()` | Único ponto de troca do filtro do Jira |

Templates e instruções são lidos **a cada execução**: editar o `.md` já vale no próximo `/refinar-issue`.

## Fora de escopo (por enquanto)

- Push de volta ao Jira (criar issues a partir dos arquivos). O frontmatter de cada task já reserva `jira_key: ""` para quando isso existir.
