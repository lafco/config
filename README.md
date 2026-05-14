# dotfiles

> ⚡ **Para funcionar, só precisa instalar o Pi primeiro.**

## Instalação rápida (recomendada)

1. **Instale o Pi** (requer bash, curl e git)

```bash
curl -fsSL https://get.pi.dev/install.sh | bash
```

2. **Clone o repo e ative a skill**

```bash
curl -fsSL https://raw.githubusercontent.com/lafco/config/main/bootstrap.sh | bash
```

> Se der erro de permissão ou comando não encontrado, reinicie o terminal e tente de novo.

3. **Abra o Pi e rode o setup interativo**

```bash
pi
# No prompt do Pi:
> setup my machine
```

🟢 O Pi vai detectar seu SO (Linux/WSL), instalar só o que você aceitar e mostrar cada passo antes de executar!

---

## Se o script não funcionar:

- **Confirme se o Pi está no PATH:**
  ```bash
  which pi
  ```
  Se não encontrar, feche/abra o terminal, ou rode o instalador do Pi novamente.

- **Clone manualmente e aponte a skill:**
  ```bash
  git clone https://github.com/lafco/config.git ~/dotfiles
  mkdir -p ~/.pi/agent/skills
  ln -sf ~/dotfiles/pi/.pi/agent/skills/os-setup ~/.pi/agent/skills/os-setup
  ```
- Depois, siga pro passo "pi" acima normalmente.

---

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

O Pi só instala o que você confirmar — pode pular ferramentas que não quiser.

---

## Pós-instalação manual

Alguns passos precisam ser feitos manualmente (por segurança/credenciais):

```bash
gh auth login           # autenticar no GitHub
gh copilot auth         # autenticar Copilot (opencode)
atuin register          # criar conta no Atuin (sync de histórico)
atuin sync              # sincronizar histórico
```

---

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

|                           | Script tradicional      | **Stow + Pi skill**       |
|---------------------------|------------------------|---------------------------|
| Pré-requisito             | bash, git, curl, etc   | **Só Pi**                |
| Instalação                | Script monolítico      | Pi interativo, passo a passo|
| Erro em 1 passo           | Para tudo              | Alternativas + explicação |
| Symlinks                  | Lógica própria         | `stow */` (Unix padrão)   |
| Dry-run                   | Quase nunca tem        | `stow -n */`              |
| Desfazer                  | Manual                 | `stow -D nome/`           |
| Adicionar config          | Editar script          | Adiciona pasta + stow     |
| Documentação              | README estático        | Pi explica enquanto faz   |
