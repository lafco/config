# {{jiraKey}} — {{summary}}

- **Issue:** {{summary}}
- **Tipo:** {{issueType}} (Epic)
- **Fonte:** {{jiraUrl}}
- **Refinado em:** {{syncedAt}}

## Histórias

| ID | Título | Onda | Dependências | Valor observável | Refinamento |
|----|--------|------|--------------|------------------|-------------|
{{storyRows}}

## Ondas

{{waveSections}}

## Protocolo

- Cada história é uma **fatia vertical** negociável; o detalhamento técnico acontece no refinamento dela.
- Refine cada história com `/refinar-issue <STORY-KEY>`; a coluna **Refinamento** aponta para o índice dela (`./<KEY>/index.md`) quando já existe.
- Para implementar as tarefas da história: `/implement-story <STORY-KEY>`.
- Nunca renumere IDs de história depois de gravados.
