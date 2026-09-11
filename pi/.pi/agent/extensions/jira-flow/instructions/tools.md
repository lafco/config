# Ferramentas do refinamento — quando e como usar

O harness (`jira-flow`) registra quatro ferramentas. O conteúdo final **só** existe via `emit_epic_artifacts`; as demais servem para conduzir a conversa e validar o entendimento.

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

## `submit_analysis` — modelo do épico (gate)

Antes de decompor, submeta o entendimento para revisão. **Sem aprovação, `emit_epic_artifacts` é bloqueado.**

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

Comportamento:

- O harness mostra a análise ao usuário e ele pode **Aprovar**, **Rejeitar com comentário** ou **Cancelar**.
- Em caso de rejeição, o retorno traz o comentário: ajuste e chame `submit_analysis` **de novo**.
- Após aprovar, prossiga para a decomposição. Se algo material mudar depois, submeta de novo.
- `areasDoCodigo` vem da investigação do repositório — use caminhos concretos, não "backend".

## `consult_specialist` — catálogo de produtos

Consulta os agentes especialistas do produto do épico.

```jsonc
{
  "pergunta": "dúvida técnica/produto",
  "produto": "opcional; padrão = o resolvido na Fase 0",
  "especialista": "opcional; use quando souber qual"
}
```

- Use na **Fase 1** (entendimento) e na **Fase 3** (especificação).
- Uma dúvida por chamada, formulada de forma específica.
- Se o catálogo estiver indisponível, a tool retorna erro: caia para a **investigação do repositório** e registre a lacuna em `riscos`/`duvidas`.
- Não invente a resposta do especialista: o que não veio do catálogo, da issue ou do código é incerteza.

## `emit_epic_artifacts` — entrega

Chame **exatamente uma vez**, ao final, com a análise e a lista de tarefas. Requer a análise aprovada.

```jsonc
{
  "epic": { "key", "summary", "objective", "context", "successCriteria",
            "analysis", "outOfScope", "openQuestions", "labels" },
  "tasks": [
    { "id", "title", "wave", "dependsOn", "estimate", "objective", "context",
      "acceptanceCriteria", "technicalNotes", "affectedAreas", "tests",
      "outOfScope", "risks", "labels", "type", "storyPoints" }
  ]
}
```

O harness grava `epic.md`, `index.md` e `tasks/TASK-NN-<slug>.md` e devolve os caminhos. Só então considere o refinamento concluído.
