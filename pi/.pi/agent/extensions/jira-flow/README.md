# jira-flow

Extension do pi que automatiza o refinamento de issues do Jira, escolhendo um fluxo conforme o tipo da issue:

```
/refinar-issue <KEY> [--force] [--repo <path>] [--product <nome>]
/refinar-issue --setup
```

O **harness** (esta extension) faz o I/O; a **LLM** conduz análise, investigação e quebra quando o fluxo permitir.

## O que o fluxo faz

1. Lê as credenciais do Jira (`~/.pi/agent/secrets.json`, com fallback em env vars).
2. Busca a issue no Jira via REST (Cloud = API v3/ADF, DC = API v2/texto) e busca filhos somente quando o tipo é Epic.
3. Filtra o payload: ADF/texto → markdown, descartando ids internos, `self` URLs, avatares, changelog, watchers, contadores e campos vazios.
4. Cria a pasta de trabalho e grava `jira-source.md` (auditoria + fonte do refinamento).
5. **Fase 0** — resolve `produto` + `repos` + `overview`/frescura. Precedência: `--product` (explícito) → mapa local (`component` → `ignore` → `projects[PROJ]` → `label`) + índice `mcpb` (ou o registro local `products.json` quando o produto ainda não está indexado) → catálogo HTTP → `--repo` → `cwd` (**confirmado no TUI**) → pergunta.
6. Classifica a issue em Epic, Story, Manutenção, Apoio ao cliente, Documentação ou genérico.
7. Mostra um resumo (issue, fluxo, produto, repos) e pede confirmação.
8. Dispara o turno do LLM com o conteúdo filtrado + contexto do produto + instruções específicas do fluxo.
9. O LLM conduz as fases 1–4 usando as tools:
   - `ask_user` — perguntas estruturadas (opções + recomendação + "digitar outra");
   - `submit_analysis` — registra o modelo de entendimento da issue no histórico (sem gate; a validação humana é na quebra);
   - `consult_specialist` — catálogo HTTP de produtos ou, no fallback, `mcpb ask` (respostas com citações);
   - `search_opensearch` — busca somente leitura de logs nos fluxos de Manutenção/Apoio;
   - `change_issue_to_maintenance` — alteração confirmada de tipo, somente no Apoio ao cliente;
   - `emit_epic_artifacts` — entrega do **Epic** (`stories`) e dos **fluxos planos** (`tasks`);
   - `emit_story_artifacts` — entrega da **Story** (`story` + `tasks` implementáveis), só após a análise aprovada.
10. O harness grava os artefatos conforme a forma do fluxo (ver abaixo).

## Fluxos por tipo

| Fluxo | Quebra | Tool de entrega |
|---|---|---|
| **Epic** | histórias verticais (`stories`) | `emit_epic_artifacts` |
| **Story** | tarefas implementáveis por agentes (`tasks`) | `emit_story_artifacts` |
| **Manutenção / Apoio / Documentação / genérico** | tarefas (formato plano atual) | `emit_epic_artifacts` |

- **Epic:** decompõe o escopo em **histórias** — fatias verticais negociáveis, com `valorObservavel` e critérios Dado/Quando/Então. O Epic **não** emite tarefas; cada história é refinada depois com `/refinar-issue <STORY-KEY>`.
- **Story:** refina a história e gera as tarefas implementáveis. A quebra parte da **fatia mínima completa** (default: 1 tarefa) e cada tarefa carrega `valorObservavel`, critérios verificáveis, `repo`, `filesLikelyTouched`, `validation` (pw2/unit-tests/manual) e `test` (contrato de teste — `tdd` com comandos RED/GREEN, `verify-only` ou `none` com justificativa). O gate anti-conflito rejeita tarefas da mesma onda com arquivos em comum, e a emissão é recusada quando falta `test.strategy`, `repo` ou `filesLikelyTouched`.
- **Manutenção:** investiga causa, evidências, impacto e correção; entrega **uma correção** (ou uma investigação, se a causa não estiver comprovada) + um `Associado [CLIENTE]` por relato afetado. Pode usar `search_opensearch`.
- **Apoio ao cliente:** diagnostica, testa e explica o ocorrido sem implementar código. Pode usar `search_opensearch` e, com confirmação explícita, `change_issue_to_maintenance`.
- **Documentação:** por enquanto segue o fluxo genérico; o fluxo dedicado ficará para uma evolução posterior.

