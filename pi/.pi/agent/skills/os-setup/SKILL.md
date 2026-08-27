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

⚠️ **Detect derivatives via `ID_LIKE`, not just `ID`.** Many distros are derivatives
that share a base package manager. For example CachyOS, EndeavourOS, Garuda and
Antergos all set `ID_LIKE=arch` and use `pacman`; Pop!_OS sets `ID_LIKE=ubuntu`.
Read both fields and match on `ID_LIKE` first so the right package manager is
picked:
```bash
. /etc/os-release && echo "ID=$ID  ID_LIKE=$ID_LIKE"
```

Show the user what was detected (distro, `ID_LIKE`, WSL yes/no) and ask:
"Este é o ambiente correto? Continuar?"

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

⚠️ **`sudo` needs a TTY for the password.** Pi runs commands without an
interactive TTY, so `sudo` will fail with `a terminal is necessary to read the
password`. If that happens, print the exact command and ask the user to run it
themselves in their terminal, then continue once `stow --version` (or the
relevant binary) succeeds. Don't retry with `echo password | sudo -S` — that
leaks the password into shell history and process listings.

⚠️ **Clipboard on Wayland.** `xsel`/`xclip` are X11-only. On Wayland sessions
(`echo $XDG_SESSION_TYPE` = `wayland`) install `wl-clipboard` instead so herdr's
copy-on-select works:
- Arch: `sudo pacman -S --noconfirm wl-clipboard`
- Debian/Ubuntu: `sudo apt install -y wl-clipboard`
- Fedora: `sudo dnf install -y wl-clipboard`

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

### Step 5: Install fonts

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

⚠️ **`stow */` stows EVERY directory in the repo, including ones that are not
packages.** A repo may contain non-package directories with their own structure
(e.g. `nixos/` holding a NixOS flake with `flake.nix`, `home/`, `hosts/`,
`modules/`). If such a directory is passed to stow, it will create bogus symlinks
in `$HOME` (e.g. `~/flake.nix`, `~/home`, `~/hosts`).

GNU Stow's `.stow-local-ignore` is read **from inside each package directory**,
NOT from the repo root, and its patterns are **Perl regexes** that match file
paths within that package — it cannot be used at the repo root to exclude a
whole package from the `*/` glob. To make a directory be skipped by stow, put a
nested `.stow-local-ignore` inside it that matches everything:
```bash
echo '.*' > ~/dotfiles/<non-package-dir>/.stow-local-ignore
```
(`.*` is a Perl regex matching any path; a bare `*` is rejected as invalid
regex.) Verify with `stow -n -v */ | grep <dir>` — it should print nothing.

