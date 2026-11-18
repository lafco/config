# workspace

Extensão que transforma o pi num workspace de tarefas: um comando despacha uma
tarefa para um processo `pi` em background, numa worktree própria, e a pergunta que
o agente não consegue decidir sozinho fica numa fila durável até você responder,
em qualquer sessão.

## Por que assim

O trabalho acontece **entre** tarefas, não dentro delas. Dentro, quem manda é a
skill que você mandou rodar (EGM para design, `/ptm` para implementação). Esta
extensão só enfileira, isola, observa e coleta evidência.

Três estruturas, cada uma com um escritor:

| Estrutura | Onde | Quem escreve |
| --- | --- | --- |
| `WorkItem` | `~/.pi/workspace/runs/<id>/item.json` | só o processo pai |
| `Question` | `~/.pi/workspace/runs/<id>/questions/<q>.json` | só o processo pai |
| `Decision` | `~/.pi/workspace/lanes/<raia>/decisions.md` | só o processo pai, append |

O filho headless nunca escreve no estado. Isso evita o problema real de dois
agentes no mesmo arquivo: ele escreve no worktree e conversa por RPC.

## Ciclo

1. `/workspace dispatch <raia> <repo> -- <tarefa>` cria a worktree em
   `<repo>/.worktrees/<id>`, branch `workspace/<id>`, e sobe `pi --mode rpc`.
2. O filho recebe a política da raia, a tarefa e a regra de decisão.
3. Se a política cobre o caso, ele decide e segue. Se não cobre, escreve
   `PERGUNTA.md` no worktree e para. O pai lê o arquivo no `agent_settled` e grava
   a `Question`. Um diálogo aberto por uma extensão do filho também vira pergunta,
   pelo `extension_ui_request`.
4. `/workspace answer <run>/<q> <resposta>` retoma o filho vivo ou, se ele morreu,
   redespacha com a resposta no contexto. Responder também acrescenta uma regra na
   política da raia, então a mesma pergunta não volta.
5. Ao terminar, o run grava `evidence.md` com status, duração, último texto do
   agente e caminho do transcript. `done` só com processo e validação limpos,
   `failed` com o erro, `interrupted` quando você cancela.

## Comandos

```
/workspace                                   status, ativos e fila
/workspace dispatch <raia> <repo> -- <tarefa>
/workspace inbox                             perguntas esperando você
/workspace answer <run>/<q> <resposta>
/workspace log <run> [linhas]
/workspace cancel <run>
/workspace policy <raia>
```

O widget acima do editor mostra o que está rodando e o que espera resposta.

## O que para o trabalho

A política nasce com estas três regras, e só elas param em você:

- ambiguidade que a política não cobre, quando a escolha muda o resultado;
- ação irreversível (force-push, delete, deploy, mensagem para cliente);
- validação ou review falhando depois de duas tentativas.

Aprovar plano antes de implementar não é gate: o gate de design é o EGM, e o resto
a política cobre.

## Limites conhecidos

- Ainda não existe tool para o agente despachar sozinho: só o comando. É o próximo passo.
- Uma tarefa por raia de cada vez. Concorrência acima disso pede fila por raia, não
  um contador.
- `session_shutdown` encerra os filhos. Um filho já morto com pergunta pendente não
  se perde, porque a pergunta está em disco, mas o turno dele não é retomado: ele
  é redespachado.
- O widget foi exercitado só pelo caminho de RPC, que não desenha. Falta ver na TUI.

## Verificação

`./scripts/smoke.sh` dirige a extensão por RPC e prova duas fases: pergunta
respondida com o filho vivo, e pergunta respondida depois de matar o filho
(redespacho). Sai diferente de zero em qualquer falha.
