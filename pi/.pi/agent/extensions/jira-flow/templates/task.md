---
id: {{id}}
jira_key: ""
project: {{project}}
type: {{type}}
parent: {{parent}}
summary: {{summary}}
labels: {{labelsYaml}}
story_points: {{storyPoints}}
assignee: ""
status: backlog
wave: {{wave}}
depends_on: {{dependsOnYaml}}
repo: {{repo}}
branch: {{branch}}
files_likely_touched: {{filesLikelyTouchedYaml}}
implementable_by_agent: {{implementableByAgent}}
kind: {{kind}}
validation_kind: {{validationKind}}
validation_environment: {{validationEnvironment}}
validation_company: {{validationCompany}}
validation_register: {{validationRegister}}
validation_expected: {{validationExpectedYaml}}
---

# {{id}} — {{title}}

- **Status:** backlog
- **Onda:** {{wave}}
- **Dependências:** {{dependsOnText}}
- **Estimativa:** {{estimate}}
- **Repositório:** {{repoText}}
- **Branch sugerida:** {{branchText}}
- **Categoria:** {{kindText}}

## Objetivo

{{objective}}

## Valor observável

{{valorObservavel}}

## Contexto

{{context}}

## Critérios de aceite

{{acceptanceCriteria}}

## Notas técnicas

{{technicalNotes}}

## Áreas afetadas

{{affectedAreas}}

## Arquivos prováveis

{{filesLikelyTouchedText}}

## Validação

- **Tipo:** {{validationSummary}}
- **Esperado:** {{validationExpected}}

Passos:

{{validationSteps}}

## Testes

{{tests}}

## Definição de Pronto (DoD)

- [ ] Critérios de aceite atendidos
- [ ] Testes descritos passando
- [ ] Validação executada conforme a seção acima
- [ ] Sem regressões conhecidas
- [ ] Evidência registrada em `evidence/<ID>-<slug>.md`
- [ ] Status atualizado para `pronto` no `index.md`

## Fora de escopo

{{outOfScope}}

## Riscos e perguntas em aberto

{{risks}}
