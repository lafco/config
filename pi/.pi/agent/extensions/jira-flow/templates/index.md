# {{jiraKey}} — {{summary}}

- **Épico:** {{summary}}
- **Fonte:** {{jiraUrl}}
- **Refinado em:** {{syncedAt}}

## Tarefas

| ID | Título | Onda | Dependências | Status | Jira |
|----|--------|------|--------------|--------|------|
{{taskRows}}

## Ondas

{{waveSections}}

## Protocolo de status

- O agente implementador marca `fazendo` ao iniciar e `pronto` ao concluir.
- Nunca renumere IDs de tarefa depois de gravados.
- Despacho: 1 tarefa por agente, branch dedicada, lendo o arquivo da tarefa + este `index.md`.