> Os fluxos de **Manutenção** e **Apoio** ainda usam o formato plano. A evolução planejada dá a eles um fluxo de **diagnóstico** próprio (confirmar o bug, causa raiz e como corrigir; no Apoio, apenas explicar e encaminhar sem corrigir).

### Execução das tarefas da story

Depois de refinar uma Story, a execução das tarefas em paralelo é do `epic-runner` + `/implement-story`:

```
/implement-story <STORY-KEY> [--wave N]
```

O `epic-runner` lê a próxima onda pronta, cria uma `git worktree` por tarefa, e o `/implement-story` despacha um `worker` por tarefa via `subagent` (até 8 por chamada, 4 em paralelo). Cada tarefa é validada conforme o `validation` declarado e a evidência fica em `evidence/TASK-NN-<slug>.md`. As branches não são mergeadas automaticamente.

### OpenSearch opcional

A credencial nunca é enviada à LLM. O harness usa somente leitura, limita cada consulta a 50 resultados e monta o filtro/ordenação com o `timeField` configurado (padrão `@timestamp`). Aceita API key **ou** usuário/senha:

```json
{
  "opensearch": {
    "url": "https://opensearch.exemplo",
    "username": "usuario",
    "password": "...",
    "index": "logs-*",
    "timeField": "time_iso8601"
  }
}
```

Também aceita `API key` (`apiKey`) e as envs `OPENSEARCH_URL`, `OPENSEARCH_API_KEY`, `OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD`, `OPENSEARCH_INDEX`, `OPENSEARCH_TIME_FIELD`. Sem configuração, o fluxo de Manutenção/Apoio continua e registra a limitação.

Fora do TUI (`pi -p`, `--mode json/rpc`), `ask_user` avisa que não há interface e a LLM degrada para perguntas em texto. `submit_analysis` não depende de interface: só registra o entendimento.

### Validação local do PW2

`validation-defaults.json` (na extension; sobrescrevível por `JIRA_FLOW_VALIDATION_DEFAULTS`) define a convenção dos testes locais. O harness injeta a convenção na mensagem do refinamento e preenche `validation.company`/`validation.register` das tarefas quando a LLM deixar vazio:

```json
{ "pw2Local": { "environment": "local", "company": "a408453", "register": "236" } }
```

## Artefatos gerados

**Epic** (`refinementShape = stories`):

```
<epicsDir>/<EPIC-KEY>/
├── jira-source.md          # fonte filtrada (imutável; só o harness escreve)
├── epic.md                 # análise refinada do epic
├── index.md                # painel: tabela de histórias, ondas, ponteiro para o refinamento de cada uma
└── stories/
    └── STORY-01-<slug>.md  # história vertical (valor observável + critérios)
```

**Story** (`refinementShape = tasks`), em `<epicsDir>/<STORY-KEY>/`:

```
<epicsDir>/<STORY-KEY>/
├── jira-source.md          # inclui `parent_key` do epic pai
├── story.md                # história refinada (contexto do epic pai + análise)
├── index.md                # tabela de tarefas com Validação/Status/Evidência
├── tasks/
│   └── TASK-01-<slug>.md   # repo, branch, filesLikelyTouched, validação, contrato de teste
└── evidence/
    └── TASK-01-<slug>.md   # evidência da validação (gerada pelo epic-runner)
```

**Fluxos planos** (Manutenção/Apoio/Documentação/genérico): `jira-source.md`, `epic.md`, `index.md` e `tasks/TASK-NN-<slug>.md`.

`<epicsDir>` é `epicsDir` (secrets) / `EPICS_DIR` (env) quando configurado e acessível; senão **`~/epics`** — centralizado, independente do repo onde o pi roda.

