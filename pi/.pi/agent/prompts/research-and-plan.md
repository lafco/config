---
description: Research (fontes externas) + scout (codebase) em paralelo, depois planner
argument-hint: "<tarefa>"
---
Workflow em **duas chamadas** da tool `subagent` — ela aceita apenas um modo por chamada (`single` | `parallel` | `chain`), então não tente expressar isto como uma chain única.

## Chamada 1 — `subagent` modo `parallel`

Duas tarefas independentes sobre: ${@:-a tarefa fornecida}

1. agente `research` — levantar os **fatos externos** necessários (docs oficiais, specs, upstreams, APIs de terceiros): o que a fonte primária realmente diz, com citação.
2. agente `scout` — localizar no **codebase** todo o código relevante: arquivos com ranges de linha, tipos/funções-chave, arquitetura e por onde começar.

Os dois têm contexto isolado e não veem esta conversa: repita a tarefa por extenso em cada item de `tasks`, e inclua em ambos a instrução **"Complete a tarefa com seu próprio contexto e ferramentas. Não spawne nem delegue a subagentes."**

## Chamada 2 — `subagent` modo `single`, agente `planner`

Monte o `task` colando **os dois relatórios** do passo 1 (research e scout) seguidos da tarefa original, e peça o plano no formato do planner (`## Goal`, `## Plan`, `## Files to Modify`, `## New Files`, `## Risks`).

## Regras

- NÃO implemente nada — apenas retorne o plano final.
- Se o research não encontrar fonte primária para alguma parte, registre isso como risco ou premissa em aberto no plano em vez de deixar o planner assumir.
- Se a tarefa não depender de nenhum fato externo, diga isso ao usuário e rode só scout → planner (use `/scout-and-plan`).
