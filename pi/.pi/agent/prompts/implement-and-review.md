---
description: Implementa, revisa e aplica feedback (worker -> reviewer -> worker)
argument-hint: "<tarefa>"
---
Use a tool `subagent` com o parâmetro `chain` para executar este workflow:

1. Primeiro, use o agente "worker" para implementar: ${@:-a tarefa fornecida}
2. Depois, use o agente "reviewer" para revisar a implementação do passo anterior (placeholder {previous})
3. Por fim, use o agente "worker" para aplicar o feedback da revisão (placeholder {previous})

Execute como uma chain, passando a saída entre os passos via {previous}.
