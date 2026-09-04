---
description: Scout coleta contexto, planner cria plano (sem implementar)
argument-hint: "<tarefa>"
---
Use a tool `subagent` com o parâmetro `chain` para executar este workflow:

1. Primeiro, use o agente "scout" para localizar todo o código relevante para: ${@:-a tarefa fornecida}
2. Depois, use o agente "planner" para criar um plano de implementação para "${@:-a tarefa}" usando o contexto do passo anterior (placeholder {previous})

Execute como uma chain, passando a saída entre os passos via {previous}. NÃO implemente — apenas retorne o plano.
