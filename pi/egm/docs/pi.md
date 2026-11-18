# EGM no Pi

Este documento mapeia as frases genéricas de delegação das skills EGM para as tools
do Pi. Ele não muda o fluxo, as personas nem os gates humanos do EGM.

## Invocação das skills

Todas as skills EGM têm `disable-model-invocation: true`, então elas não entram
sozinhas: use a forma de comando.

```text
/skill:egm-brainstorm <ideia>
/skill:egm-draft
/skill:egm-review docs/designs/<doc>.md
/skill:egm-review-loop <lista de revisores>
/skill:egm-resolve
/skill:egm-drift-report docs/designs/
```

## Delegação

| Frase da skill | No Pi |
| --- | --- |
| "Spawn `egm-<persona>`" | tool `subagent`, `agent: "egm-<persona>"`, `task:` com o prompt da skill verbatim, incluindo paths absolutos do documento, do standard e do arquivo de persona em `agents/<arquivo>.md` |
| Vários revisores no mesmo passo | uma chamada de `subagent` com `tasks: [...]`, que roda em paralelo |
| "Spawn `egm-synthesizer`" | não existe no Pi: revisores não aninham subagentes. Use o caminho de dispatch direto da skill, despachando cada revisor e escrevendo o relatório na sessão principal |
| `egm-bootstrap-orchestrator` | não instalado. A sessão principal assume o papel e despacha os revisores |
| Persona fora da lista | pare e rode `pi/egm/install.sh`. Não substitua por agente genérico |

Os revisores disponíveis são `egm-zoom-out`, `egm-design`, `egm-structural`,
`egm-style`, `egm-comprehension`, `egm-codebase-details`,
`egm-implementation-readiness` e `egm-inventive-catalyst`, em `~/.pi/agent/agents`.

Se `subagent` não estiver disponível, pare: revisão no mesmo contexto não é revisão
Goldfish.

Um revisor que falha, estoura timeout ou volta sem relatório é revisão ausente, não
revisão aprovada. Reporte o estágio incompleto e pergunte ao humano como seguir. Não
retome um revisor para perguntar sobre achados de outros revisores: isso quebra o
isolamento.

## Isolamento

O `subagent` sobe um processo `pi` novo, com isolamento de contexto e allowlist de
tools.

| Contexto | O revisor vê? |
| --- | --- |
| A conversa que originou o trabalho | não |
| Tools | só `read`, `grep`, `find`, `ls` |
| `AGENTS.md` global e do projeto | sim |
| Lista de skills anunciadas | sim, mas sem tool que as execute |
| MCP | filtrado pela allowlist |
| Modelo | o da conversa, por política do `models.json` desta instalação |

Isso é isolamento de contexto e de tools. Não é sandbox de sistema de arquivos nem
de processo. Se um `AGENTS.md` do projeto carregar racional que o revisor não deve
ver, tire de lá antes da revisão.

## Manutenção

Não edite `vendor/` nem `~/.pi/agent/agents/egm-*.md`. `vendor/` é o upstream no sha
que está em `vendor/.egm-ref`, e os revisores são regenerados. Mudança de processo
vai em `pi/egm/docs/pi.md`; atualização do EGM, em `EGM_REF` no `install.sh`.
