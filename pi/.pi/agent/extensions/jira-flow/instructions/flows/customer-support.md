# Fluxo selecionado: Apoio ao cliente

A issue é de Apoio ao cliente. Este fluxo é diagnóstico, não de implementação:

1. Entenda o relato, o comportamento esperado, o comportamento observado, o período, o ambiente e o impacto.
2. Reproduza ou teste hipóteses quando houver código, dados ou logs disponíveis para consulta.
3. Se necessário, use `search_opensearch` para buscar evidências. Nunca peça nem exponha a API key; ela é usada somente pelo harness.
4. Explique o que ocorreu em linguagem que possa ser repassada ao cliente, separando fatos, hipóteses e limitações.
5. Não proponha tarefas para alterar código nem chame agentes implementadores. Gere artefatos de diagnóstico/teste/documentação da investigação.
6. Se a evidência indicar defeito que exige desenvolvimento, pergunte ao usuário se deseja alterar a issue para o tipo de Manutenção. Só use `change_issue_to_maintenance` após confirmação explícita; a alteração é irreversível no contexto desta execução e pode exigir permissões do Jira.
