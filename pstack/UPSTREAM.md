# Upstream

- **Origem**: https://github.com/cursor/plugins/tree/main/pstack (plugin `pstack`, MIT)
- **Commit vendored**: `bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7` (branch `main`, 2026-11-16)
- **Versão do plugin** (`plugin.json`): `0.15.42`

Esta pasta é uma cópia do diretório `pstack/` do repo acima, feita com sparse
checkout e **sem** o `.git` (é conteúdo versionado do próprio dotfiles, não um
submodule — a intenção é modificar livremente).

As skills (`pstack/skills/*`) são expostas às ferramentas de agente via
symlinks em `skills/.agents/skills/` (ver `skills/README.md`).

Para sincronizar com o upstream:

```bash
./pstack/update.sh          # diff
./pstack/update.sh --apply  # sobrescreve com o upstream (atenção: perde edits locais)
```
