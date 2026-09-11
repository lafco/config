---
description: Pesquisa um tema em fontes primárias e devolve findings citados (sem implementar)
argument-hint: "<tema ou pergunta>"
---
Use a tool `subagent` no modo `single` com o agente "research" para investigar: ${@:-o tema fornecido}

Como montar a tarefa (o agente tem contexto **isolado** e não vê esta conversa):

- Repita a pergunta por extenso no campo `task`, incluindo o repositório/caminho relevante e o que já se sabe, para ele não precisar redescobrir.
- Deixe explícito: **"Complete a investigação com seu próprio contexto e ferramentas. Não spawne nem delegue a subagentes."**
- Peça o output no formato do agente: `## Findings` (cada claim com fonte — URL ou `path:line` — e confiança alta/média/baixa) e `## Open Questions`.

O agente é read-only (`read`, `grep`, `find`, `ls`, `bash` não-mutante): ele não cria nem edita arquivos. O resultado volta como texto; se o usuário quiser um `.md` no repo, escreva o arquivo você mesmo a partir do relatório.

Ao receber o relatório, apresente os findings com as fontes e destaque o que ficou **sem verificação** contra fonte primária. Não implemente nada.
