# ~/.bashrc — interactive bash configuration

# Only run in interactive shells
[[ $- != *i* ]] && return

# ── PATH ──────────────────────────────────────────────────────────────────────
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:$PATH"
export PATH="$HOME/.local/share/pi-node/current/bin:$PATH"

# ── Editor ────────────────────────────────────────────────────────────────────
export EDITOR="nvim"
export VISUAL="nvim"

# ── History ───────────────────────────────────────────────────────────────────
export HISTSIZE=100000
export HISTFILESIZE=100000
export HISTCONTROL="ignoreboth:erasedups"
export HISTTIMEFORMAT="%F %T  "
shopt -s histappend
PROMPT_COMMAND="history -a${PROMPT_COMMAND:+; $PROMPT_COMMAND}"

# ── Shell options ─────────────────────────────────────────────────────────────
shopt -s checkwinsize
shopt -s globstar
shopt -s autocd
shopt -s cdspell

# ── mise (runtime + tool manager) ────────────────────────────────────────────
if [[ -f "$HOME/.local/bin/mise" ]]; then
    eval "$("$HOME/.local/bin/mise" activate bash)"
elif command -v mise &>/dev/null; then
    eval "$(mise activate bash)"
fi

# ── Starship prompt ───────────────────────────────────────────────────────────
if command -v starship &>/dev/null; then
    eval "$(starship init bash)"
fi

# ── zoxide (smart cd) ─────────────────────────────────────────────────────────
if command -v zoxide &>/dev/null; then
    eval "$(zoxide init bash)"
fi

# ── atuin (shell history sync) ────────────────────────────────────────────────
if command -v atuin &>/dev/null; then
    eval "$(atuin init bash)"
fi

# ── fzf ──────────────────────────────────────────────────────────────────────
if command -v fzf &>/dev/null; then
    export FZF_DEFAULT_COMMAND="fd --type f --hidden --follow --exclude .git"
    export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
    export FZF_ALT_C_COMMAND="fd --type d --hidden --follow --exclude .git"
    export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --bind ctrl-y:accept"
    if [[ -f /usr/share/fzf/key-bindings.bash ]]; then
        source /usr/share/fzf/key-bindings.bash
    elif [[ -f /usr/share/doc/fzf/examples/key-bindings.bash ]]; then
        source /usr/share/doc/fzf/examples/key-bindings.bash
    fi
fi

# ── bat ───────────────────────────────────────────────────────────────────────
if command -v bat &>/dev/null; then
    export BAT_THEME="Catppuccin Mocha"
    export BAT_PAGER="less -RF"
    export MANPAGER="sh -c 'col -bx | bat -l man -p'"
fi

# ── Docker ────────────────────────────────────────────────────────────────────
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# ── Rust ─────────────────────────────────────────────────────────────────────
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

# ── Load aliases and functions ────────────────────────────────────────────────
# Resolve symlink to find dotfiles directory (Stow-compatible)
DOTFILES_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
[[ -f "$DOTFILES_DIR/.aliases" ]]   && source "$DOTFILES_DIR/.aliases"
[[ -f "$DOTFILES_DIR/.functions" ]] && source "$DOTFILES_DIR/.functions"
