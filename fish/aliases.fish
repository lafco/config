# Command replacement aliases

# eza (ls replacement) aliases
if type -q eza
    alias ls 'eza --color=auto --icons'
    alias ll 'eza -l --icons --git'
    alias la 'eza -la --icons --git'
    alias lt 'eza --tree --level=2 --icons'
    alias lta 'eza --tree --level=2 --icons -a'
else
    alias ls 'ls --color=auto'
    alias ll 'ls -lh'
    alias la 'ls -lAh'
end

# zoxide (cd replacement) aliases
if type -q zoxide
    alias cd 'z'
    alias cdi 'zi'  # Interactive selection
end

alias zj zellij

# bat (cat replacement) aliases
if type -q bat
    alias cat 'bat --style=auto'
    alias catp 'bat --style=plain'  # Plain output without decorations
end

# ripgrep aliases
if type -q rg
    alias grep 'rg'
end

# File and directory operations
alias mkcd 'function _mkcd; mkdir -p $argv[1]; and cd $argv[1]; end; _mkcd'
alias own 'sudo chown -R $USER:$USER'
alias ownp 'sudo chown -R $USER:$USER . && sudo chmod -R 755 .'

alias c 'docker compose'
