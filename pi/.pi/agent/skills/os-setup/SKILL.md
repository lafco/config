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
| System | `stow`, `git`, `curl`, compilers | Package manager + dotfiles |
| System | JetBrains Mono Nerd Font | Terminal font |
| System | `fontconfig` (Linux only) | Font cache management |
| Version mgr | `mise` | Manages all dev tools |
| Shell | `starship`, `zoxide`, `television`, `bat`, `eza`, `fd`, `ripgrep`, `atuin` | Modern terminal experience |
| Editor | `neovim` | Editor configured via dotfiles |
| Terminal | `herdr`, `zellij`, `wezterm` (default) | Multiplexer + AI workspace manager + emulator |
| Git | `lazygit`, `jj`, `gh`, `gh-dash` | Git tooling |
| Runtimes | `node` (LTS), `python` (latest), `rust` | Dev runtimes |
| Config | `dotfiles` (via Stow) | bash, nvim, pi, wezterm, zellij, herdr, television, starship, mise |

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

### Step 1: System packages

Detect the package manager from Step 0 and adapt:

**Debian/Ubuntu:**
```bash
sudo apt update && sudo apt install -y stow git curl build-essential bash-completion fontconfig
```

**Fedora/RHEL:**
```bash
sudo dnf install -y stow git curl make gcc gcc-c++ bash-completion fontconfig cpio
```

**Arch:**
```bash
sudo pacman -S --noconfirm stow git curl base-devel bash-completion fontconfig
```

Explain each package:
- `stow` — symlink farm manager (gerencia os dotfiles)
- `git` — version control
- `curl` — download tool
- `build-essential` / `make gcc gcc-c++` / `base-devel` — compilers for building tools (needed for `cargo:television` which builds from source)
- `bash-completion` — autocompletion for git, docker, ssh, etc.
- `fontconfig` — font cache manager (needed for `fc-cache` after font install)
- `cpio` — archive extractor (Fedora: needed to extract WezTerm RPM if applicable)
- `xsel` ou `xclip` (Linux) — clipboard integration (herdr copy-on-select)

⚠️ **Ask the user before running sudo commands.** Say: "Vou instalar pacotes do sistema. Posso executar?"

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

Ask the user which repo URL to clone. Default: `https://github.com/lafco/config.git`.

```bash
git clone <repo-url> ~/dotfiles
```

If `~/dotfiles` already exists, offer to `git pull` instead.

### Step 4: Install all dev tools via mise

The dotfiles repo contains `mise/.config/mise/config.toml` with all tool definitions.

⚠️ **CRITICAL**: At this point the dotfiles are NOT stowed yet, so mise won't find
`~/.config/mise/config.toml`. Use `MISE_CONFIG_FILE` to point to the config directly:

```bash
eval "$($HOME/.local/bin/mise activate bash)"
MISE_CONFIG_FILE=~/dotfiles/mise/.config/mise/config.toml mise install
```

This installs: neovim, starship, zellij, wezterm, lazygit, gh, ripgrep, fd, bat, eza, zoxide, television, atuin, node, python, btop, jj, gh-dash, rust.

⚠️ This can take 5-10 minutes (television compiles from source). Tell the user: "Isso pode demorar alguns minutos. Quer prosseguir?"

**If `cargo:television` fails** because cargo/rust is not found, install rust first:
```bash
MISE_CONFIG_FILE=~/dotfiles/mise/.config/mise/config.toml mise install rust
```
Then retry the full install.

**If GitHub rate limit errors occur** (403 Forbidden), retry failed tools after ~1 minute,
or suggest the user set `GITHUB_TOKEN` env var. Most tools succeed on first pass;
retry the ones that failed:
```bash
MISE_CONFIG_FILE=~/dotfiles/mise/.config/mise/config.toml mise install btop "github:wez/wezterm"
```

### Step 5: Install herdr (AI workspace manager)

Herdr is not in the mise registry — it has its own installer and updater.

```bash
curl -fsSL https://herdr.dev/install.sh | bash
```

Verify:
```bash
herdr --version
```

⚠️ Herdr manages its own updates via `herdr update`. Mise does NOT track it.
The config is already stowed at `~/.config/herdr/config.toml` after Step 7.

### Step 6: Install fonts

JetBrains Mono Nerd Font is needed for icons in neovim and starship.

**Linux/WSL:**
```bash
mkdir -p ~/.local/share/fonts
cd ~/.local/share/fonts
curl -fLO https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip
unzip -o JetBrainsMono.zip
rm JetBrainsMono.zip
fc-cache -fv 2>/dev/null || true  # fontconfig may not be installed yet; non-fatal
```

`fc-cache` may fail if `fontconfig` wasn't installed — it's a warning, not a blocker. The fonts are
already in place. Install `fontconfig` via system packages if needed.

**Windows (WSL):** Also tell the user to install the font on Windows side (for Windows Terminal/WezTerm GUI). Link: https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip

### Step 7: Stow dotfiles

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

If there are conflicts (files already exist), stow will refuse. Show the conflict and offer
`stow --adopt` (takes over existing files, moves them into the dotfiles repo, creates symlinks).

