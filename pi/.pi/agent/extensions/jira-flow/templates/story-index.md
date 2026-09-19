# {{jiraKey}} — {{summary}}

- **História:** {{storyId}} — {{summary}}
- **Epic pai:** {{parentKey}}
- **Tipo:** {{issueType}}
- **Fonte:** {{jiraUrl}}
- **Refinado em:** {{syncedAt}}

## Tarefas

| ID | Título | Onda | Dependências | Validação | Teste | Status | Evidência | Review |
|----|--------|------|--------------|-----------|-------|--------|-----------|--------|
{{taskRows}}

## Ondas

{{waveSections}}

## Como validar

- `pw2` — o agente implementador chama `pw2_request` no ambiente/empresa declarados na tarefa; fora de `local`, a empresa precisa estar em `autoRunCompanies` para rodar sem humano.
- `unit-tests` — rode os testes indicados na tarefa.
- `manual` — exige um humano no TUI; o agente apenas registra o roteiro e o resultado esperado.
- A evidência de cada tarefa fica em `evidence/TASK-NN-<slug>.md`.

## Review das tarefas

Cada tarefa passa por um revisor (subagente) depois da implementação, com veredito em `review/TASK-NN-<slug>-t<tentativa>.md`. O review **não bloqueia** a esteira: ele registra a categoria dos achados e a rota.

| Categoria | Significa | Rota |
|---|---|---|
| `quebra` | tarefa não autocontida, critério ambíguo, contexto/arquivo faltando | `bloqueado` — volta ao refinamento |
| `analise` | a tarefa pede a coisa errada | `bloqueado` — volta ao refinamento |
| `execucao` | tarefa boa, implementação incompleta ou errada | retry 1x levando os achados |
| `ambiente` | suíte/endpoint/credencial ausente, flake | retry 1x |
| `escopo` | correta, mas fora do que a story pede | `bloqueado` |

Uma tentativa por arquivo: `-t1` é a primeira revisão, `-t2` a re-revisão depois do retry. As duas ficam no disco — é o que permite responder se o problema foi quebra, análise ou execução.

## Protocolo de status

- O agente implementador marca `fazendo` ao iniciar e `pronto` ao concluir (o `epic-runner` atualiza a tarefa e esta tabela).
- Uma tarefa com achados `quebra`, `analise` ou `escopo` vai para `bloqueado`; o motivo fica na coluna Review, não no chat. Ao acumular `bloqueado`, releia os achados antes de refinar de novo — a correção é no refinamento, não na tarefa.
- Nunca renumere IDs de tarefa depois de gravados.
- Despacho: `/implement-story <STORY-KEY>` — as ondas rodam em paralelo, uma worktree por tarefa.
