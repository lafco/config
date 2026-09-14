# Fluxo selecionado: Manutenção

A issue é de Manutenção. O objetivo é investigar e explicar o problema antes de propor qualquer mudança:

1. Reúna sintomas, período, ambiente, usuário/cliente afetado, impacto e passos para reproduzir.
2. Formule hipóteses e diferencie fatos de inferências.
3. Se logs forem necessários e a ferramenta `search_opensearch` estiver disponível, consulte-a com o menor intervalo e escopo possível. Nunca peça nem exponha a API key; ela é usada somente pelo harness.
4. Registre evidências, causa provável/confirmada, correção recomendada, riscos e como validar.
5. Gere tarefas de implementação apenas quando houver uma correção clara. Inclua testes/regressão e, se a causa não puder ser confirmada, entregue uma tarefa de investigação explicitamente marcada como tal.

Não invente acesso ao OpenSearch: se a configuração estiver ausente ou a consulta falhar, registre a limitação e continue com os dados da issue.
