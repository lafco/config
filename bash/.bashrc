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

# ── WSL: WezTerm (Windows GUI) ──────────────────────────────────────────────
[[ -x /mnt/c/WezTerm/wezterm.exe ]] && alias wezterm="/mnt/c/WezTerm/wezterm.exe"

# ── Shell options ─────────────────────────────────────────────────────────────
shopt -s checkwinsize
shopt -s globstar
shopt -s autocd
shopt -s cdspell

# ── Bash completion ──────────────────────────────────────────────────────────
# System-wide completions (git, docker, ssh, etc.)
if [[ -f /usr/share/bash-completion/bash_completion ]]; then
    source /usr/share/bash-completion/bash_completion
elif [[ -f /etc/bash_completion ]]; then
    source /etc/bash_completion
fi

# Tool-specific completions not covered by bash-completion package
if command -v gh &>/dev/null; then
    eval "$(gh completion -s bash)"
fi
if command -v zellij &>/dev/null; then
    eval "$(zellij setup --generate-completion bash 2>/dev/null || true)"
fi

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
    eval "$(zoxide init bash --cmd cd)"
fi

# ── atuin (shell history sync) ────────────────────────────────────────────────
if command -v atuin &>/dev/null; then
    eval "$(atuin init bash)"
fi

# ── television (fuzzy finder) ────────────────────────────────────────────────
if command -v tv &>/dev/null; then
    eval "$(tv init bash)"
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

# Inclui aliases pessoais fora do repositório de dotfiles
[ -f ~/aliases.bash ] && source ~/aliases.bash
[ -f ~/.bash_aliases ] && source ~/.bash_aliases

# ── Secrets (tokens, credenciais) — NUNCA versionar ───────────────────────────
[ -f ~/.secrets ] && source ~/.secrets


