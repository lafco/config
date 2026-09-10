# todo

Extensão do pi que dá ao agente uma lista de tarefas visível: uma tool `todo`,
o comando `/todos` e um painel persistente acima do editor.

Substitui `@juicesharp/rpiv-todo` sem depender de nenhum pacote npm externo —
só do runtime do próprio pi (`@earendil-works/*` e `typebox`, resolvidos pelo
loader de extensões).

## Como funciona

- **Tool `todo`** — ações `create`, `update`, `list`, `get`, `delete`, `clear`.
  Status: `pending → in_progress → completed`, mais `deleted` (tombstone).
  Suporta `activeForm`, `owner`, `metadata` e dependências via `blockedBy`
  (`addBlockedBy` / `removeBlockedBy`, com detecção de ciclo).
- **`/todos`** — mostra a lista agrupada por status.
- **Painel** — widget acima do editor com `Tarefas (feitas/total)`, glyphs,
  `activeForm`, dependências e resumo de overflow (`+N mais`). Esconde tarefas
  concluídas a partir do turno seguinte e some quando a lista esvazia.
- **Persistência** — o estado é reconstruído a partir do último snapshot `todo`
  da branch da conversa. Sobrevive a `/reload` e compactação; nada é gravado em
  disco. O estado é particionado por sessão.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `index.ts` | Registro da tool, do comando, do atalho e dos eventos de sessão |
| `config.ts` | Leitura da config (sem dependências) |
| `state.ts` | Tipos, schema, reducer puro, grafo de dependências e seletores |
| `store.ts` | Estado por sessão + replay do branch |
| `render.ts` | Sanitização, labels pt-BR, formatação e envelope da tool |
| `overlay.ts` | Widget acima do editor |

## Configuração

Opcional. Crie `~/.config/pi-todo/config.json` (ou
`$XDG_CONFIG_HOME/pi-todo/config.json`):

```json
{
  "maxWidgetLines": 12,
  "collapseKey": "ctrl+shift+t",
  "guidance": {
    "promptSnippet": "...",
    "promptGuidelines": ["..."]
  }
}
```

| Campo | Efeito | Padrão |
| --- | --- | --- |
| `maxWidgetLines` | Linhas de conteúdo do painel, heading incluso. Mínimo `3`. | `12` |
| `collapseKey` | Atalho de colapsar/expandir (formato do pi: `alt+o`, `ctrl+shift+t`). Use `"off"` para desabilitar. Precisa de `/reload` para re-vincular. | `"ctrl+shift+t"` |
| `guidance` | Substitui as instruções dadas ao modelo sobre como usar a lista. | _(embutidas)_ |

Arquivo ausente ou inválido cai nos padrões. A extensão só lê esse arquivo.

## Instalação

A extensão é descoberta automaticamente por estar em
`~/.pi/agent/extensions/todo/index.ts`. Não requer `pi install`.
