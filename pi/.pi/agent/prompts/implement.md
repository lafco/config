---
description: Implementa via chain scout -> planner -> worker
argument-hint: "<tarefa|~/epics/<KEY>/tasks/TASK-NN-*.md>"
---
Use a tool `subagent` com o parâmetro `chain` para executar este workflow:

1. Primeiro, use o agente "scout" para localizar todo o código relevante para: ${@:-a tarefa fornecida}

   Se o argumento for um **arquivo de tarefa** em `~/epics/<KEY>/tasks/TASK-NN-*.md`, leia-o antes e passe ao scout o conteúdo completo da tarefa (critérios de aceite, notas técnicas, `repo`, `filesLikelyTouched` e a seção **Validação**), não só o caminho.

2. Depois, use o agente "planner" para criar um plano de implementação para "${@:-a tarefa}" usando o contexto do passo anterior (placeholder {previous})

3. Por fim, use o agente "worker" para implementar o plano do passo anterior (placeholder {previous}).

   No worker, respeite o contrato da tarefa quando houver:
   - implemente apenas o que a tarefa pede, no `repo`/branch declarados (use a worktree quando estiver executando via `/implement-story`);
   - execute a validação declarada (`pw2` com `pw2_request` no ambiente/empresa da tarefa, `unit-tests`, ou `manual` — nesse caso não execute, só registre o roteiro);
   - devolva o resultado bruto da validação e o veredito.

4. Se a tarefa veio de `~/epics/<KEY>/tasks/`, ao final registre o resultado com as tools do `epic-runner`: `write_task_evidence` (com o que foi executado e observado) e `update_task_status` (`pronto` se passou, `bloqueado` se falhou). Nunca marque `pronto` sem evidência.

Execute como uma chain, passando a saída entre os passos via {previous}.