Alternatively, don't use the `*/` glob — list packages explicitly:
```bash
cd ~/dotfiles && stow bash nvim pi wezterm zellij television starship mise ...
```
After applying stow, audit for stray symlinks in `$HOME` that point back into
a non-package dir and `rm` them:
```bash
find ~ -maxdepth 2 -type l 2>/dev/null | while read l; do
  case "$(readlink "$l" 2>/dev/null)" in *<non-package-dir>*) echo "stray: $l";; esac
done
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

### Step 7: Post-install checks

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

### Step 8: WezTerm as default terminal

There are two scenarios: WSL (Windows GUI app) and native Linux.

#### 8a. WSL — WezTerm runs as a Windows GUI app

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

#### 8b. Native Linux — the mise binary often doesn't run

On modern distros (Fedora, CachyOS/Arch, etc. with OpenSSL 3) the wezterm binary
installed by mise via the `github:wez/wezterm` backend is built for CentOS 8 and
fails with:
```
wezterm: error while loading shared libraries: libssl.so.1.1: cannot open shared object file
```
Don't try to install OpenSSL 1.1 system-wide — that's a rabbit hole. Instead, use a
native build so the config at `~/.config/wezterm/` is actually used:

- **Arch / CachyOS / EndeavourOS:** install the AUR package (it builds against system libs):
  ```bash
  paru -S --needed wezterm   # or: yay -S --needed wezterm
  ```
  (`wezterm-git` is also available for the latest master.)
- **Fedora:** `sudo dnf install -y wezterm` (if available) or download the AppImage from
  https://wezfurlong.org/wezterm/installation/linux.html and `chmod +x` it.
- **Other distros:** download the AppImage from wezfurlong.org and place it on `$PATH`.

After installing natively, remove the broken mise copy from PATH by uninstalling it:
```bash
MISE_CONFIG_FILE=~/dotfiles/mise/.config/mise/config.toml mise uninstall wezterm
```
—or just let the system `wezterm` shadow the mise one (system bin dir usually precedes
mise shims). Verify with `command -v wezterm && wezterm --version`.

The WezTerm config (`window_decorations`, colors, font, kitty keyboard protocol
for Pi) is already stowed at `~/.config/wezterm/wezterm.lua`. To remove the
title bar and the close/minimize/maximize buttons on GNOME Wayland, the config
sets `window_decorations = 'NONE'` (CSD client-side decorations).

### Step 9: Manual auth setup (inform the user)

These require user interaction and cannot be automated:

1. **Git identity (do this FIRST — before any `git commit`).** A fresh machine has
   no `user.name`/`user.email` set, so `git commit` fails with
   `unable to auto-detect email address`. Set it globally (use your real email):
   ```bash
   git config --global user.name  "Seu Nome"
   git config --global user.email "seu@email.com"
   ```
   This is needed because Step 6's `stow --adopt` + `git checkout .` and any later
   fix commits require a committed identity.

2. **GitHub auth:** `gh auth login`

3. **Atuin (shell history sync):** `atuin register` then `atuin sync`.
   ⚠️ **`atuin register` MUST run in a real interactive terminal (TTY), not via
   the agent.** Atuin 18.x only generates the encryption key
   (`~/.local/share/atuin/key`) during the interactive register/login flow; the
   headless form (`atuin register -u ... -e ... -p ...`) tries to read an existing
   key and fails with `the given key path does not exist`. If you hit that error,
   reset the local data store and re-register interactively in the user's shell:
   ```bash
   rm -rf ~/.local/share/atuin      # wipes local history (only do this before first sync)
   atuin register                   # in the user's real terminal — generates a fresh key
   atuin sync
   ```
   Confirm the key exists afterwards: `ls ~/.local/share/atuin/key && atuin key`.

4. **Pi auth:** Configure API keys for your AI providers

5. **Jira token:** Set `JIRA_API_TOKEN` in your shell (already configured if env vars are in .bashrc)

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
11. **`sudo` needs a TTY** — Pi has no interactive terminal, so `sudo` will fail to read the password. Print the command and ask the user to run it themselves; never use `echo password | sudo -S`
12. **`stow */` stows every dir, including non-packages** — a repo may hold non-package dirs (e.g. `nixos/`); exclude them with a nested `<dir>/.stow-local-ignore` containing `.*` (Perl regex), not a root-level ignore file
13. **Configure git identity before committing** — a fresh machine has no `user.name`/`user.email`, so `git commit` fails; set them globally in Step 9 before any commit
14. **Atuin register needs a real TTY** — the headless `-u/-e/-p` form fails with "key path does not exist"; the key is only generated during interactive register

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

### "stow created stray symlinks in $HOME (~/flake.nix, ~/home, ~/hosts, ...)"
`stow */` stows every directory in the repo, including non-package dirs like
`nixos/`. A root-level `.stow-local-ignore` does NOT exclude a whole package
from the glob — Stow reads that file from inside each package dir, and its
patterns are Perl regexes matching file paths within the package. To stop a
dir from being stowed, put a nested `.stow-local-ignore` inside it matching
everything:
```bash
echo '.*' > ~/dotfiles/<dir>/.stow-local-ignore   # .* is a Perl regex; bare * is invalid
rm -f ~/flake.nix ~/home ~/hosts ~/modules ~/devenv   # clean up the stray links
stow -R */                                            # re-stow cleanly
```

### "fc-cache: command not found"
`fontconfig` is not installed. On Debian: `sudo apt install -y fontconfig`.
On Fedora: `sudo dnf install -y fontconfig`. Then `fc-cache -fv`.

### "atuin register: the given key path does not exist"
Atuin 18.x only generates the encryption key (`~/.local/share/atuin/key`) during
the **interactive** register/login flow (it needs a real TTY). The headless form
(`atuin register -u ... -e ... -p ...`) tries to read an existing key and fails.
Fix: run `atuin register` with no flags in the user's real terminal. If the data
store is in a half-initialized state, reset it first (this wipes local history,
so only do it before the first successful sync):
```bash
rm -rf ~/.local/share/atuin
atuin register    # interactive — generates a fresh key
```

### "git commit: unable to auto-detect email address"
A fresh machine has no git identity. Set it before any commit:
```bash
git config --global user.name  "Seu Nome"
git config --global user.email "seu@email.com"
```
