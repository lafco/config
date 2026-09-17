# Ferramentas do refinamento — quando e como usar

O harness (`jira-flow`) registra as ferramentas do refinamento. O conteúdo final **só** existe via `emit_epic_artifacts` (Epic e fluxos planos) ou `emit_story_artifacts` (Story); as demais servem para conduzir a conversa, investigar evidências e validar o entendimento.

> Se a extensão `mcpb` estiver carregada, as tools `mcpb_*` (busca/leitura no índice local) também estão disponíveis — prefira-as na investigação do código.

## `ask_user` — pergunta estruturada

Use para **toda** pergunta ao usuário durante o refinamento. Uma pergunta por vez.

```jsonc
{
  "pergunta": "texto da pergunta",
  "contexto": "por que importa / o que você já sabe (opcional)",
  "opcoes": [
    { "label": "opção", "descricao": "explicação curta (opcional)", "recomendada": true }
  ],
  "permiteOutro": true // padrão; some com a opção "Digitar outra resposta" quando false
}
```

- **Sempre** marque a sua recomendação com `"recomendada": true` — acelera a resposta.
- Inclua "Outro (especificar)" só quando `permiteOutro: false`; a opção de texto livre já cobre isso.
- Ofereça 2–5 opções concretas. Evite perguntas de sim/não quando houver nuances.
- Não use `ask_user` para despejar várias perguntas: quebre em chamadas separadas.
- Em modo não interativo (`-p`, `json`, `rpc`) a tool retorna erro; nesse caso faça a pergunta em **texto** na conversa.

## `submit_analysis` — registrar o entendimento (sem gate)

Registra o modelo de entendimento da issue no histórico da conversa, para consulta. **Não bloqueia a entrega** e **não abre revisão/aprovação**: a validação humana acontece na **quebra proposta das tarefas** (Fase 2) e na confirmação antes de gravar.

```jsonc
{
  "resumo": "3–5 linhas",
  "objetivo": "...",
  "personas": ["..."],
  "restricoes": ["..."],
  "criteriosDeSucesso": ["..."],
  "areasDoCodigo": ["caminho/ou/módulo concreto"],
  "foraDeEscopo": ["..."],
  "riscos": ["..."],
  "duvidas": ["perguntas ainda em aberto"]
}
```

- Chame **uma vez**, depois de investigar o repositório e antes de decompor — deixa o entendimento explícito e legível para o usuário consultar depois.
- `areasDoCodigo` vem da investigação do repositório — use caminhos concretos, não "backend".
- Se o entendimento mudar durante a quebra, chame de novo para atualizar o registro (opcional).

## `consult_specialist` — catálogo de produtos / índice local

Consulta o produto da issue em duas fontes, nesta ordem:

1. **Catálogo HTTP** (agentes especialistas, quando configurado em `products.url`): o campo `especialista` é repassado.
2. **Índice local `mcpb ask`** (fallback quando o catálogo não está configurado ou falha): resposta com **citações** de código/docs do índice. Nesse caminho `especialista` é ignorado (o `mcpb` não tem especialistas).

```jsonc
{
  "pergunta": "dúvida técnica/produto",
  "produto": "opcional; padrão = o resolvido na Fase 0",
  "especialista": "opcional; só se aplica ao catálogo HTTP"
}
```

- Use na **Fase 1** (entendimento) e na **Fase 3** (especificação).
- Uma dúvida por chamada, formulada de forma específica.
- Quando a resposta vier do `mcpb`, confira as citações antes de usá-las; o índice pode estar velho (ver Fase 0).
- Se nenhuma fonte responder, a tool retorna erro: caia para a **investigação do repositório** e registre a lacuna em `riscos`/`duvidas`.
- Não invente a resposta do especialista: o que não veio do catálogo, do índice, da issue ou do código é incerteza.

## `search_opensearch` — evidências de logs

Disponível somente nos fluxos de Manutenção e Apoio ao cliente. Faz uma busca somente leitura usando credencial mantida no harness (API key ou usuário/senha) e o `timeField` configurado. Informe texto, índice (opcional), intervalo `since`/`until` e paginação pequena. Nunca peça a credencial nem a inclua nos artefatos. Se não estiver configurado, registre a limitação.

