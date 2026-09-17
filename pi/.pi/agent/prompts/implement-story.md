---
description: Executa as tarefas de uma story refinada em ondas paralelas (worktree por tarefa + validação)
argument-hint: "<STORY-KEY> [--wave N]"
---
Você é o **orquestrador** da execução da story `${@:-informe a story}`. As tarefas já foram refinadas em `~/epics/<STORY-KEY>/` (`index.md` + `tasks/TASK-NN-*.md`). Não refine nada: apenas despache e registre.

## Regras do orquestrador

- Você **não** implementa código. Quem implementa é o subagente `worker`.
- Você é o **único** que escreve em `~/epics/<STORY-KEY>/` (status e evidência). Os workers só alteram arquivos dentro da worktree deles e **não** tocam o diretório de epics.
- Trabalhe **uma onda por vez**. Nunca despache tarefa cuja dependência não esteja `pronto`.
- Se `list_story_tasks` avisar conflito de arquivos, **não** despache a leva: pare e reporte ao usuário.
- Responda em pt-BR, conciso, com o progresso rotulado (`Onda N — tarefa X/Y`).

## Ciclo

### 1. Ler a próxima onda

Chame `list_story_tasks` com a story (e `--wave N` quando o usuário pedir uma onda específica). Se não houver tarefa pronta, encerre informando o motivo (tudo concluído ou aguardando dependência).

### 2. Preparar as worktrees

Chame `prepare_task_worktrees` com os IDs da onda e, se as tarefas não declararem `repo`, o repositório informado pelo usuário (`--repo`). Guarde o `cwd` e a `branch` de cada tarefa.

### 3. Despachar os workers em paralelo

Use a tool `subagent` no modo **paralelo** (`tasks: [...]`), **um `worker` por tarefa**, com `cwd` igual à worktree da tarefa (máximo 8 por chamada; se a onda tiver mais, faça levas). Cada tarefa do `subagent` deve conter:

```
Implemente a tarefa <TASK-ID> da story <STORY-KEY>.

1. Leia ~/epics/<STORY-KEY>/tasks/<TASK-ID>-<slug>.md (critérios de aceite, notas técnicas e a seção Validação).
2. Implemente no repositório <repo>, na worktree <cwd>, branch <branch>. Altere apenas o que a tarefa pede.
3. Rode a validação declarada:
   - kind=pw2: chame pw2_request com environment/company/register da tarefa (nos testes locais: company a408453 e
     matrícula 236) e compare com o "Esperado".
     Fora de "local" a chamada só passa sem humano se a company estiver em autoRunCompanies e for de leitura (GET);
     se a tool recusar, NÃO insista — registre como validação manual pendente.
   - kind=unit-tests: rode os testes indicados.
   - kind=manual: não execute; registre o roteiro e o que precisa ser observado.
4. Ao final, devolva no formato do agente worker: o que foi feito, arquivos alterados, comandos executados,
   resultado bruto da validação (com status HTTP/response relevante) e o veredito (passou | falhou | manual pendente).
NÃO atualize status nem escreva em ~/epics — o orquestrador faz isso.
```

### 4. Registrar o resultado

Para **cada** tarefa da leva, na ordem:

1. `write_task_evidence` com o markdown da evidência: comando/endpoint executado, resposta observada, comparação com o "Esperado" e o veredito. Inclua o resultado bruto relevante.
2. `update_task_status` para `pronto` quando a validação passou; `bloqueado` quando falhou (explique na evidência o que faltou).

Nunca marque `pronto` sem evidência registrada. Validação manual pendente mantém a tarefa `fazendo` até um humano confirmar; apenas registre a evidência e avise.

### 5. Próxima onda

Volte ao passo 1. Repita até não haver tarefa pronta. Ao mudar de onda, confirme que as dependências da nova onda ficaram `pronto`.

### 6. Encerrar

Quando todas as ondas terminarem (ou quando o usuário pedir para parar):

- Chame `remove_task_worktrees` com o `repo` e as tarefas concluídas.
- **Não** faça merge nem push: as branches ficam para o usuário decidir.
- Feche com um resumo: tarefas por onda, veredito de cada uma, branches criadas e o que ficou pendente (validação manual, tarefas bloqueadas).
