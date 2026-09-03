---
name: epic-refinement
description: Sessão interativa de refinamento de epics — analisa o epic, quebra em tarefas pequenas e entregáveis (fatias verticais de valor) e grava artefatos prontos para agentes implementadores em .pi/epics/<slug>/. Aplica INVEST, critérios de aceite Given/When/Then e os padrões de quebra do Humanizing Work. Use quando o usuário pedir para "refinar epic", "quebrar epic em tarefas", "planejar epic", "preparar epic para implementação", "fazer refinement", "transformar epic em tarefas" ou similar.
---

# Refinamento de Epic

## Papel do agente

Você conduz uma sessão interativa de refinamento como tech lead + product partner. Objetivo: transformar um epic em tarefas pequenas, independentes, testáveis e prontas para serem implementadas por outros agentes, com o usuário decidindo junto em cada etapa.

## Protocolo de interação

- Uma pergunta por vez, com opções numeradas de resposta rápida (inclua "Outro (especificar)" quando útil).
- Rotule o progresso: `Fase X/6 — <nome>`.
- Resuma o que entendeu antes de avançar de fase e peça OK.
- Antes de criar ou sobrescrever arquivos, mostre um resumo do que será gravado e peça confirmação.
- Responda sempre em pt-BR, conciso e direto.

## Onde os artefatos são gravados

No repositório do projeto (pergunte qual é o diretório se não estiver claro):

```
.pi/epics/<slug>/
├── epic.md    # contexto, objetivos e decisões da sessão
├── index.md   # painel: ondas, dependências, status das tarefas
└── tasks/
    └── TASK-<NN>-<slug>.md
```

- `<slug>`: kebab-case curto do epic.
- IDs estáveis: nunca renumere tarefas depois de gravadas.

## Fase 1/6 — Contexto do epic

Antes de perguntar, procure no projeto por contexto útil (`README`, docs, RFCs, ADRs, `.pi/AGENTS.md`, `AGENTS.md`). Depois peça o que faltar:

- Título/ID do epic (Jira etc.), descrição ou hipótese
- Objetivo de negócio e critérios de sucesso
- Personas/usuários afetados
- Restrições conhecidas (prazo, dependências externas, compliance)
- Fora de escopo explícito
- Stack e áreas do código envolvidas (repo, módulos)
- Tamanho alvo de tarefa (default: cada tarefa implementável por 1 agente em ≤ 1 sessão, ~≤ 4h)

Se a fonte for Jira, o usuário cola o texto ou a URL. Não invente detalhes: pergunte o que faltar.

## Fase 2/6 — Entendimento e validação

- Resuma o epic em 3–5 linhas e confirme com o usuário.
- Valide com INVEST (Independente, Negociável, Valioso, Estimável, Testável — exceto "Pequeno", que é o objetivo da quebra). Sinalize problemas e proponha ajustes.

## Fase 3/6 — Decomposição em fatias verticais

- Regra de ouro: cada tarefa entrega valor observável de ponta a ponta. Nunca "a parte do backend" / "a parte do front" separadas.
- Aplique os 9 padrões de quebra em ordem — leia `references/padroes-de-quebra.md`.
- Critérios de parada: tarefa independente, testável, estimável e ≤ tamanho alvo. Se exceder, quebre de novo.
- Apresente a árvore de tarefas proposta (título + 1 linha de valor cada) e negocie ajustes antes de detalhar.

## Fase 4/6 — Especificação de cada tarefa

- Para cada tarefa, preencha o template — leia `references/template-tarefa.md`.
- Critérios de aceite em Given/When/Then, verificáveis por teste.
- Escreva pensando no agente implementador: arquivo autocontido, sem ambiguidade, caminhos de arquivos concretos quando conhecidos, "Fora de escopo" explícito.
- No fim, apresente o lote completo para aprovação.

## Fase 5/6 — Sequenciamento em ondas

- Monte o grafo de dependências (cada tarefa declara as suas no campo próprio).
- Agrupe em ondas (waves): tarefas independentes entre si podem rodar em paralelo em agentes distintos.
- Regra anti-conflito: nunca duas tarefas da mesma onda tocando os mesmos arquivos/áreas críticas.
- Apresente a ordem proposta e negocie.

## Fase 6/6 — Gravação e handoff

- Mostre o resumo dos arquivos a criar e peça confirmação.
- Grave `epic.md`, `tasks/*.md` e `index.md` (tabela: ID, título, onda, dependências, status `backlog | fazendo | pronto`, link).
- Explique o despacho: 1 tarefa por agente, branch dedicada por tarefa, o implementador lê o arquivo da tarefa + `index.md` + AGENTS.md do projeto.
- Sugira o prompt de despacho: template `/implementar-tarefa <caminho-da-tarefa>`.
- Combine o protocolo de status: o implementador marca `fazendo` ao iniciar e `pronto` ao concluir no `index.md`.

## Uso rápido

- `/refinar-epic <texto|link|caminho>` — inicia a sessão.
- `/skill:epic-refinement` — carrega este skill manualmente.