## `change_issue_to_maintenance` — encaminhamento

Disponível somente no fluxo de Apoio ao cliente. Use apenas quando a investigação indicar que é necessário desenvolvimento e depois de confirmação explícita do usuário. A tool pede uma confirmação adicional no TUI e executa um PUT no Jira; em modo não interativo não altera a issue.

## `emit_epic_artifacts` — entrega do Epic e dos fluxos planos

Chame **exatamente uma vez**, ao final, depois de o usuário confirmar a quebra. O conteúdo depende do fluxo:

- **Epic** → `epic` + `stories` (histórias verticais; `tasks` é rejeitado).
- **Manutenção / Apoio / Documentação / genérico** → `epic` + `tasks` (`stories` é rejeitado).
- **Story** → use `emit_story_artifacts`; esta tool falha de propósito.

```jsonc
{
  "epic": { "key", "summary", "objective", "context", "successCriteria",
            "analysis", "outOfScope", "openQuestions", "labels" },
  "stories": [                    // fluxo Epic
    { "id", "title", "jiraKey?", "wave", "dependsOn", "estimate", "objective",
      "valorObservavel", "context", "acceptanceCriteria", "analysis",
      "affectedAreas", "outOfScope", "risks", "labels", "storyPoints" }
  ],
  "tasks": [ /* fluxos planos — mesmo contrato do emit_story_artifacts */ ]
}
```

O harness grava `epic.md`, `index.md` e `stories/STORY-NN-<slug>.md` (ou `tasks/TASK-NN-<slug>.md`) e devolve os caminhos.

## `emit_story_artifacts` — entrega da Story

Chame **exatamente uma vez**, ao final, depois de o usuário confirmar a quebra. Entrega a `story` e as `tasks` implementáveis por agentes em paralelo. O harness grava `story.md`, `index.md`, `tasks/TASK-NN-<slug>.md` e cria `evidence/`.

```jsonc
{
  "story": { "id", "title", "jiraKey?", "wave", "dependsOn", "estimate",
             "objective", "valorObservavel", "context", "acceptanceCriteria",
             "analysis", "affectedAreas", "outOfScope", "risks", "labels", "storyPoints" },
  "tasks": [
    { "id", "title", "wave", "dependsOn", "estimate", "objective", "valorObservavel",
      "context", "acceptanceCriteria", "technicalNotes", "affectedAreas", "tests",
      "outOfScope", "risks", "labels", "type", "storyPoints",
      "repo", "branch", "filesLikelyTouched", "implementableByAgent", "kind",
      "validation": { "kind": "pw2|unit-tests|manual", "environment?", "company?",
                      "register?", "steps?", "expected" } }
  ]
}
```

## Regras que o harness rejeita

- Tarefa de código sem `acceptanceCriteria` (fluxo Story e fluxos planos).
- No fluxo Story, tarefa de código (`Codificação`/`Defeito`) sem `validation.expected`.
- `validation.kind = "pw2"` com `environment` diferente de `local` e sem `company`.
- Duas tarefas da mesma onda com `filesLikelyTouched` em comum (gate anti-conflito).

Regras que viram **aviso** no retorno:

- Tarefa de uma onda paralela sem `filesLikelyTouched`.
- `pw2` fora de `local` com empresa fora de `autoRunCompanies` (o worker não consegue validar sem humano → trate como `manual`).

## Validação — convenção local do PW2

O harness injeta no fim da mensagem a convenção vigente (arquivo `validation-defaults.json` da extension). Hoje: **testes locais do PW2 rodam sempre na empresa `a408453` e, por padrão, com a matrícula `236`**.

- Em `validation` com `kind: "pw2"`, preencha `environment: "local"`, `company: "a408453"` e cite a matrícula `236` nos `steps`.
- Se o cenário pedir outra matrícula, declare-a explicitamente — o default é só o ponto de partida.
- O harness preenche `company`/`register` quando você deixar vazio, mas o `expected` e os `steps` são responsabilidade sua.
