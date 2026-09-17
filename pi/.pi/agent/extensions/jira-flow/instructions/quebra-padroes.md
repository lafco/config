# Padrões de quebra (Humanizing Work — Richard Lawrence)

Aplique os padrões **em ordem** (do 1 ao 9): use o primeiro que funcionar. Depois de quebrar, reaplique às partes que ainda forem grandes.

## Regras da casa (valem antes dos 9 padrões)

**Corrigir antes, validar depois.** Diagnóstico não é tarefa de abertura. Com a causa comprovada no código, o primeiro entregável é a correção; a validação com a **evidência real do relato** (base/empresa/matrícula) fecha o trabalho — como critério de aceite da correção, ou como tarefa final quando exigir apuração em dados de produção.

**Escopo fechado.** Problema adjacente não vira tarefa: detecção por job/cron, limpeza retroativa, robustez de casos extremos, refatoração e melhorias ao redor vão para `foraDeEscopo`/`riscos` como recomendação — salvo se a issue pedir explicitamente.

**Junte antes de dividir.** O que um agente entrega em uma sessão é **uma** tarefa. Não crie tarefa por etapa interna (validar, tratar erro, ajustar mensagem) quando tudo cabe no mesmo commit. Uma Manutenção com causa comprovada é **uma** correção — não uma árvore técnica.

**A descrição é pista, não plano.** Passos sugeridos na issue (view, controller, método, modal) são insumo técnico: o que pertence à fatia escolhida vira nota técnica dela; o resto vai para `foraDeEscopo`. Nunca vire uma tarefa por passo.

**A fatia mínima completa é a hipótese inicial.** Proponha **1 tarefa**; cada tarefa adicional exige justificativa explícita de tamanho (> 16h), dependência real ou entrega independente. Divisão por camada da mesma funcionalidade é sempre inválida.

**Vocabulário do time.** Nomeie as tarefas com as categorias usadas no Jira do time:

| Categoria | Uso |
|---|---|
| `Codificação` | Mudança de código; uma tarefa vertical por funcionalidade, sem divisão por camada |
| `Defeito` | Bug encontrado sob uma Story/Epic |
| `Execução de TU` / `Merge` | Etapas de entrega, quando a issue exigir |
| `Associado [CLIENTE]` | **Manutenção**: um por cliente/relato afetado pela mesma correção (rastreamento e comunicação, não código) |
| `Spike` | Investigação com timebox e perguntas a responder (padrão 9) |

## Quebra para execução por agentes (Story)

Quando a quebra vai virar tarefas despachadas a agentes em paralelo (`/implement-story`), valem restrições extras:

- **Uma tarefa = uma sessão de agente.** Se não cabe num contexto de implementação, quebre de novo.
- **Autocontida:** a tarefa declara `repo`, `filesLikelyTouched`, como validar e o que é sucesso. O agente não deve precisar decidir produto no meio do caminho.
- **Sem colisão:** tarefas da mesma onda não compartilham arquivo — se compartilham, são a mesma tarefa ou vão para ondas diferentes.
- **Validação declarada:** `pw2` (com ambiente/empresa), `unit-tests` ou `manual`. Prefira a validação que o próprio agente executa; mutações e dependência de dado humano ficam `manual`. Nos testes locais do PW2, use sempre a empresa `a408453` e a matrícula padrão `236` (convenção do harness).
- **Regra non-TUI:** `pw2` fora de `local` só roda sozinho com a empresa em `autoRunCompanies`; caso contrário, declare `manual` e registre o roteiro.

O Epic não entra aqui: no Epic a quebra para em **histórias**, e cada história é refinada com `/refinar-issue` antes de virar tarefas.

## Meta-padrão (vale para todos)

1. Identifique a complexidade central do item.
2. Liste todas as variações.
3. Reduza a **uma fatia completa** (o caso mais simples e valioso, de ponta a ponta).
4. Transforme cada variação restante em tarefa separada.

## Os 9 padrões

1. **Passos do fluxo de trabalho** — o fluxo em si tem etapas naturais. Quebre em fatias finas de ponta a ponta por etapa (não "tela por tela").
2. **Operações (CRUD)** — Criar, Ler, Atualizar, Excluir viram tarefas separadas; "Criar" primeiro.
3. **Variações de regra de negócio** — cada regra diferente vira uma tarefa (ex.: desconto por tipo de cliente).
4. **Variações de dados** — diferentes tipos/fontes de dados (ex.: relatório de vendas vs. de estoque).
5. **Métodos de entrada de dados** — interface simples primeiro; importação/API/integração depois.
6. **Esforço maior** — "implemente um + adicione os demais" (ex.: 1 formato de exportação primeiro, demais depois).
7. **Simples/complexo** — versão mais simples do caso completo primeiro; otimizações e casos raros depois.
8. **Performance depois** — "faça funcionar" antes de "faça rápido". Otimização vira tarefa posterior com meta mensurável.
9. **Quebrar um spike** — só quando a **incerteza impede** a própria quebra ou a causa **não** é comprovável: crie a investigação com timebox e perguntas a responder. Causa já comprovada por leitura de código não pede spike.

## Anti-padrões (não quebrar assim)

- Tarefa que não entrega nada observável sozinha ("criar o helper", "ajustar o controller").
- Transformar os passos sugeridos na descrição da issue em tarefas (a descrição é pista, não plano).
- Dividir a mesma funcionalidade por camada (view/controller/model).
- Quebra arbitrária por tamanho, sem preservar valor.
- Árvore técnica onde uma correção única bastava (Manutenção virando 4 tarefas).
- Abrir investigação quando a causa já está comprovada no código.

## Heurísticas de tamanho (em horas, como o time estima)

- **S ~4h · M ~8h · L ~16h**; acima de 16h, quebre de novo.
- 3–8 critérios de aceite no máximo.
- Sem ambiguidade que exija decisão de produto no meio da implementação.
