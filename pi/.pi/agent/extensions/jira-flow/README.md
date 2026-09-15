# jira-flow

Extension do pi que automatiza o refinamento de issues do Jira, escolhendo um fluxo conforme o tipo da issue:

```
/refinar-issue <KEY> [--force] [--repo <path>]
/refinar-issue --setup
```

O **harness** (esta extension) faz o I/O; a **LLM** conduz análise, investigação e quebra quando o fluxo permitir.

## O que o fluxo faz

1. Lê as credenciais do Jira (`~/.pi/agent/secrets.json`, com fallback em env vars).
2. Busca a issue no Jira via REST (Cloud = API v3/ADF, DC = API v2/texto) e busca filhos somente quando o tipo é Epic.
3. Filtra o payload: ADF/texto → markdown, descartando ids internos, `self` URLs, avatares, changelog, watchers, contadores e campos vazios.
4. Cria a pasta de trabalho e grava `jira-source.md` (auditoria + fonte do refinamento).
5. **Fase 0** — resolve `produto` + `repos` + `overview`/frescura no mapa local + índice `mcpb`. Fallback: catálogo de produtos (HTTP) → `--repo` → `cwd` → pergunta.
6. Classifica a issue em Epic, Story, Manutenção, Apoio ao cliente, Documentação ou genérico.
7. Mostra um resumo (issue, fluxo, produto, repos) e pede confirmação.
8. Dispara o turno do LLM com o conteúdo filtrado + contexto do produto + instruções específicas do fluxo.
9. O LLM conduz as fases 1–4 usando as tools:
   - `ask_user` — perguntas estruturadas (opções + recomendação + "digitar outra");
   - `submit_analysis` — revisão/aprovação do modelo da issue (**gate**);
   - `consult_specialist` — catálogo HTTP de produtos ou, no fallback, `mcpb ask` (respostas com citações);
   - `search_opensearch` — busca somente leitura de logs nos fluxos de Manutenção/Apoio;
   - `change_issue_to_maintenance` — alteração confirmada de tipo, somente no Apoio ao cliente;
   - `emit_epic_artifacts` — entrega final (só após a análise aprovada).
10. O harness grava `epic.md`, `index.md` e `tasks/*.md`.

## Fluxos por tipo

- **Epic:** decompõe escopo em histórias/tarefas e usa os filhos existentes como contexto.
- **Story:** refina a história e gera apenas o trabalho técnico diretamente necessário.
- **Manutenção:** investiga causa, evidências, impacto e correção; entrega **uma correção** (ou uma investigação, se a causa não estiver comprovada) + um `Associado [CLIENTE]` por relato afetado. Pode usar `search_opensearch` quando configurado.
- **Apoio ao cliente:** diagnostica, testa e explica o ocorrido sem implementar código. Pode usar `search_opensearch` e, com confirmação explícita, `change_issue_to_maintenance`.
- **Documentação:** por enquanto segue o fluxo genérico; o fluxo dedicado ficará para uma evolução posterior.

### OpenSearch opcional

A credencial nunca é enviada à LLM. O harness usa somente leitura e limita cada consulta a 50 resultados. Configure quando a URL e a API key estiverem disponíveis:

```json
{
  "opensearch": {
    "url": "https://opensearch.exemplo",
    "apiKey": "...",
    "index": "logs-*"
  }
}
```

Também aceita `OPENSEARCH_URL`, `OPENSEARCH_API_KEY` e `OPENSEARCH_INDEX`. Sem configuração, o fluxo de Manutenção/Apoio continua e registra a limitação.

Fora do TUI (`pi -p`, `--mode json/rpc`), `ask_user`/`submit_analysis` avisam que não há interface e a LLM degrada para perguntas/revisão em texto.

## Artefatos gerados

```
<epicsDir>/<KEY>/
├── jira-source.md      # fonte filtrada (imutável; só o harness escreve)
├── epic.md             # análise refinada da issue
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
  "projects": { "PROJ": "produto" },
  "components": { "PontoWeb": "pontoweb", "Férias": "vacations" },
  "labels": { "vacations": "vacations" }
}
```

Precedência do matching: primeiro `component` com match exato
(case/acento-insensível) → `projects[PROJ]` → primeiro `label` → sem produto.
O componente vence o projeto: um épico do projeto X pode tratar de outro
produto (ex.: componente PontoWeb num épico de Férias).

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

### Fallback por variáveis de ambiente

Se um campo não estiver no arquivo, ele é lido do ambiente: `JIRA_URL`, `JIRA_API_TOKEN` (PAT no DC), `JIRA_PERSONAL_TOKEN` (alias), `JIRA_EMAIL`, `JIRA_USERNAME`, `JIRA_DEPLOYMENT`, `JIRA_ACCEPTANCE_FIELD`, `EPICS_DIR`, `PRODUCTS_URL`, `PRODUCTS_TOKEN`, `OPENSEARCH_URL`, `OPENSEARCH_API_KEY`, `OPENSEARCH_INDEX`. O arquivo tem precedência campo a campo.

> O pi **não** carrega `.env` sozinho — as variáveis precisam estar no ambiente do processo.

## Onde ajustar sem mexer no TypeScript

| Arquivo | Para quê |
|---|---|
| `templates/epic.md` | Formato final do `epic.md` (placeholders `{{...}}`) |
| `templates/index.md` | Formato final do `index.md` |
| `templates/task.md` | Formato final de cada arquivo de tarefa |
| `instructions/epic-refinement.md` | Protocolo/fases/regras que a LLM recebe |
| `instructions/tools.md` | Contratos das tools e quando usar cada uma |
| `instructions/quebra-padroes.md` | 9 padrões de quebra + regras da casa (corrigir antes/validar depois, escopo fechado, categorias do time) |
| `filter.ts` → `filterIssue()` | Único ponto de troca do filtro do Jira |
| `products.ts` → `ProductsClient` | Cliente do catálogo de produtos |
| `mcpb.ts` → `findMcpbBin`/`McpbClient` | Resolução do `bin/mcpb` e contrato do CLI JSON |
| `products-map.json` | Mapa project/component/label → produto |

Templates e instruções são lidos **a cada execução**: editar o `.md` já vale no próximo `/refinar-issue`.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `index.ts` | Command, pull do Jira, Fase 0 e montagem da mensagem |
| `tools.ts` | Tools do refinamento, busca no OpenSearch e alteração confirmada para Manutenção |
| `products.ts` | Cliente HTTP do catálogo de produtos (produto/repos/especialistas) |
| `mcpb.ts` | Ponte com o CLI JSON do `mcpb` (mapa, context, ask) |
| `products-map.json` | Mapa project/component/label → produto do índice local |
| `state.ts` | Estado em memória do refinamento (gate, contexto, cliente) |
| `jira.ts` | Cliente REST do Jira (Cloud/DC), incluindo alteração confirmada de tipo |
| `filter.ts` | Filtro do payload do Jira |
| `issue-type.ts` | Classificação do tipo Jira em fluxo |
| `opensearch.ts` | Cliente somente leitura para busca opcional de logs |
| `secrets.ts` | Leitura/gravação de `secrets.json` + env |
| `artifacts.ts` | Materialização dos templates em arquivos |

## Fora de escopo (por enquanto)

- Construção do servidor/agentes do catálogo de produtos — o jira-flow só consome o contrato acima.
- Push de volta ao Jira (criar issues a partir dos arquivos). O frontmatter de cada task já reserva `jira_key: ""` para quando isso existir.
