#!/bin/bash
# Compara a cópia vendored do pstack com o upstream (cursor/plugins).
#
# Uso:
#   ./pstack/update.sh          # só mostra o diff contra o upstream
#   ./pstack/update.sh --apply  # sobrescreve esta pasta com o upstream
#
# O upstream chama o skill de `poteto-mode`; este hub o renomeia para `ptm`.
# O clone do upstream é normalizado antes de comparar/aplicar (ver o bloco
# `normalize` e UPSTREAM.md), então o diff não vira ruído e o --apply não
# ressuscita `poteto-mode/` ao lado de `ptm/`.
#
# Atenção: --apply sobrescreve as modificações locais nos arquivos que o
# upstream também tem. Skills editadas vão conflitar no diff — o esperado.
# As skills de `skills/.agents/skills/` apontam para cá por symlink, então a
# atualização vale imediatamente para pi/zed.
set -euo pipefail

UPSTREAM="https://github.com/cursor/plugins"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SRC="$TMP/plugins/pstack"

git clone -q --depth 1 --filter=blob:none --sparse "$UPSTREAM" "$TMP/plugins"
git -C "$TMP/plugins" sparse-checkout set pstack

# Rename local: poteto-mode -> ptm. Mantém o clone igual ao hub, para o diff
# comparar conteúdo e não nome.
normalize() {
    local dir="$1"

    if [[ -d "$dir/skills/ptm" ]]; then
        : # upstream já adotou o nome ptm
    elif [[ -d "$dir/skills/poteto-mode" ]]; then
        mv "$dir/skills/poteto-mode" "$dir/skills/ptm"
    else
        echo "aviso: upstream sem skills/poteto-mode nem skills/ptm — layout mudou, revise o rename em update.sh" >&2
        return 1
    fi

    if [[ -f "$dir/docs/guide/02-ptm.md" ]]; then
        : # upstream já adotou o nome ptm
    elif [[ -f "$dir/docs/guide/02-poteto-mode.md" ]]; then
        mv "$dir/docs/guide/02-poteto-mode.md" "$dir/docs/guide/02-ptm.md"
    fi

    # scripts/ fica como no upstream: package.json, bun.lock e bootstrap.ts
    # carregam o nome antigo de propósito (a chave de instalação das deps é
    # hash de package.json + bun.lock).
    grep -rIlZ 'poteto-mode' "$dir" --exclude-dir=.git --exclude-dir=scripts \
        | xargs -0 -r sed -i 's/poteto-mode/ptm/g'
}

normalize "$SRC"

# Conteúdo local que precisa sobreviver ao --apply. O overlay é anexado a uma
# cópia recém-clonada, então não acumula: um --apply sempre reconstroi o
# arquivo do upstream e anexa uma vez. Ver UPSTREAM.md e local/.
OVERLAY="$HERE/local/ptm-hub.md"
if [[ -f "$OVERLAY" ]]; then
    printf '\n' >> "$SRC/skills/ptm/SKILL.md"
    cat "$OVERLAY" >> "$SRC/skills/ptm/SKILL.md"
fi

echo "upstream: $(git -C "$TMP/plugins" rev-parse HEAD) ($(git -C "$TMP/plugins" log -1 --format=%cs))"
echo

if [[ "${1:-}" == "--apply" ]]; then
    cp -a "$SRC/." "$HERE/"
    echo "aplicado em $HERE"
else
    diff -ru --exclude=.git --exclude=update.sh --exclude=UPSTREAM.md --exclude=local "$HERE" "$SRC" || true
fi
