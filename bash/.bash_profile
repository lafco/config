# ~/.bash_profile — login shell entry point
# Sources ~/.bashrc so interactive and login shells behave identically.

[[ -f ~/.bashrc ]] && source ~/.bashrc

# Vite+ bin (https://viteplus.dev) — só existe onde o CLI `vp` foi instalado
# (~/.config/vite-plus/env). O caminho era absoluto da máquina da empresa e
# quebrava todo shell de login nas outras.
[ -f "$HOME/.config/vite-plus/env" ] && . "$HOME/.config/vite-plus/env"
