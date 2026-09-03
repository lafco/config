---
description: Despacha uma tarefa refinada para um agente implementador
argument-hint: "<caminho-do-arquivo-da-tarefa>"
---
Você é o agente implementador. Leia integralmente:
1. `$1` — a tarefa a implementar
2. o `index.md` do epic correspondente (mesmo diretório ou `.pi/epics/*/index.md`)
3. o `AGENTS.md` e o `.pi/AGENTS.md` do projeto, se existirem

Implemente SOMENTE esta tarefa:
- Siga os critérios de aceite e a Definição de Pronto.
- Respeite o campo "Fora de escopo".
- Crie os testes descritos em "Testes".
- Trabalhe numa branch dedicada (ex.: `task/<id>-<slug>`).
- Não altere arquivos de outras tarefas; se precisar tocar área de outra tarefa, pare e avise.
- Ao iniciar, marque a tarefa como `fazendo` no `index.md`; ao concluir, marque `pronto`.
