# {{jiraKey}} — {{summary}}

- **História:** {{storyId}} — {{summary}}
- **Epic pai:** {{parentKey}}
- **Tipo:** {{issueType}}
- **Fonte:** {{jiraUrl}}
- **Refinado em:** {{syncedAt}}

## Tarefas

| ID | Título | Onda | Dependências | Validação | Status | Evidência |
|----|--------|------|--------------|-----------|--------|-----------|
{{taskRows}}

## Ondas

{{waveSections}}

## Como validar

- `pw2` — o agente implementador chama `pw2_request` no ambiente/empresa declarados na tarefa; fora de `local`, a empresa precisa estar em `autoRunCompanies` para rodar sem humano.
- `unit-tests` — rode os testes indicados na tarefa.
- `manual` — exige um humano no TUI; o agente apenas registra o roteiro e o resultado esperado.
- A evidência de cada tarefa fica em `evidence/TASK-NN-<slug>.md`.

## Protocolo de status

- O agente implementador marca `fazendo` ao iniciar e `pronto` ao concluir (o `epic-runner` atualiza a tarefa e esta tabela).
- Nunca renumere IDs de tarefa depois de gravados.
- Despacho: `/implement-story <STORY-KEY>` — as ondas rodam em paralelo, uma worktree por tarefa.
