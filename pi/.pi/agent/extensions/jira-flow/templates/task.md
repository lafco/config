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
test_strategy: {{testStrategyYaml}}
test_file: {{testFileYaml}}
test_red_command: {{testRedCommandYaml}}
test_green_command: {{testGreenCommandYaml}}
test_why: {{testWhyYaml}}
review_status: ""
review_category: ""
attempts: 0
base_sha: ""
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

## Teste

- **Estratégia:** {{testSummary}}
- **Arquivo de teste:** {{testFileText}}
- **Deve falhar antes (RED):** {{testRedCommandText}}
- **Deve passar depois (GREEN):** {{testGreenCommandText}}
{{testWhyLine}}

{{tests}}

## Definição de Pronto (DoD)

Os itens abaixo são do **agente implementador**; os marcados como *orquestrador* não são dele.

- [ ] Critérios de aceite atendidos
- [ ] Testes descritos passando
- [ ] Contrato de teste cumprido (`test.strategy`); em `tdd`, a evidência traz o RED (falhou antes) e o GREEN (passou depois)
- [ ] Validação executada conforme a seção acima, com o resultado bruto no relatório
- [ ] Sem regressões conhecidas
- [ ] Commit feito na branch da tarefa
- [ ] *(orquestrador)* Evidência registrada em `evidence/<ID>-<slug>.md`
- [ ] *(orquestrador)* Status no `index.md` atualizado — `pronto` só depois do review da tarefa

## Fora de escopo

{{outOfScope}}

## Riscos e perguntas em aberto

{{risks}}