⚠️ **Known issue with `pi` package**: if `~/.pi/agent/skills/os-setup` already exists as a
symlink (created by `bootstrap.sh`), stow will reject the `pi` package. Solution:
```bash
rm ~/.pi/agent/skills/os-setup    # remove bootstrap symlink
cd ~/dotfiles && stow --adopt */  # now stow can re-create it properly
```

After `--adopt`, the original files are moved into `~/dotfiles/`. If you want to restore
the dotfiles versions (not your old configs), run `git -C ~/dotfiles checkout .`

### Step 8: Post-install checks

Verify everything works:

```bash
nvim --version      # neovim
starship --version  # prompt
zellij --version    # multiplexer
herdr --version     # AI workspace manager
mise --version      # version manager
mise ls             # all installed tools
ls -la ~/.bashrc    # should be symlink → ~/dotfiles/bash/.bashrc
ls -la ~/.config/nvim  # should be symlink → ~/dotfiles/nvim/.config/nvim
ls -la ~/.config/herdr # should be symlink → ~/dotfiles/herdr/.config/herdr
ls -la ~/.pi/agent/settings.json  # should be symlink
```

### Step 9: WezTerm as default terminal (WSL)

WezTerm runs as a **Windows GUI app** that connects to WSL — it does not need the Linux binary
to work. The mise-installed WezTerm RPM may not extract or run correctly on Fedora
(requires OpenSSL 1.1 which is not available). However, the config is what matters.

**Check if WezTerm is already installed on Windows:**
```bash
ls /mnt/c/WezTerm/wezterm.exe 2>/dev/null && echo "WezTerm Windows: already installed" || echo "WezTerm Windows: not found"
```

**If already installed on Windows**, create an alias for CLI commands:
```bash
echo 'alias wezterm="/mnt/c/WezTerm/wezterm.exe"' >> ~/.bashrc
```

**If NOT installed**, guide the user:
1. Download from: https://wezfurlong.org/wezterm/install/windows.html
2. The config is already stowed at `~/.config/wezterm/`
3. WezTerm GUI auto-detects WSL distros

Tell the user:
- "Você pode fixar o WezTerm na barra de tarefas do Windows."
- "O WezTerm GUI do Windows conecta automaticamente no WSL — não precisa do binário Linux."

### Step 10: Manual auth setup (inform the user)

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
7. **Adapt to the OS** — detect `apt` vs `dnf` vs `pacman` from `/etc/os-release`; never assume Debian
8. **Mise needs explicit config path before stow** — `~/.config/mise/config.toml` doesn't exist yet, so always use `MISE_CONFIG_FILE=~/dotfiles/mise/.config/mise/config.toml`
9. **WezTerm on WSL is a Windows app** — the GUI runs on the Windows side, not Linux; only the config (`.config/wezterm/`) needs to be stowed
10. **Retry on rate limits** — GitHub API rate limits unauthenticated requests; pause and retry failed tools instead of aborting

## Quick start (what to tell users)

```bash
# 1. Install Pi (one-liner)
curl -fsSL https://pi.ai/install.sh | bash

# 2. Clone dotfiles
git clone git@github.com:lafco/config.git ~/dotfiles

# 3. Link the skill (so Pi reads it before stow runs)
mkdir -p ~/.pi/agent/skills
ln -s ~/dotfiles/pi/.pi/agent/skills/os-setup ~/.pi/agent/skills/os-setup

# 4. Start Pi
pi

# 5. Say:
"setup my machine"
```

## Troubleshooting common issues

### "mise install says all tools are installed but nothing is"
Mise can't find the config because dotfiles aren't stowed yet. Always use:
```bash
MISE_CONFIG_FILE=~/dotfiles/mise/.config/mise/config.toml mise install
```

### "cargo:television fails: cargo not found"
The mise config must include `rust = "latest"` BEFORE `cargo:television`. If missing,
install rust first, then retry television.

### "GitHub API returned a 403 Forbidden"
Unauthenticated GitHub API rate limit (~60 req/hour). Wait ~1 minute and retry the
specific tools that failed. Or set `GITHUB_TOKEN` in the environment.

### "wezterm: error while loading shared libraries: libssl.so.1.1"
The wezterm RPM from mise was built for CentOS 8 (OpenSSL 1.1). Modern Fedora uses
OpenSSL 3. On WSL, use the Windows WezTerm GUI instead (`/mnt/c/WezTerm/wezterm.exe`).
On native Linux, download a newer AppImage from wezterm.org.

### "stow: pi package conflicts with os-setup"
The bootstrap.sh created a symlink at `~/.pi/agent/skills/os-setup` that conflicts
with stow. Remove it first:
```bash
rm ~/.pi/agent/skills/os-setup
cd ~/dotfiles && stow --adopt pi
```

### "fc-cache: command not found"
`fontconfig` is not installed. On Debian: `sudo apt install -y fontconfig`.
On Fedora: `sudo dnf install -y fontconfig`. Then `fc-cache -fv`.
