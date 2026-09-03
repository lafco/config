# dotfiles

Dotfiles pessoais gerenciados por [GNU Stow](https://www.gnu.org/software/stow/) + um
CLI de instalação próprio (`dot`), inspirado no [dmmulroy/.dotfiles](https://github.com/dmmulroy/.dotfiles).
Funciona em qualquer Linux: Arch (pacman), Debian/Ubuntu (apt) e Fedora (dnf), incluindo WSL.

## Instalação (máquina nova)

Requisito: `bash`, `curl` e `git`.

```bash
# One-liner — clona o repo e roda a instalação completa
curl -fsSL https://raw.githubusercontent.com/lafco/config/main/bootstrap.sh | bash

# Ou manualmente:
git clone https://github.com/lafco/config.git ~/dotfiles
~/dotfiles/dot init
```

O `dot init` detecta a distro e instala:

| Etapa | O quê |
|---|---|
| Sistema | stow, git, curl, compiladores, bash-completion, fontconfig, jq, clipboard |
| Ferramentas | rg, fd, bat, eza, zoxide, fzf, tv, starship, atuin, btop, direnv, nushell |
| Git | lazygit, jj, gh, gh-dash, diffnav |
| Editor | neovim (release oficial) |
| Terminal | zellij, herdr, wezterm (AppImage no apt/dnf; app do Windows no WSL) |
| Runtimes | node, python, rust (rustup) |
| Fontes | JetBrains Mono Nerd Font |
| Configs | stow de todos os pacotes + `dot` linkado em `~/.local/bin` |

Cada ferramenta é instalada pelo repositório nativo quando existe; senão, baixa o
binário oficial (GitHub release) para `~/.local/bin`. Falhas não interrompem a
instalação — ficam em `packages/failed_tools.txt` e podem ser retentadas depois.

### Pós-instalação manual (credenciais/interação)

```bash
git config --global user.name  "Seu Nome"
git config --global user.email "seu@email.com"
gh auth login              # GitHub CLI
atuin register && atuin sync   # histórico sincronizado (precisa de terminal interativo)
pi                          # autenticar provedores de IA
```

## Comandos do CLI

```bash
dot init                  # instalação completa (idempotente — pode rodar de novo)
dot init --skip-font      # sem as fontes
dot init --only nvim      # instala só uma ferramenta
dot update                # git pull + re-stow
dot doctor                # diagnóstico do ambiente
dot stow                  # (re)aplica symlinks
dot stow -n               # dry-run
dot retry-failed          # reinstala ferramentas que falharam
dot link | dot unlink     # instala/remove o comando em ~/.local/bin
dot edit                  # abre os dotfiles no $EDITOR
dot help                  # ajuda
```

## Estrutura (GNU Stow)

Cada pasta é um "pacote". `dot stow` cria symlinks de `~/dotfiles/<pasta>/` para `~/`.

```
~/dotfiles/
├── dot              # CLI de instalação/manutenção
├── bootstrap.sh     # one-liner: clona + dot init
├── bash/            # .bashrc, .bash_profile, .aliases, .functions
├── nvim/            # ~/.config/nvim/ (LazyVim)
├── pi/              # ~/.pi/agent/ (settings, extensions, skills)
├── wezterm/         # ~/.config/wezterm/ (terminal)
├── zellij/          # ~/.config/zellij/ (multiplexer)
├── herdr/           # ~/.config/herdr/ (AI workspace manager)
├── television/      # ~/.config/television/ (fuzzy finder)
├── starship/        # ~/.config/starship.toml (prompt)
├── atuin/           # ~/.config/atuin/config.toml (histórico)
├── gh-dash/         # ~/.config/gh-dash/config.yml (dashboard GitHub)
└── packages/        # failed_tools.txt (runtime, não versionado)
```

## Dia a dia

```bash
# Depois de editar configs no repo:
cd ~/dotfiles
dot stow -n     # dry-run
dot stow        # aplica

# Depois de atualizar:
dot update      # git pull + re-stow

# Adicionar um config novo:
mkdir -p ~/dotfiles/meu-app/.config/meu-app
echo "..." > ~/dotfiles/meu-app/.config/meu-app/config.yaml
# 1. adicione "meu-app" à lista STOW_PACKAGES no script `dot`
# 2. dot stow meu-app
```

## Adicionar/remover ferramenta

A lista de ferramentas fica na tabela `TOOLS` dentro do script `dot`:

```
"nome | binário | pacote-pacman | pacote-apt | pacote-dnf | kind"
```

`kind` aceita: `native`, `native+ghrelease:<repo>`, `native+script:<id>`,
`native+pkgfile:<repo>`, `native+appimage:<repo>`, `ghrelease:<repo>`, `rustup`.
Ferramentas que só existem como binário de GitHub release funcionam em qualquer
distro sem esforço extra.