Refazer o refinamento de uma issue já refinada exige `--force`, que **remove os artefatos conhecidos** (`epic.md`, `story.md`, `index.md`, `tasks/`, `stories/`, `evidence/`) antes de regravar. Sem isso, uma tarefa do formato anterior continuaria sendo lida pelo `epic-runner` ao lado das novas.

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
  "epicsDir": "/home/voce/epics",
  "opensearch": {
    "url": "https://opensearch.exemplo",
    "apiKey": "...",
    "index": "logs-*"
  }
}
```

Jira Cloud usa `"deployment": "cloud"`, `"email"` e `"apiToken"` no lugar de `personalToken`. O `deployment` é inferido pela URL (`*.atlassian.net` → cloud) quando omitido.

### Índice local (mcpb) — fonte primária da Fase 0

O `mcpb` expõe um CLI JSON (`bin/mcpb`) com o índice local de produtos. O
jira-flow resolve o produto pelo `products-map.json` e consulta o índice para
obter produto, repositórios (com paths locais), overview curado e frescura.

`products-map.json` (no diretório da extension; sobrescrevível por
`JIRA_FLOW_PRODUCTS_MAP`):

```json
{
  "projects": {},
  "components": {
    "PontoWeb": "pontoweb",
    "Meu Ponto Eletrônico": "pontoweb",
    "Mapa de Frequência": "livemaps",
    "Cerca virtual": "mapa_frequencia",
    "Férias": "vacations",
    "PW-Espelho de Ponto": "espelho",
    "Rostering - Folgas": "folgas",
    "Gestão de Escalas": "rostering",
    "Controle de Acesso": "acessoweb",
    "Controle de Acesso Virtual": "smartgate",
    "TimeSheet": "timesheet"
  },
  "ignore": ["OKR", "PLR", "IA", "Score de Risco", "…"],
  "labels": { "cerca_virtual": "mapa_frequencia", "vacations": "vacations" }
}
```

Precedência do matching: `component` com match exato (case/acento-insensível) →
componente em `ignore` (**não é produto**, e não cai no default do projeto) →
`projects[PROJ]` → `label` → sem produto.

`projects` está **vazio de propósito**: a key do projeto (ex.: `DRHJNES`) é só a
nomenclatura do time, não identifica produto. O produto vem do **componente**
do Jira (ou de `--product`/label). Sem componente, a issue fica **não
resolvida** e o harness pede confirmação em vez de chutar.

A lista `ignore` é para componentes de **processo/gestão** (OKR, PLR, IA, Score
de Risco, `para_refinar`, `Demanda de cliente`, `JORNARQ-*`…): eles existem no
Jira mas não identificam produto — sem isso, um issue marcado só com `OKR` cairia
no default do projeto.

O harness registra **a origem da resolução** (`componente`, `projeto`, `label`,
`--product` ou `catálogo`) no resumo e no prompt. Quando vem de `projeto` ou
`label` — match mais fraco — ele marca para confirmar com o usuário antes de
investir.

Se o produto não resolver, `consult_specialist` **não** falha em silêncio:
devolve a lista de produtos do índice local para a LLM escolher e passar em
`produto`. Para forçar a resolução, use `--product <nome>` (ex.:
`/refinar-issue DRHJNES-975 --product vacations`).

Resolução do `bin/mcpb`, na ordem: `MCPB_BIN` → `MCPB_PATH/bin/mcpb` → launcher
`~/.local/bin/mcpb-mcp` (realpath → checkout) → `~/ahg/mcpb/bin/mcpb` →
`<cwd>/bin/mcpb` (só com `<cwd>/catalog.yaml`).

CLI (stdout = 1 documento JSON; logs em stderr; erro = `{"error":{...}}` com
exit ≠ 0):

```
mcpb products
mcpb context --product <nome>
mcpb search-code --product <nome> --query <busca> [--language <l>] [--kind <k>] [--limit 1..30]
mcpb ask --product <nome> --question <pergunta>
```

Envs: `MCPB_BIN` (caminho do CLI), `MCPB_PATH` (checkout), `JIRA_FLOW_PRODUCTS_MAP`
(mapa alternativo).

### Catálogo de produtos (opcional, fallback da Fase 0)

Contrato esperado:

```
GET  {url}/resolve?jiraKey=PROJ-123
     -> { "product": "...", "repos": [{ "name", "path?|url?" }], "specialists": [{ "id", "name?" }] }
