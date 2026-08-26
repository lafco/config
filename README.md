## Instalação
1. **Git**
```bash
https://git-scm.com/install/linux
```
2. **Instale o Pi** (requer bash, curl e git)
```bash
curl -fsSL https://pi.dev/install.sh | sh
```
3. **Clone o repo e ative a skill**
```bash
curl -fsSL https://raw.githubusercontent.com/lafco/config/main/bootstrap.sh | bash
```
4. **Abra o Pi e rode o setup interativo**
```bash
pi
# No prompt do Pi:
> setup my machine
```
---
## Pós-instalação manual
Alguns passos precisam ser feitos manualmente (por segurança/credenciais):
```bash
gh auth login           # autenticar no GitHub
gh copilot auth         # autenticar Copilot
atuin register          # criar conta no Atuin (sync de histórico)
atuin sync              # sincronizar histórico
```
## O que o Pi instala
| Categoria     | Ferramenta                                             | Como         |
|--------------|--------------------------------------------------------|--------------|
| Sistema      | stow, git, curl, build-essential, bash-completion      | apt          |
| Fontes       | JetBrains Mono Nerd Font                               | curl         |
| Version mgr  | mise                                                   | curl (mise)  |
| Shell        | starship, zoxide, television, bat, eza, fd, rg, atuin  | mise         |
| Editor       | neovim (LazyVim)                                       | mise         |
| Terminal     | zellij, wezterm (default)                              | mise         |
| Git          | lazygit, jj, gh, gh-dash                               | mise         |
| Runtimes     | node (LTS), python (latest)                            | mise         |
| Configs      | bash, nvim, pi, wezterm, zellij, television, etc       | stow         |

## Estrutura (GNU Stow)
Cada pasta é um "pacote". `stow nome/` cria symlinks de `~/dotfiles/nome/` pra `~/`.
```
~/dotfiles/
├── bash/         → ~/.bashrc, ~/.aliases, ~/.functions, ~/.bash_profile
├── nvim/         → ~/.config/nvim/           (LazyVim + plugins)
├── pi/           → ~/.pi/agent/              (settings, extensions, skills)
├── wezterm/      → ~/.config/wezterm/        (terminal emulator)
├── zellij/       → ~/.config/zellij/         (terminal multiplexer)
├── television/   → ~/.config/television/     (fuzzy finder)
├── starship/     → ~/.config/starship.toml   (prompt)
└── mise/         → ~/.config/mise/config.toml (dev tools)
```
---
## Comandos Stow (dia a dia)
```bash
cd ~/dotfiles
# Ver o que mudaria (dry-run, recomendado)
stow -n */
# Aplicar todos os pacotes
stow */
# Aplicar só um pacote
stow nvim
# Remover symlinks de um pacote
stow -D nvim
# Re-aplicar após editar arquivos no repo
stow -R nvim
# Se houver conflito (arquivo já existe), tomar posse:
stow --adopt nvim    # move o arquivo existente para dentro do repo
```
## Atualizar depois de um `git pull`
```bash
cd ~/dotfiles
git pull
stow -R */     # re-stow tudo (atualiza symlinks, ignora o que não mudou)
```
## Adicionar um config novo
```bash
cd ~/dotfiles
# Criar estrutura espelhando $HOME
mkdir -p meu-novo-app/.config/meu-novo-app
echo "config..." > meu-novo-app/.config/meu-novo-app/config.yaml
# Aplicar
stow meu-novo-app
# Commitar
git add meu-novo-app && git commit -m "add meu-novo-app config"
```

---

## NixOS (máquina declarativa)

A pasta [`nixos/`](nixos/README.md) tem a configuração NixOS completa da máquina
**hmpc** (flakes + home-manager + devenv), que substitui o fluxo mise+Stow nesta
máquina. Veja [`nixos/README.md`](nixos/README.md) para instalação, dia a dia e
templates de dev env.

> ⚠️ `nixos/` **não** é um pacote Stow — o `.stow-local-ignore` na raiz impede
> que `stow */` tente linká-lo.
