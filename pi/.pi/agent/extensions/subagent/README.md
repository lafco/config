# subagent

Extension do pi que expõe a tool `subagent`: delega uma tarefa a um agente especializado
(`~/.pi/agent/agents/*.md`) num processo `pi` separado, com contexto isolado.

Modos: `single` (`agent` + `task`), `parallel` (`tasks: [...]`) e `chain` (sequencial, com
`{previous}` no lugar da saída anterior).

## Modelo por fase

Fase = agente. O `models.json` ao lado desta extensão (sobrescrevível por
`SUBAGENT_MODELS`) carrega só o esforço de raciocínio por fase. O **modelo** de toda
subagente é o da conversa.

```json
{
  "thinking": { "worker": "low", "validator": "high" }
}
```

Herdar o modelo da sessão é a política, não uma omissão: slug fixo quebra quando a
organização desabilita o modelo. Em 2026-11-16 três runners do skill `architect` morreram
com `403 Model access is disabled` porque o painel apontava para
`opencode-go/kimi-k3.1-pro`, `opencode-go/gemini-4-argon` e `opencode-go/minimax-m3.1-flash`.

Se algum dia for preciso fixar modelo por agente, a chave `agents` volta a valer: cada lista
é ordenada, o primeiro que rodar vence e os seguintes são fallback. Nesse caso ponha o
fallback **em outro provider** — dois modelos do mesmo gateway caem juntos — e o
`models.test.ts` volta a exigir dois providers por agente.

## Precedência

| Ordem | Fonte |
|---|---|
| 1 | `model` do despacho (`tasks[].model`, `chain[].model`, `model`) — existe para o retry escalar uma tarefa cujo review apontou achados `execucao`; não é para uso rotineiro |
| 2 | lista do agente no `models.json` (hoje vazia: o arquivo só traz `thinking`) |
| 3 | `model:` no frontmatter do agente |
| 4 | modelo da sessão — o caminho normal aqui, não o último recurso |

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