POST {url}/ask   { "product", "question", "specialist?" }
     -> { "answer": "..." }
```

Auth `Authorization: Bearer {token}`. É o fallback da Fase 0 (quando o mcpb não resolve o produto) e a fonte do `consult_specialist`; se ausente/fora do ar, o `consult_specialist` cai para o `mcpb ask`. Config também pela env: `PRODUCTS_URL`, `PRODUCTS_TOKEN`.

### Produtos ainda não indexados (`products.json`)

A indexação do mcpb é **gradual** (um produto por vez). Enquanto um produto não
está no `catalog.yaml`, `mcpb context` não devolve nada — e sem repos o
refinamento volta a adivinhar. O `products.json` cobre essa lacuna com
produto → repos, resolvendo o checkout local (`$AHG_DIR`, `~/ahg/<repo>`,
`/ahg/<repo>`):

```json
{
  "pontoweb":       { "repos": ["pw2"] },
  "vacations":      { "repos": ["pw2", "vacations-client"] },
  "folgas":         { "repos": ["folgas-api", "folgas-ui"] },
  "rostering":      { "repos": ["rostering-api", "rostering-ui"] },
  "acessoweb":      { "repos": ["aw-client", "acessoweb"] },
  "smartgate":      { "repos": ["smartgate-client", "pw2"] },
  "livemaps":       { "repos": ["livemaps", "livemaps-client", "livemaps_consumer", "pw2"] },
  "mapa_frequencia":{ "repos": ["pw2"] },
  "espelho":        { "repos": ["mirror-client", "pw2"] },
  "timesheet":      { "repos": ["ts", "ts-client"] }
}
```

Quando o produto entrar no `catalog.yaml` e for indexado, o `mcpb context` passa
a vencer (traz overview curado + frescura). Sem índice, o prompt avisa que o
`consult_specialist` não responde para aquele produto — a investigação é por
`grep`/`read` nos repos.

Arquivo sobrescrevível por `JIRA_FLOW_PRODUCTS`; diretório base dos checkouts
por `AHG_DIR`.

### Fallback por variáveis de ambiente

Se um campo não estiver no arquivo, ele é lido do ambiente: `JIRA_URL`, `JIRA_API_TOKEN` (PAT no DC), `JIRA_PERSONAL_TOKEN` (alias), `JIRA_EMAIL`, `JIRA_USERNAME`, `JIRA_DEPLOYMENT`, `JIRA_ACCEPTANCE_FIELD`, `EPICS_DIR`, `PRODUCTS_URL`, `PRODUCTS_TOKEN`, `OPENSEARCH_URL`, `OPENSEARCH_API_KEY`, `OPENSEARCH_INDEX`. O arquivo tem precedência campo a campo.

> O pi **não** carrega `.env` sozinho — as variáveis precisam estar no ambiente do processo.

## Onde ajustar sem mexer no TypeScript

| Arquivo | Para quê |
|---|---|
| `templates/epic.md` | Formato final do `epic.md` (placeholders `{{...}}`) |
| `templates/epic-index.md` | Índice do Epic (tabela de histórias + ondas) |
| `templates/story.md` | Formato do `story.md` / `stories/STORY-NN-*.md` |
| `templates/story-index.md` | Índice da Story (tabela de tarefas com Validação/Evidência) |
| `templates/index.md` | Índice dos fluxos planos |
| `templates/task.md` | Formato final de cada arquivo de tarefa |
| `instructions/epic-refinement.md` | Protocolo/fases/regras que a LLM recebe |
| `instructions/tools.md` | Contratos das tools e quando usar cada uma |
| `instructions/quebra-padroes.md` | 9 padrões de quebra + regras da casa (corrigir antes/validar depois, escopo fechado, descrição é pista, fatia mínima, categorias do time) |
| `instructions/exemplos-quebra.md` | Casos de calibração da quebra (ruim → bom) |
| `filter.ts` → `filterIssue()` | Único ponto de troca do filtro do Jira |
| `products.ts` → `ProductsClient` | Cliente do catálogo de produtos |
| `mcpb.ts` → `findMcpbBin`/`McpbClient` | Resolução do `bin/mcpb` e contrato do CLI JSON |
| `products-map.json` | Mapa project/component/label → produto (com `ignore` para componentes de processo) |
| `products.json` | Registro local produto → repos, para produtos ainda não indexados no mcpb |
| `validation-defaults.json` | Convenção de validação (hoje: PW2 local na empresa `a408453`, matrícula padrão `236`) |

Templates e instruções são lidos **a cada execução**: editar o `.md` já vale no próximo `/refinar-issue`.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `index.ts` | Command, pull do Jira, Fase 0 e montagem da mensagem |
| `tools.ts` | Tools do refinamento (`emit_epic_artifacts`/`emit_story_artifacts`), busca no OpenSearch e alteração confirmada para Manutenção |
| `products.ts` | Cliente HTTP do catálogo de produtos (produto/repos/especialistas) |
| `mcpb.ts` | Ponte com o CLI JSON do `mcpb` (mapa, context, products, ask) |
| `local-products.ts` | Registro local produto → repos e resolução do checkout |
| `products-map.json` | Mapa project/component/label → produto do índice local |
| `state.ts` | Estado em memória do refinamento (gate, contexto, cliente) |
| `jira.ts` | Cliente REST do Jira (Cloud/DC), incluindo alteração confirmada de tipo |
| `filter.ts` | Filtro do payload do Jira |
| `issue-type.ts` | Classificação do tipo Jira em fluxo + forma da quebra (`refinementShape`) |
| `opensearch.ts` | Cliente somente leitura para busca opcional de logs (API key ou usuário/senha) |
| `secrets.ts` | Leitura/gravação de `secrets.json` + env (inclui `autoRunCompanies` do pw2) |
| `validation-defaults.ts` | Convenção de validação do time e preenchimento de `company`/`register` |
| `artifacts.ts` | Validação e materialização dos templates em arquivos |

### Extensions relacionadas

| Extension | Papel |
|---|---|
| `jira-flow` | Refinamento: pull do Jira → análise → artefatos (`refinar-issue`) |
| `epic-runner` | Execução das tarefas da story: ondas, worktrees, status e evidência (`implement-story`) |
| `subagent` | Despacho paralelo dos workers |
| `pw2`/`opensearch` | Tools de validação por HTTP (`pw2_request`, `opensearch_request`) |

## Evolução planejada (ainda não implementada)

O fluxo Epic → Story → tarefas está fechado. Estas evoluções ficaram para depois e já têm os ganchos no código:

1. **Fluxo próprio de Manutenção (`shape = diagnosis`)** — a issue passa a virar uma `story` de investigação + tasks de diagnóstico (confirmar se é bug, o que houve, a causa raiz e como corrigir) e, por fim, a correção. `refinementShape` já devolve `diagnosis` para `maintenance`; falta reescrever `instructions/flows/maintenance.md` e materializar o `story.md` de diagnóstico.
2. **Fluxo próprio de Apoio ao cliente (`shape = diagnosis`, sem escrita)** — mesmo pipeline, sem tasks de correção: explica o comportamento e, se for bug, registra o encaminhamento para o time transformar em Bug. `emit_story_artifacts` já aceita o fluxo; `prepare_task_worktrees` já aceita `allowWrite=false`. Falta reescrever `instructions/flows/customer-support.md` e a saída de veredito/encaminhamento.
3. **Modelo por fase (economia de tokens)** — escolher o modelo conforme a fase (fetch/scout/planner/worker/validator) em vez de usar o modelo da sessão em tudo. Gancho pronto: o agente do `subagent` já aceita `model:` no frontmatter. Falta um config (`models` por fase) e propagar a escolha no despacho.

## Fora de escopo (por enquanto)

- Construção do servidor/agentes do catálogo de produtos — o jira-flow só consome o contrato acima.
- Push de volta ao Jira (criar issues a partir dos arquivos). O frontmatter de cada task já reserva `jira_key: ""` para quando isso existir.
