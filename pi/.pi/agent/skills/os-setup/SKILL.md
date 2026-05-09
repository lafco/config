---
name: os-setup
description: Interactive setup of a new Linux or WSL machine — installs tools, clones dotfiles, and configures the full development environment via GNU Stow. Use when the user asks to "setup", "configure", "instalar", "preparar ambiente", "new machine", "fresh install", "começar do zero", or mentions setting up a computer.
---

# OS Setup Skill

This skill turns Pi into a complete environment bootstrapper. With just Pi installed, the agent can set up an entire development machine interactively — no shell scripts to debug, no blog posts to follow.

## Philosophy

- **Pi is the only prerequisite.** Everything else is installed and configured by this skill.
- **Interactive, not automatic.** The user approves each step before it runs.
- **Idempotent.** Every step can be re-run safely.
- **Explains, doesn't just execute.** The user sees what will happen and why.

## Overview of what gets installed

| Layer | Tool | Purpose |
|---|---|---|
| System | `stow`, `git`, `curl`, `build-essential` | Package manager + dotfiles |
| System | JetBrains Mono Nerd Font | Terminal font |
| Version mgr | `mise` | Manages all dev tools |
| Shell | `starship`, `zoxide`, `television`, `bat`, `eza`, `fd`, `ripgrep`, `atuin` | Modern terminal experience |
| Editor | `neovim` | Editor configured via dotfiles |
| Terminal | `zellij`, `wezterm` (default) | Multiplexer + emulator |
| Git | `lazygit`, `jj`, `gh`, `gh-dash` | Git tooling |
| Runtimes | `node` (LTS), `python` (latest) | Dev runtimes |
| Config | `dotfiles` (via Stow) | bash, nvim, pi, wezterm, zellij, television, starship, mise |

## Step-by-step workflow

### Step 0: Detect platform

First, detect the OS. Run:

```bash
uname -a && cat /etc/os-release 2>/dev/null | head -5
```

Also check if running inside WSL:

```bash
grep -qi "microsoft\|wsl" /proc/version 2>/dev/null && echo "WSL: yes" || echo "WSL: no"
```

Show the user what was detected and ask: "Este é o ambiente correto? Continuar?"

### Step 1: System packages (apt)

**Only on Debian/Ubuntu/WSL.** Present the list to the user:

```bash
sudo apt update && sudo apt install -y stow git curl build-essential
```

Explain each package:
- `stow` — symlink farm manager (gerencia os dotfiles)
- `git` — version control
- `curl` — download tool
- `build-essential` — compilers for building tools (needed for cargo/television)

⚠️ **Ask the user before running sudo commands.** Say: "Vou instalar pacotes do sistema com apt. Posso executar?"

### Step 2: Install mise (version manager)

Mise manages all dev tools (like asdf but faster, written in Rust).

```bash
curl https://mise.run | sh
```

Then activate it for the current session:

```bash
eval "$($HOME/.local/bin/mise activate bash)"
```

Verify: `mise --version`

### Step 3: Clone dotfiles repo

Ask the user which repo URL to clone. Default: `https://github.com/lafco/dotfiles.git` (update to the actual repo URL after pushing).

```bash
git clone <repo-url> ~/dotfiles
```

If `~/dotfiles` already exists, offer to `git pull` instead.

### Step 4: Install all dev tools via mise

The dotfiles repo contains `mise/.config/mise/config.toml` with all tool definitions. Show the user the list and ask if they want to install everything or pick:

```bash
cd ~/dotfiles && mise install
```

This installs: neovim, starship, zellij, wezterm, lazygit, gh, ripgrep, fd, bat, eza, zoxide, television, atuin, node, python, btop, jj, gh-dash.

⚠️ This can take 5-10 minutes. Tell the user: "Isso pode demorar alguns minutos. Quer prosseguir?"

### Step 5: Install fonts

JetBrains Mono Nerd Font is needed for icons in neovim and starship.

**Linux/WSL:**
```bash
mkdir -p ~/.local/share/fonts
cd ~/.local/share/fonts
curl -fLO https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip
unzip -o JetBrainsMono.zip
rm JetBrainsMono.zip
fc-cache -fv
```

**Windows (WSL):** Also tell the user to install the font on Windows side (for Windows Terminal/WezTerm GUI). Link: https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip

### Step 6: Stow dotfiles

This creates all the symlinks. Show the user what will be linked:

```bash
cd ~/dotfiles
stow -n */   # dry-run first — show what would happen
```

Ask: "Os symlinks acima parecem corretos? Posso aplicar?"

Then run:

```bash
cd ~/dotfiles && stow */
```

If there are conflicts (files already exist), stow will refuse. Show the conflict and offer `stow --adopt` (takes over existing files) or manual resolution.

### Step 7: Post-install checks

Verify everything works:

```bash
nvim --version      # neovim
starship --version  # prompt
zellij --version    # multiplexer
mise --version      # version manager
mise ls             # all installed tools
ls -la ~/.bashrc    # should be symlink → ~/dotfiles/bash/.bashrc
ls -la ~/.config/nvim  # should be symlink → ~/dotfiles/nvim/.config/nvim
ls -la ~/.pi/agent/settings.json  # should be symlink
```

### Step 8: WezTerm as default terminal (WSL)

If running on WSL, guide the user to set WezTerm as the default terminal:

1. WezTerm is installed via mise and configured via Stow (`wezterm/.config/wezterm/`)
2. On Windows side, create a desktop shortcut for WezTerm (WSL):
   ```bash
   # In WSL terminal:
   wezterm start --class wezterm 2>/dev/null &
   ```
3. Tell the user: "Você pode fixar o WezTerm na barra de tarefas do Windows. O atalho `WezTerm (WSL)` já deve aparecer no menu Iniciar após a instalação."
4. Optional: Set WezTerm as the default terminal emulator in Windows Terminal settings, or replace Windows Terminal entirely with WezTerm.

### Step 9: Manual auth setup (inform the user)

These require user interaction and cannot be automated:

1. **GitHub auth:** `gh auth login`
2. **Atuin (shell history sync):** `atuin register` then `atuin sync`
3. **Pi auth:** Configure API keys for your AI providers
4. **Jira token:** Set `JIRA_API_TOKEN` in your shell (already configured if env vars are in .bashrc)

Tell the user: "Estes passos precisam ser feitos manualmente. Quer que eu explique cada um?"

## Important rules

1. **Always ask before running commands** — especially `sudo` and `curl | sh`
2. **Show dry-runs first** — use `stow -n` before `stow`
3. **Check for existing installations** — don't reinstall what's already there
4. **Explain what each step does** — the user should understand, not just trust
5. **Handle errors gracefully** — if a step fails, explain why and offer alternatives
6. **The skill is the documentation** — after setup, the skill lives in `~/.pi/agent/skills/os-setup/` (symlinked from dotfiles) so it stays available

## Quick start (what to tell users)

```bash
# 1. Install Pi (one-liner)
curl -fsSL https://pi.ai/install.sh | bash

# 2. Clone dotfiles
git clone git@github.com:lafco/dotfiles.git ~/dotfiles

# 3. Link the skill (so Pi reads it before stow runs)
mkdir -p ~/.pi/agent/skills
ln -s ~/dotfiles/pi/.pi/agent/skills/os-setup ~/.pi/agent/skills/os-setup

# 4. Start Pi
pi

# 5. Say:
"setup my machine"
```
