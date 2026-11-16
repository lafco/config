# Upstream

- **Origem**: https://github.com/cursor/plugins/tree/main/pstack (plugin `pstack`, MIT)
- **Commit vendored**: `bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7` (branch `main`, commit de 2026-11-14, vendorado em 2026-11-16)
- **Versão do plugin** (`plugin.json`): `0.15.42`

Esta pasta é uma cópia do diretório `pstack/` do repo acima, feita com sparse
checkout e **sem** o `.git` (é conteúdo versionado do próprio dotfiles, não um
submodule — a intenção é modificar livremente).

As skills (`pstack/skills/*`) são expostas às ferramentas de agente via
symlinks em `skills/.agents/skills/` (ver `skills/README.md`).

## Divergência local: `poteto-mode` -> `ptm`

Não é cópia fiel. O upstream chama o skill de `poteto-mode`; este hub o renomeia
para `ptm` (comando `/ptm`), e o pstack inteiro cita o nome novo. O rename é:

- `skills/poteto-mode/` -> `skills/ptm/`
- `docs/guide/02-poteto-mode.md` -> `docs/guide/02-ptm.md`
- `poteto-mode` -> `ptm` em todo `.md`/`.json`/`.ts`, **exceto** `skills/ptm/scripts/`

`skills/ptm/scripts/package.json`, `bun.lock` e `bootstrap.ts` mantêm o nome antigo
de propósito: a chave de instalação das dependências é hash de `package.json` +
`bun.lock`, então renomear exigiria regenerar o lock.

`./pstack/update.sh` normaliza o clone do upstream antes de comparar ou aplicar.
Sem isso o diff acusaria o rename inteiro e o `--apply` copiaria `poteto-mode/`
de volta ao lado de `ptm/`, deixando duas versões do mesmo skill. Se o upstream
mudar esse layout, o script aborta com aviso em vez de aplicar em silêncio.

## Overrides locais: `local/`

Editar `skills/` direto não sobrevive a um `--apply` (o arquivo do upstream
sobrescreve). O que é local mora em `local/` e o `update.sh` o anexa à cópia
recém-clonada, então a cada apply o arquivo é reconstruído do upstream e o
override entra uma vez só:

```
local/ptm-hub.md   -> anexado ao fim de skills/ptm/SKILL.md
```

Para um override novo, crie o arquivo em `local/` e acrescente o `cat` no bloco
`OVERLAY` do script. Não edite `local/ptm-hub.md` esperando mudar o arquivo
sem rodar o script: o hub já tem a versão anexada, mas o próximo `--apply`
reconstrói a partir de `local/`.

O `local/ptm-hub.md` cobre as quatro skills citadas pelo `ptm` que não vêm no
pstack: `create-skill` (built-in do Cursor) e `deslop`, `control-cli`,
`control-ui` (plugin `cursor-team-kit`). Cada uma degrada numa linha de skip
mais o passo equivalente do harness. Também registra que princípios são skills
irmãs (`../principle-*/SKILL.md`), não um diretório `principles/`.

## Para sincronizar com o upstream

```bash
./pstack/update.sh          # diff contra o upstream já normalizado
./pstack/update.sh --apply  # sobrescreve com o upstream (atenção: perde edits locais)
```
