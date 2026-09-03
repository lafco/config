#!/bin/bash
# bootstrap.sh — one-liner de instalação dos dotfiles
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/lafco/config/main/bootstrap.sh | bash
# Só faz 2 coisas: clona/atualiza o repo e roda `dot init`. O resto é com o CLI.
set -e

DOTFILES_DIR="${HOME}/dotfiles"
REPO_URL="https://github.com/lafco/config.git"

echo "→ Preparando dotfiles..."
if [ -d "$DOTFILES_DIR/.git" ]; then
    echo "   (já existe, atualizando...)"
    git -C "$DOTFILES_DIR" pull --ff-only
else
    git clone "$REPO_URL" "$DOTFILES_DIR"
fi

chmod +x "$DOTFILES_DIR/dot"

echo "→ Executando dot init..."
exec "$DOTFILES_DIR/dot" init "$@"
