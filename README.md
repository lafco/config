# dotfiles

> ⚡ **Só precisa do Pi.** O bootstrap não instala nada — só clona o repo e ativa a skill.

```bash
# 1. Instalar o Pi
curl -fsSL https://pi.ai/install.sh | bash

# 2. Bootstrap (clona + ativa a skill)
curl -fsSL https://raw.githubusercontent.com/lafco/dotfiles/main/bootstrap.sh | bash

# 3. Abrir o Pi e pedir
pi
> setup my machine
```

> 💡 Quer ver o que o bootstrap faz? São só 3 comandos: [`bootstrap.sh`](bootstrap.sh)

O Pi vai detectar teu SO (Linux ou WSL), mostrar cada passo e **pedir confirmação antes de qualquer mudança** — nada roda sem você aprovar.

---

## O que o Pi instala

| Categoria | Ferramenta | Como |
|---|---|---|
| Sistema | `stow`, `git`, `curl`, `build-essential`, `bash-completion` | apt |
| Fontes | JetBrains Mono Nerd Font | curl |
| Version mgr | `mise` | curl (mise.run) |
| Shell | starship, zoxide, television, bat, eza, fd, ripgrep, atuin | mise |
| Editor | neovim (LazyVim) | mise |
| Terminal | zellij, wezterm (default) | mise |
| Git | lazygit, jj, gh, gh-dash | mise |
| Runtimes | node (LTS), python (latest) | mise |
| Configs | bash, nvim, pi, wezterm, zellij, television, starship, mise | stow |

O Pi só instala o que você confirmar — pode pular ferramentas que não quiser.

---

## Pós-instalação manual

Coisas que o Pi não pode fazer por você (exigem navegador/interação):

```bash
gh auth login           # autenticar no GitHub
gh copilot auth         # autenticar Copilot (opencode)
atuin register          # criar conta no Atuin (sync de histórico)
atuin sync              # sincronizar histórico
```

---

## Estrutura (GNU Stow)

Cada pasta é um "pacote". `stow nome/` cria symlinks de `~/dotfiles/nome/` para `~/`.

```
~/dotfiles/
├── bash/         → ~/.bashrc, ~/.aliases, ~/.functions, ~/.bash_profile
├── nvim/         → ~/.config/nvim/           (LazyVim + plugins)
├── pi/           → ~/.pi/agent/              (settings, extensions, skills)
├── wezterm/      → ~/.config/wezterm/        (terminal emulator)
├── zellij/       → ~/.config/zellij/         (terminal multiplexer)
├── television/   → ~/.config/television/      (fuzzy finder)
├── starship/     → ~/.config/starship.toml   (prompt)
└── mise/         → ~/.config/mise/config.toml (dev tools)
```

---

## Comandos Stow (dia a dia)

```bash
cd ~/dotfiles

# Ver o que mudaria (dry-run — recomendado antes de qualquer ação)
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
stow --adopt nvim    # move o arquivo existente pra dentro do repo
```

---

## Atualizar depois de um `git pull`

```bash
cd ~/dotfiles
git pull
stow -R */     # re-stow tudo (atualiza symlinks, ignora o que não mudou)
```

---

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

## Por que Stow + Pi?

| | Script tradicional | **Stow + Pi skill** |
|---|---|---|
| Pré-requisito | bash, git, curl, etc | **Só Pi** |
| Instalação | Script monolítico, difícil de debugar | Pi interativo, passo a passo |
| Erro em 1 passo | Para tudo, difícil de retomar | Pi explica e oferece alternativas |
| Symlinks | Lógica customizada pra cada OS | `stow */` (comando padrão Unix) |
| Dry-run | Não tem | `stow -n */` |
| Desfazer | Manual | `stow -D nome/` |
| Adicionar config | Editar script | Criar pasta + `stow nome/` |
| Documentação | README estático | **Skill viva** — o Pi explica enquanto faz |
