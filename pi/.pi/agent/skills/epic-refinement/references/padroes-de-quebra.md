# Padrões de quebra (Humanizing Work — Richard Lawrence)

Aplique os padrões **em ordem** (do 1 ao 9): use o primeiro que funcionar. Depois de quebrar, reaplique às partes que ainda forem grandes.

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
9. **Quebrar um spike** — quando a incerteza bloqueia a quebra, crie uma tarefa de investigação com timebox e perguntas a responder.

## Anti-padrões (não quebrar assim)

- **Fatias horizontais**: "tarefa de backend" + "tarefa de frontend" para a mesma funcionalidade.
- Tarefas só de componente técnico sem valor de usuário observável.
- Quebra arbitrária por tamanho, sem preservar valor.

## Heurísticas de tamanho (alvo: 1 sessão de agente)

- ≤ 4h de trabalho estimado; ideal 1–4h.
- 3–8 critérios de aceite no máximo.
- Sem ambiguidade que exija decisão de produto no meio da implementação.
