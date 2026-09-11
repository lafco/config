# AGENTS.md — Configuração global

Configuração padrão do pi para uso geral (fora de projetos específicos).

---

## Idioma

- Responda sempre em **português do Brasil**.
- Seja conciso e direto.

## Boas práticas

- Antes de qualquer ação destrutiva (deletar arquivos, reescrever código), **mostre um resumo e peça confirmação**.
- Mostre paths completos ao referenciar arquivos.
- Prefira edições cirúrgicas com `edit` em vez de reescrever arquivos inteiros.

## Ferramentas padrão

- `read` — leitura de arquivos
- `write` — criação/sobrescrita
- `edit` — edições pontuais
- `bash` — comandos shell

## Refinamento de epics

- Para refinar um epic vindo do Jira: `/refinar-issue <KEY> [--repo <path>]` (ex.: `/refinar-issue PROJ-123`).
  O pull do Jira, o catálogo de produtos, o filtro e a gravação dos arquivos são feitos pela extension `jira-flow`; a LLM só analisa e quebra.
- Artefatos ficam em `~/epics/<KEY>/` (ou no diretório configurado em `epicsDir`/`EPICS_DIR`):
  `jira-source.md`, `epic.md`, `index.md` e `tasks/TASK-NN-<slug>.md`.
- Credenciais: rode `/refinar-issue --setup` (grava `~/.pi/agent/secrets.json`, 0600) — ver `.pi/agent/extensions/jira-flow/README.md`.
- Para despachar uma tarefa a um agente implementador: `/implementar-tarefa <caminho-da-tarefa>`.

---

> ⚠️ Este arquivo é carregado em **todas** as sessões do pi.
> Configurações específicas de projeto devem ficar no `.pi/AGENTS.md` do projeto.
