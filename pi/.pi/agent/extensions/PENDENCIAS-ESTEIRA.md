# Pendências da esteira (epic-runner / subagent / prompts)

Levantadas executando o epic `ECM-1` no projeto `ecm` (8 tarefas, 3 ondas, 4 workers e 4 revisores em paralelo).
Cada item tem evidência de execução real, não é hipótese.

## 1. O prompt manda o impossível: `subagent` paralelo com `cwd`

`pi/.pi/agent/prompts/implement-story.md` (passo 3) instrui: "Use a tool `subagent` no modo **paralelo** (`tasks: [...]`),
um `worker` por tarefa, **com `cwd` igual à worktree da tarefa**". O modo paralelo do `subagent` **não aceita `cwd`** —
só o modo single e os itens do modo chain aceitam (`extensions/subagent/index.ts`).

Consequência: cada worker herda o `cwd` do orquestrador (o checkout principal do repo) e precisa navegar sozinho para a
worktree. Foi exatamente a causa do defeito encontrado no lab: o worker escreveu `src/` e `tests/` no checkout principal.
O contorno atual é o brief reforçado ("trabalhe exclusivamente dentro de `<cwd>`") — funcionou nas 8 tarefas, mas é
disciplina de prompt, não garantia do harness.

**Conserto preferido:** aceitar `cwd` por item no modo paralelo (o `subagent` já sabe montar o processo com `cwd`; falta
o campo no schema do modo paralelo). Alternativa: mudar o prompt para despachar em single (várias chamadas na mesma
mensagem) ou em chain com `cwd`.

## 2. O relatório do revisor é redigitado pelo orquestrador

`write_task_review` recebe `report` (o relatório do revisor, verbatim) e o orquestrador é quem transcreve. Numa leva de
4 tarefas isso é 4 vezes um texto longo reescrito à mão — e a transcrição pode perder justamente a nuance que importa
(no `ok`, o relatório é o único registro das ressalvas e sugestões).

Nesta sessão os relatórios foram extraídos do transcript da sessão (`~/.pi/agent/sessions/<projeto>/*.jsonl`) com um
script Python, para não redigitar.

**Conserto preferido:** o agente `task-reviewer` escreve o próprio arquivo de relatório (tem `write`? hoje o
`task-reviewer` só tem `read, grep, find, ls, bash`) e `write_task_review` recebe o caminho. Alternativa: a tool ler a
saída do último `subagent` daquela tarefa.

## 3. Tools novas não existem em sessão já aberta

As tools `prepare_review_package` e `write_task_review` e o campo `base_sha` do `prepare_task_worktrees` foram
adicionados durante a sessão em curso. O processo do pi já tinha carregado a extensão, então:

- `prepare_review_package` e `write_task_review`: "Tool not found";
- `prepare_task_worktrees`: versão antiga, criava a worktree mas **não gravava `base_sha`** — o pacote de review então
  falhava com "Sem base para o diff".

Contorno usado: chamar as funções dos módulos direto (`buildReviewPackage`, `reviewDocument`, `writeReview`,
`setTaskReview`, `updateIndexRow`, `setTaskField`) por scripts em `/tmp`, e preencher `base_sha` com
`git merge-base <branch-base> <branch-da-tarefa>`.

**Conserto:** documentar no README do epic-runner que editar extensão exige reiniciar o pi (ou recarregar extensões, se
houver API). Vale também a tool de review **degradar bem** quando `base_sha` está vazio, inferindo o merge-base em vez
de falhar.

## 4. Ondas paralelas nascem da base errada quando há arquivo compartilhado entre ondas

As tarefas foram distribuídas em ondas justamente porque compartilham arquivo (`apps/api/main.ts` nas tarefas 01/05/07;
`apps/api/compose.ts` nas 02/06/08). Mas `prepare_task_worktrees` cria todas as branches a partir do mesmo ponto: se a
onda 2 nascer de `main`, ela **não** contém a onda 1 e o merge vai conflitar no arquivo compartilhado.

Contorno usado: uma branch de integração (`ecm-1-integration`) que recebe cada onda mergeada, e as ondas seguintes são
criadas com `baseBranch=ecm-1-integration`. Funcionou (os 6 merges foram limpos), mas é procedimento manual do
orquestrador — o prompt não menciona.

**Conserto:** o prompt do `/implement-story` deveria mandar: criar/reaproveitar uma branch de integração por story,
mergear cada onda nela antes de abrir a seguinte, e basear as worktrees nela. Ou a tool deveria avisar quando a onda
declara arquivo que já foi tocado em onda anterior.

## 5. O gate anti-conflito não vê arquivo tocado fora da lista declarada

O gate compara `filesLikelyTouched` **dentro da mesma onda**. Na onda 2, TASK-05 declarou
`packages/composition/src/compose-in-memory.ts` e TASK-06 não — mas o worker de TASK-06 precisou editar o mesmo arquivo
(adaptador do estorno). O gate não podia saber; o merge resolveu sozinho por sorte (regiões distintas).

**Conserto possível:** depois do worker, comparar os arquivos realmente alterados com a lista declarada e avisar o
orquestrador (é informação útil para o review, e o revisor já recebe o diff).

## 6. O que funcionou bem (não mexer)

- Rota por categoria: `execucao` → retry (TASK-06 voltou com achado real de interação com o webhook e o retry resolveu
  com RED por asserção); `analise` → bloqueado (TASK-03: a quebra estava errada, não a execução — economizou um retry).
- Uma tentativa = um arquivo de review (`-t1`, `-t2`) preservou o histórico da tarefa que voltou.
- Recusa de worktree suja no `prepare_review_package` e preservação de branch não mergeada no `remove_task_worktrees`.
- Brief reforçado ("o checkout principal não é seu território") zerou o vazamento para o checkout principal nas 8 tarefas.
