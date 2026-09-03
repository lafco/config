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

- Para planejar/quebrar epics em tarefas: use `/refinar-epic [texto|link|caminho]` (skill `epic-refinement`).
- Artefatos ficam em `.pi/epics/<slug>/` do projeto (`epic.md`, `index.md`, `tasks/`).
- Para despachar uma tarefa a um agente implementador: `/implementar-tarefa <caminho-da-tarefa>`.

---

> ⚠️ Este arquivo é carregado em **todas** as sessões do pi.
> Configurações específicas de projeto devem ficar no `.pi/AGENTS.md` do projeto.
