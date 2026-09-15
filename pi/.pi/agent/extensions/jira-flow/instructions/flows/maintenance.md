# Fluxo selecionado: Manutenção

A issue é de Manutenção (incidente em produto existente). O objetivo é investigar, **provar a causa** e entregar a **correção** — não montar um programa de tarefas.

1. Reúna sintomas, período, ambiente, base/empresa, cliente e usuário afetados, impacto e passos para reproduzir. O template obrigatório do time (1. Detalhamento geral, 2. Simulação e evidências, 3. Impacto e cronograma, 4. Dados do colaborador, 5. Ambiente técnico) já vem no `jira-source.md` — use-o como roteiro.
2. Confirme a causa **no código** (ou nos logs, quando `search_opensearch` estiver disponível). Diferencie fato comprovado de inferência. Nunca peça nem exponha a API key do OpenSearch; se ele não estiver configurado, registre a limitação e siga.
3. Se a causa **não** puder ser comprovada com o que existe, a entrega é **uma** tarefa de investigação (tipo `Spike`), com timebox e as perguntas a responder. Não invente uma correção.
4. Se a causa estiver comprovada, a entrega é:
   - **uma tarefa de correção** (`Codificação` ou `Defeito`), cujos critérios de aceite incluem a **validação com a evidência real do relato** (base/empresa/matrícula);
   - **uma tarefa `Associado [CLIENTE]` por cliente/relato afetado**, quando a mesma correção atende mais de um relato. Associado é rastreamento e comunicação da solução, não alteração de código. Com um único relato, não crie Associado.
5. Fora de escopo por padrão (salvo se a issue pedir): detecção/regularização pelo job/cron, limpeza retroativa dos dados afetados, bloqueio em caminhos ainda não comprovados (aprovação/concessão) e refatorações ao redor. Registre como recomendação no épico, com o motivo.
6. Nunca crie tarefa para problema adjacente "de brinde": o épico de Manutenção entrega a correção do relato e o rastro por cliente.
