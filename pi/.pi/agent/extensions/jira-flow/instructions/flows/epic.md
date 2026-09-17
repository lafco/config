# Fluxo selecionado: Epic

A issue é um **Epic**. Sua entrega é a lista de **histórias** (`stories`) — o detalhamento técnico em tarefas acontece depois, no refinamento de cada história.

## Regra central

- **Um Epic não emite `tasks`.** Se você tentar, o harness rejeita. A tool é `emit_epic_artifacts` com `epic` + `stories`.
- Cada **história** é uma fatia **vertical** completa e negociável: entrega valor observável sozinha, de ponta a ponta, e cabe em um refinamento próprio.
- Não quebre por camada técnica (view/controller/serviço), nem por passo da descrição. A régua está em `quebra-padroes.md`.
- Os filhos já existentes no Jira são contexto: **não** os duplique. Se um filho existente cobre uma fatia, registre-o em `context`/`analysis` em vez de recriar; use `jiraKey` na história apenas quando ela já existe no Jira.

## O que cada história precisa

- `id` (`STORY-01`, `STORY-02`, ...), estável e único.
- `title` curto, orientado a resultado (não a atividade).
- `valorObservavel` — o que fica demonstrável com a história e para quem.
- `acceptanceCriteria` (≥ 1, em Dado/Quando/Então) — o contrato de negócio da fatia.
- `objective`, `context`, `outOfScope`, `risks` quando ajudarem a especificar.
- `wave` (onda) e `dependsOn` — o sequenciamento do epic.
- `estimate` (`S`/`M`/`L` ou horas) e `storyPoints` (opcional).

## Sequenciamento

- Monte o grafo de dependências entre histórias (`dependsOn`) e agrupe em ondas.
- Histórias independentes ficam na mesma onda; as demais entram depois das suas dependências.
- Uma história não deve depender de detalhe interno de outra: se depender, provavelmente o corte está errado (junte ou reorganize).

## Encaminhamento

Cada história será refinada individualmente depois:

```
/refinar-issue <STORY-KEY>     # detalha a história e produz as tarefas
/implement-story <STORY-KEY>   # executa as tarefas em paralelo por onda
```

Por isso, escreva a história pensando em quem vai refiná-la: sem ambiguidade de negócio, com o valor e os critérios claros.
