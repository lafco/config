# Fluxo selecionado: Story

A issue é uma **Story**. Sua entrega é a `story` (o registro do que foi refinado) + as **tarefas implementáveis por agentes** (`tasks`). A tool é `emit_story_artifacts` — não use `emit_epic_artifacts`.

Não trate a issue como Epic nem invente filhos no Jira. Entenda o valor esperado, valide os critérios de aceite e quebre **somente o trabalho necessário** para implementar a história.

## Regra central

O default continua sendo a **fatia mínima completa** (1 tarefa). Cada tarefa adicional exige justificativa de tamanho (> 16h), dependência real ou entrega independente — ver `quebra-padroes.md`.

Cada tarefa é autocontida: um agente a implementa sozinho, em uma sessão, numa worktree própria.

## Contrato de cada tarefa (execução por agentes)

Além dos campos usuais (`id`, `title`, `wave`, `dependsOn`, `objective`, `valorObservavel`, `acceptanceCriteria`, `type`, `estimate`), toda tarefa de código declara:

| Campo | O que é |
|---|---|
| `repo` | Caminho do repositório onde a tarefa será implementada. |
| `branch` | Branch sugerida (ex.: `feat/PROJ-123-task-01`). |
| `filesLikelyTouched` | Arquivos/áreas prováveis. **Gate:** duas tarefas da mesma onda não podem compartilhar arquivo. |
| `validation` | Como provar que funcionou (ver abaixo). |
| `test` | Como a tarefa trata o teste — `tdd`, `verify-only` ou `none` (ver abaixo). |
| `kind` | `correção` para tarefa de código; `diagnóstico`/`exploração` só em fluxos de investigação. |

## Validação (`validation`)

```jsonc
{
  "kind": "pw2",              // "pw2" | "unit-tests" | "manual"
  "environment": "local",     // ambiente do PW2; fora de "local" exige company
  "company": "a408453",       // local: sempre a408453 (convenção do harness)
  "register": "236",           // matrícula padrão dos testes locais
  "steps": ["POST /periods/import com company=a408453 e matrícula 236"],
  "expected": "o período importado resulta em 15 dias com o flag ativo"
}
```

- **`pw2`** — o agente implementador executa o endpoint com `pw2_request` e compara com `expected`. Testes **locais** usam sempre a empresa `a408453` e, por padrão, a matrícula `236` (convenção injetada pelo harness no fim da mensagem). Fora de `local`, o harness só roda sem humano quando a `company` está em `autoRunCompanies`; se não estiver, o refinamento avisa e você deve tratar como `manual`.
- **`unit-tests`** — a tarefa indica os testes a rodar; `expected` descreve o resultado verde.
- **`manual`** — exige um humano no TUI. Use para mutações (POST/PUT/PATCH/DELETE) e para o que depender de dado que o agente não pode preparar. `expected` descreve o que a pessoa deve observar.

Escolha o tipo mais forte que o agente consegue executar sozinho; não declare `pw2` para algo que exigirá humano (vira falso negativo na onda).

## Contrato de teste (`test`)

`tdd` é o padrão: a tarefa nasce com **arquivo de teste**, o comando que deve **falhar antes** (RED) e o que deve **passar depois** (GREEN). A evidência carrega os dois — sem o vermelho registrado, um teste que passa de primeira não prova nada.

```jsonc
{
  "strategy": "tdd",                                  // "tdd" | "verify-only" | "none"
  "file": "tests/periods-import.test.ts",
  "redCommand": "bun test tests/periods-import.test.ts",
  "greenCommand": "bun test tests/periods-import.test.ts"
}
```

- **`verify-only`** — o teste já existe no repo; a tarefa só o executa e reporta o resultado. Exige `why`.
- **`none`** — não há teste (dado de produção, validação só manual, texto). Exige `why`.

`test` e `validation` são ortogonais: `test.strategy` diz **como o trabalho é feito**; `validation.kind` diz **como o resultado é provado**. Tarefa cujo único caminho de prova é `pw2` manual declara `verify-only`/`none` com a justificativa — não `tdd` com um teste de mentira.

## Definition of ready

O harness **recusa a emissão** quando uma tarefa de código do fluxo Story não declara:

- `test.strategy` — com `file`/`redCommand`/`greenCommand` em `tdd`, ou `why` em `verify-only`/`none`;
- `repo`;
- `filesLikelyTouched` — sem isso o gate anti-conflito da onda não tem o que comparar.

## Ondas e paralelismo

- Tarefas independentes entre si ficam na **mesma onda** e são despachadas em paralelo.
- Tarefas da mesma onda **não podem** compartilhar `filesLikelyTouched` (o harness rejeita) — se compartilham, separe em ondas diferentes ou junte as tarefas.
- Toda tarefa da onda deve ter `repo` + `filesLikelyTouched` preenchidos; sem isso o paralelismo é incerto e o harness avisa.
- `Associado [CLIENTE]` não altera código: fica na mesma onda da correção que ele comunica.

## Vocabulário do time

Use as categorias do Jira: `Codificação`, `Defeito`, `Execução de TU`, `Merge`, `Associado [CLIENTE]`, `Spike`. Não abra tarefa para etapa interna que caiba no mesmo commit.
