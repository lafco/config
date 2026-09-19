# subagent

Extension do pi que expõe a tool `subagent`: delega uma tarefa a um agente especializado
(`~/.pi/agent/agents/*.md`) num processo `pi` separado, com contexto isolado.

Modos: `single` (`agent` + `task`), `parallel` (`tasks: [...]`) e `chain` (sequencial, com
`{previous}` no lugar da saída anterior).

## Modelo por fase

Fase = agente. A escolha fica **num lugar só**: `models.json` ao lado desta extensão
(sobrescrevível por `SUBAGENT_MODELS`), no mesmo espírito do `validation-defaults.json` do
jira-flow. Duas fontes de verdade para "qual modelo ganhou" é o que este arquivo evita.

```json
{
  "agents": {
    "worker": ["opencode-go/kimi-k2.7-code", "deepseek/deepseek-v4-pro"]
  },
  "thinking": { "worker": "medium" }
}
```

Cada lista é **ordenada**: o primeiro que rodar vence, os seguintes são fallback. Dois
princípios:

- **Fallback em outro provider.** Dois modelos do mesmo gateway caem juntos quando o
  gateway cai. O `models.test.ts` falha se algum agente do `models.json` não tiver pelo
  menos dois providers.
- **Validator e revisor com modelo diferente do worker.** Mesmo modelo revisando o próprio
  trabalho tende a concordar consigo mesmo.

## Precedência

| Ordem | Fonte |
|---|---|
| 1 | `model` do despacho (`tasks[].model`, `chain[].model`, `model`) — existe para o retry escalar uma tarefa cujo review apontou achados `execucao`; não é para uso rotineiro |
| 2 | lista do agente no `models.json` |
| 3 | `model:` no frontmatter do agente |
| 4 | modelo da sessão — último recurso, nunca o primeiro |

O esforço de raciocínio (`thinking`) segue a mesma origem (config ou despacho) e é
**independente** de onde veio o modelo. Antes, um agente que declarasse `model:` no
frontmatter ignorava o `thinking` do despacho — calibrava-se metade da decisão.

## Fallback por falha

Quando uma tentativa morre **sem produzir resposta nenhuma** (provider fora, rate limit,
modelo indisponível, processo que não subiu), o próximo candidato da lista é tentado, e a
troca aparece no resultado:

```
[fallback de modelo]
- opencode-go/qwen3.8-flash: 429 rate limited
Rodou com deepseek/deepseek-flash.
```

Se o agente respondeu e o processo saiu com erro, **não** há troca de modelo: o problema
não é o modelo, e trocar seria sorteio. Quem decide o que fazer com uma resposta ruim é o
review da tarefa (categoria `execucao`), não o fallback.
