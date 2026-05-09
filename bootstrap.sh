#!/bin/bash
# bootstrap.sh — clone dotfiles + activate os-setup skill
# Only does 2 things: git clone + ln -s. No system changes.
set -e

DOTFILES_DIR="${HOME}/dotfiles"
REPO_URL="https://github.com/lafco/dotfiles.git"

echo "→ Clonando dotfiles..."
if [ -d "$DOTFILES_DIR" ]; then
    echo "   (já existe, atualizando...)"
    git -C "$DOTFILES_DIR" pull
else
    git clone "$REPO_URL" "$DOTFILES_DIR"
fi

echo "→ Ativando skill os-setup..."
mkdir -p ~/.pi/agent/skills
ln -sf "$DOTFILES_DIR/pi/.pi/agent/skills/os-setup" ~/.pi/agent/skills/os-setup

echo ""
echo "✅ Pronto! Agora abra o Pi:"
echo ""
echo "   pi"
echo ""
echo "   E diga: setup my machine"
