---
description: Débito de conhecimento - gera uma explicação por ponto pedido de um projeto existente, mais um índice
argument-hint: "[--repo <path>] <ponto 1>; <ponto 2>; <ponto 3> ... (sem pontos: propõe uma lista)"
---
Objetivo: atacar débito de conhecimento de um projeto que **já existe**, ponto a ponto. Um ponto = um documento explicativo próprio, com quiz próprio, para você entender um pedaço antes de ir ao próximo.

Diferente do `/explain`, aqui **não há diff**. Cada documento é `explainer` no **modo B (área)**.

## Passo 0 — Triagem (você mesmo, sem subagente)

Isto é barato e evita queimar execuções em pontos que não existem.

- Fixe o repo (`git rev-parse --show-toplevel`) e o nome curto do projeto (basename, ou como o usuário o chama).
- Divida os pontos por `;` ou por linha. Para cada ponto:
  - **Localize no código** (`grep`/`glob`/`read`) os pontos de entrada e anote 2–5 caminhos concretos. É isso que o explainer vai receber no lugar de um diff.
  - Se o ponto **não existir** ou for ambíguo, não invente um escopo. Marque como não resolvido e diga ao usuário.
- **Dedupe** pontos que são o mesmo assunto com nomes diferentes.
- **Ordene por dependência**: o que precisa ser entendido antes vem antes. Numere `NN` (01, 02, ...).
- Para cada ponto, defina o slug kebab-case e o caminho exato de saída:
  `~/explanations/$(date +%F)-<projeto>-NN-<slug>.html`
- `mkdir -p ~/explanations`.

## Passo 1 — Um explainer por ponto, em paralelo

`subagent` no modo `parallel`, uma task por ponto, agente `explainer`.

Limites reais da tool: **máx. 8 tasks por chamada** e **4 rodando ao mesmo tempo**. Com mais de 8 pontos, faça **lotes** de 8 e espere cada lote antes do próximo.

Cada `task` precisa conter:

- **Repo/`cwd`**.
- **O ponto por extenso**, com número e título.
- **"MODO B (área): não há diff. Explique código existente."** — sem isso o explainer sai procurando uma mudança e produz um documento sobre nada.
- **O escopo da triagem**: os caminhos que você localizou, e o que ficou de fora.
- **O caminho exato de saída** (numerado).
- **A série**: nome da série, o índice, e os pré-requisitos deste ponto com os caminhos dos irmãos.
- pt-BR; não alterar o repositório; não delegar a subagentes.
- O formato de retorno padrão: `## Documento`, `## O que ele cobre`, `## Não verificado`.

## Passo 2 — Índice

Você escreve `~/explanations/$(date +%F)-<projeto>-index.html`: a porta de entrada da série.

- Os pontos na **ordem recomendada de leitura**, com o número, o título e o link para cada documento.
- Os **pré-requisitos** de cada ponto, explícitos.
- Um **checklist** por ponto, persistido em `localStorage`, para você marcar o que já entendeu. É o placar do débito de conhecimento; sem ele você perde a conta de onde parou.
- Mesmo estilo dos documentos: HTML autocontido, sem dependência externa, responsivo.
- Ponto que falhou aparece marcado como **não gerado**, com o motivo. Índice silenciosamente incompleto é pior que nenhum.

## Passo 3 — Reporte

Liste os caminhos gerados, o que ficou **não resolvido** na triagem, e por onde começar. Não cole o conteúdo dos documentos aqui: o entregável são os arquivos.

## Regras

- **Nunca dispare um explainer para um ponto que a triagem não localizou no código.** Ele vai produzir um documento confiante sobre nada — exatamente o dano que este fluxo existe para evitar.
- **Não encadeie os explainers numa `chain`.** `{previous}` só carrega o passo imediatamente anterior, o contexto cresce sem limite e cada documento precisa ser legível sozinho de qualquer forma. A ordem pedagógica vem do índice, não da chain.
- Se o usuário **não deu pontos**, não invente a lista silenciosamente: proponha 5–10 candidatos com base no que você vê (módulos maiores, maior acoplamento, arquivos que mais mudaram em `git log`, pontos de entrada), explique por que cada um, e **peça aprovação** antes de gerar. Quem está com débito de conhecimento normalmente não sabe nomear o que não sabe.
- Se o usuário pedir mais de 8 pontos, avise que vão sair em lotes e que isso é bem caro, antes de começar.
