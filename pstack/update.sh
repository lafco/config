#!/bin/bash
# Compara a cópia vendored do pstack com o upstream (cursor/plugins).
#
# Uso:
#   ./pstack/update.sh          # só mostra o diff contra o upstream
#   ./pstack/update.sh --apply  # sobrescreve esta pasta com o upstream
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

git clone -q --depth 1 --filter=blob:none --sparse "$UPSTREAM" "$TMP/plugins"
git -C "$TMP/plugins" sparse-checkout set pstack

echo "upstream: $(git -C "$TMP/plugins" rev-parse HEAD) ($(git -C "$TMP/plugins" log -1 --format=%cs))"
echo

if [[ "${1:-}" == "--apply" ]]; then
    cp -a "$TMP/plugins/pstack/." "$HERE/"
    echo "aplicado em $HERE"
else
    diff -ru --exclude=.git "$HERE" "$TMP/plugins/pstack" || true
fi
