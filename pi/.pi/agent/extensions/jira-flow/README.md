# jira-flow

Extension do pi que automatiza o refinamento de um épico do Jira:

```
/refinar-issue <KEY> [--force] [--repo <path>]
/refinar-issue --setup
```

O **harness** (esta extension) faz o I/O; a **LLM** só faz análise e quebra.

## O que o fluxo faz

1. Lê as credenciais do Jira (`~/.pi/agent/secrets.json`, com fallback em env vars).
2. Busca a issue no Jira via REST (Cloud = API v3/ADF, DC = API v2/texto) e também os filhos do épico.
3. Filtra o payload: ADF/texto → markdown, descartando ids internos, `self` URLs, avatares, changelog, watchers, contadores e campos vazios.
4. Cria a pasta de trabalho e grava `jira-source.md` (auditoria + fonte do refinamento).
5. **Fase 0** — resolve `produto` + `repos` + `especialistas` no catálogo de produtos (HTTP). Fallback: `--repo` → `cwd` → pergunta.
6. Mostra um resumo (issue, produto, repos) e pede confirmação.
7. Dispara o turno do LLM com o conteúdo filtrado + contexto do produto + instruções internas.
8. O LLM conduz as fases 1–4 usando as tools:
   - `ask_user` — perguntas estruturadas (opções + recomendação + "digitar outra");
   - `submit_analysis` — revisão/aprovação do "modelo do épico" (**gate**);
   - `consult_specialist` — consulta aos agentes especialistas do produto;
   - `emit_epic_artifacts` — entrega final (só após a análise aprovada).
9. O harness grava `epic.md`, `index.md` e `tasks/*.md`.

Fora do TUI (`pi -p`, `--mode json/rpc`), `ask_user`/`submit_analysis` avisam que não há interface e a LLM degrada para perguntas/revisão em texto.

## Artefatos gerados

```
<epicsDir>/<KEY>/
├── jira-source.md      # fonte filtrada (imutável; só o harness escreve)
├── epic.md             # análise refinada do épico
├── index.md            # painel: tabela de tarefas, ondas, status
└── tasks/
    └── TASK-01-<slug>.md
```

`<epicsDir>` é `epicsDir` (secrets) / `EPICS_DIR` (env) quando configurado e acessível; senão **`~/epics`** — centralizado, independente do repo onde o pi roda.

## Credenciais e configuração

**Fonte única:** `~/.pi/agent/secrets.json` (0600, fora do git).

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
  "products": {
    "url": "https://catalogo.interno/api",
    "token": "TOKEN_DO_CATALOGO"
  },
  "epicsDir": "/home/voce/epics"
}
```

Jira Cloud usa `"deployment": "cloud"`, `"email"` e `"apiToken"` no lugar de `personalToken`. O `deployment` é inferido pela URL (`*.atlassian.net` → cloud) quando omitido.

### Catálogo de produtos (opcional, mas é a fonte primária)

Contrato esperado:

```
GET  {url}/resolve?jiraKey=PROJ-123
     -> { "product": "...", "repos": [{ "name", "path?|url?" }], "specialists": [{ "id", "name?" }] }
POST {url}/ask   { "product", "question", "specialist?" }
     -> { "answer": "..." }
```

Auth `Authorization: Bearer {token}`. Se ausente/fora do ar, o fluxo cai no fallback de repositório. Config também pela env: `PRODUCTS_URL`, `PRODUCTS_TOKEN`.

### Fallback por variáveis de ambiente

Se um campo não estiver no arquivo, ele é lido do ambiente: `JIRA_URL`, `JIRA_API_TOKEN` (PAT no DC), `JIRA_PERSONAL_TOKEN` (alias), `JIRA_EMAIL`, `JIRA_USERNAME`, `JIRA_DEPLOYMENT`, `JIRA_ACCEPTANCE_FIELD`, `EPICS_DIR`, `PRODUCTS_URL`, `PRODUCTS_TOKEN`. O arquivo tem precedência campo a campo.

> O pi **não** carrega `.env` sozinho — as variáveis precisam estar no ambiente do processo.

## Onde ajustar sem mexer no TypeScript

| Arquivo | Para quê |
|---|---|
| `templates/epic.md` | Formato final do `epic.md` (placeholders `{{...}}`) |
| `templates/index.md` | Formato final do `index.md` |
| `templates/task.md` | Formato final de cada arquivo de tarefa |
| `instructions/epic-refinement.md` | Protocolo/fases/regras que a LLM recebe |
| `instructions/tools.md` | Contratos das tools e quando usar cada uma |
| `instructions/quebra-padroes.md` | Anexo com os 9 padrões de quebra |
| `filter.ts` → `filterIssue()` | Único ponto de troca do filtro do Jira |
| `products.ts` → `ProductsClient` | Cliente do catálogo de produtos |

Templates e instruções são lidos **a cada execução**: editar o `.md` já vale no próximo `/refinar-issue`.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `index.ts` | Command, pull do Jira, Fase 0 e montagem da mensagem |
| `tools.ts` | Tools `emit_epic_artifacts`, `ask_user`, `submit_analysis`, `consult_specialist` |
| `products.ts` | Cliente HTTP do catálogo de produtos (produto/repos/especialistas) |
| `state.ts` | Estado em memória do refinamento (gate, contexto, cliente) |
| `jira.ts` | Cliente REST do Jira (Cloud/DC) |
| `filter.ts` | Filtro do payload do Jira |
| `secrets.ts` | Leitura/gravação de `secrets.json` + env |
| `artifacts.ts` | Materialização dos templates em arquivos |

## Fora de escopo (por enquanto)

- Construção do servidor/agentes do catálogo de produtos — o jira-flow só consome o contrato acima.
- Push de volta ao Jira (criar issues a partir dos arquivos). O frontmatter de cada task já reserva `jira_key: ""` para quando isso existir.
