# nixos/ — máquina declarativa (NixOS + flakes + home-manager + devenv)

Configuração NixOS da máquina **hmpc** (AMD Ryzen 5 5500 + Radeon RX 7600), que
substitui o fluxo mise+Stow por um sistema 100% declarativo — sem abrir mão dos
dotfiles deste repo, que continuam sendo a fonte única dos configs.

## Estrutura

```
nixos/
├── flake.nix                  # entradas: nixpkgs 25.11, unstable, home-manager, devenv
├── hosts/hmpc/
│   ├── default.nix            # host + overlay unstable + home-manager (usuário lafco)
│   └── hardware-configuration.nix  # ⚠️ gerado na instalação (placeholder)
├── modules/system/            # módulos NixOS do host
│   ├── base.nix               # nix, gc, nix-ld (Mason), fontes Nerd Font, utils
│   ├── boot.nix               # systemd-boot (UEFI)
│   ├── locale.nix             # pt_BR.UTF-8, ABNT2, America/Sao_Paulo
│   ├── network.nix            # NetworkManager
│   ├── audio.nix              # PipeWire (+32-bit) e Bluetooth
│   ├── amd.nix                # mesa/radv, microcode, radeontop, vulkan-tools
│   ├── desktop.nix            # niri + greetd (autologin) + Noctalia + portals
│   └── gaming.nix             # Steam, GameMode, MangoHud, gamescope
├── modules/home/              # módulos home-manager do usuário lafco
│   ├── default.nix            # devenv CLI + imports
│   ├── dotfiles.nix           # symlinks pros dotfiles do repo (~/dotfiles)
│   ├── shell.nix              # starship, zoxide, atuin, tv, bat, eza, fd, rg, btop, direnv
│   ├── git.nix                # git, gh, lazygit, jj, gh-dash, diffnav
│   ├── editor.nix             # neovim + Zed (vim binds) + LSPs/formatters
│   ├── terminal.nix           # wezterm, zellij, wl-clipboard, xclip
│   ├── ai.nix                 # pi (pi-coding-agent) + herdr (via unstable)
│   └── apps.nix               # Firefox, Proton Pass, Obsidian, mpv, Ankama Launcher
├── home/niri/config.kdl       # config do compositor (linkado em ~/.config/niri)
└── devenv/                    # templates de dev env por projeto
    ├── node/{flake.nix,devenv.nix,.envrc}
    ├── python/{flake.nix,devenv.nix,.envrc}
    └── rust/{flake.nix,devenv.nix,.envrc}
```

## Como os dotfiles são usados

`modules/home/dotfiles.nix` cria symlinks **fora da store Nix** apontando para
`~/dotfiles/<pacote>` (o mesmo layout do Stow). Ou seja:

- Editar no repo tem efeito **imediato**, sem rebuild;
- Nada é duplicado — `nvim/`, `bash/`, `wezterm/`, `zellij/`, `pi/`, `herdr/`… continuam
  a fonte única;
- Em máquinas não-Nix, o Stow continua funcionando normalmente.

⚠️ O repo precisa estar em `~/dotfiles` (como no `bootstrap.sh`). Se clonar em outro
lugar, ajuste `repo` em `modules/home/dotfiles.nix`.

## Instalação (máquina nova)

1. **Baixe a ISO** do NixOS 25.11, grave num pendrive e boote:
   https://nixos.org/download/
2. **Particione e instale** (instalador gráfico ou manual). No fim:
   ```bash
   sudo nixos-generate-config --show-hardware-config \
     > ~/dotfiles/nixos/hosts/hmpc/hardware-configuration.nix
   ```
   > O `hardware-configuration.nix` versionado é só um placeholder — substitua
   > pelo gerado na máquina real antes do primeiro rebuild.
3. **Clone o repo** (se ainda não estiver lá):
   ```bash
   git clone https://github.com/lafco/config.git ~/dotfiles
   ```
4. **Primeiro switch** (gera o `flake.lock` e aplica tudo):
   ```bash
   sudo nixos-rebuild switch --flake ~/dotfiles/nixos#hmpc
   ```
   Primeira vez compila bastante (pi/herdr vêm do unstable). Depois é rápido.

## Dia a dia

```bash
# Aplicar mudanças no repo (sistema + home de uma vez)
sudo nixos-rebuild switch --flake ~/dotfiles/nixos#hmpc

# Testar sem aplicar (build seco)
sudo nixos-rebuild dry-build --flake ~/dotfiles/nixos#hmpc

# Atualizar tudo (novo lock + rebuild)
cd ~/dotfiles/nixos
nix flake update
sudo nixos-rebuild switch --flake ~/dotfiles/nixos#hmpc

# Voltar uma geração (rollback instantâneo)
sudo nixos-rebuild switch --rollback
```

## Migração mise → nix

| Ferramenta | Antes (mise) | Agora (nix) |
|---|---|---|
| starship, zoxide, atuin, television, bat, eza, fd, rg, btop | mise | `modules/home/shell.nix` |
| lazygit, jj, gh, gh-dash, diffnav | mise | `modules/home/git.nix` |
| neovim, wezterm, zellij | mise | `modules/home/editor.nix` / `terminal.nix` |
| herdr | mise (github backend) | `pkgs.unstable.herdr` |
| pi | script pi.dev | `pkgs.unstable.pi-coding-agent` |
| node/python/rust globais | mise | **devenv por projeto** (templates abaixo) |
| stow, fontconfig, build-essential | apt | desnecessários no NixOS (nix-ld + fontes em `base.nix`) |
| JetBrains Mono Nerd Font | curl | `fonts.packages` em `base.nix` |

Se algum projeto ainda tiver `mise.toml` próprio, o mise continua instalável
(`nix shell nixpkgs#mise`) — mas a ideia é migrar cada projeto para `devenv.nix`.

## devenv (ambientes por projeto)

O CLI do devenv e o direnv (com nix-direnv) já estão instalados via home-manager.
Para criar um ambiente num projeto:

```bash
cd meu-projeto
cp ~/dotfiles/nixos/devenv/node/{flake.nix,devenv.nix,.envrc} .  # ou python/rust
direnv allow        # carrega o env ao entrar no diretório
# alternativas: nix develop  /  devenv up
```

Edite o `devenv.nix` do projeto conforme precisar (versões de runtime, pacotes,
services, scripts). Docs: https://devenv.sh

## Zed (vim binds espelhando o nvim)

Config em `zed/.config/zed/` (settings.json + keymap.json), linkado via
home-manager. Tema **Catppuccin Mocha** (o mesmo do nvim), tabs=2, números
relativos, formatação explícita (`<space>c`), LSPs do PATH via nix
(lua-language-server, intelephense, stylua).

Binds do nvim mapeados: `<C-h/j/k/l>` panes, `<C-w>v`/`<C-w>b` splits, `<C-x>`
fecha buffer, `[b`/`]b` buffers, `]d`/`[d` diagnósticos, `]c`/`[c` hunks, `gd`/`gi`/`gr`/`gt`/
`gR`/`ga`/`K` LSP, `gcc` comentar, `<space>ff`/`<space>fg`/`<space>fb`/`<space>/`
fuzzy finder, `<space>e` explorador, `<space>tt` terminal, `<space>ut` tema.

Não têm equivalente direto no Zed (deixados de fora de propósito): harpoon,
histórico de yank (registers), quickfix, debugprint e neogit — para git use
`<space>gg` (abre terminal) + `lazygit`. Debug do Zed usa as teclas padrão
F5/F10/F11/Shift+F11.

## niri (atalhos principais)

| Atalho | Ação |
|---|---|
| `Mod+T` | terminal (wezterm) |
| `Mod+D` | launcher (fuzzel) |
| `Mod+Space` | launcher do Noctalia |
| `Mod+S` | painel de controle do Noctalia |
| `Mod+Shift+Comma` | configurações do Noctalia |
| `Alt+Tab` | alternador de janelas do Noctalia |
| `Mod+Q` | fechar janela |
| `Mod+J/K` | foco janela abaixo/acima · `Mod+Ctrl+J/K` move |
| `Mod+H/L` | foco coluna esq/dir · `Mod+Ctrl+H/L` move coluna |
| `Mod+U/I` ou `Mod+PageUp/PageDown` | workspaces |
| `Mod+1..9` | workspace por índice |
| `Mod+O` | visão geral (overview) |
| `Mod+V` | alternar flutuante |
| `Mod+R` | larguras pré-definidas de coluna |
| `Super+Alt+L` | bloquear tela (lockscreen do Noctalia) |
| `Print` / `Ctrl+Print` / `Alt+Print` | screenshot área/tela/janela |
| `Mod+Shift+E` | sair do niri |
| `Mod+Shift+Slash` | cheatsheet de atalhos |

## Noctalia (shell do desktop)

O Noctalia v5 substitui a pilha waybar+mako+swayidle+swaylock+swaybg: barra,
painel de controle, notificações, lockscreen, idle, wallpaper e launcher — tudo
com um tema só. Docs: https://docs.noctalia.dev

- Instalado via `pkgs.unstable.noctalia` (nixpkgs-unstable — só existe lá).
- Config em `~/.config/noctalia/config.toml` (TOML, hot reload). Sem config, ele
  roda com os defaults — edite direto no arquivo ou pelo painel `Mod+Shift+Comma`.
- O `modules/system/desktop.nix` já habilita o que ele precisa
  (upower, power-profiles-daemon; network/bluetooth já vêm de `network.nix`/`audio.nix`).
- Opções de wallpaper/overview (backdrop, blur) estão nos docs de niri do projeto;
  blur requer niri ≥ 26.04, então não está ativo no NixOS 25.11.

## Apps e logins: o que é automático e o que não é

Três categorias diferentes de "configuração":

| Categoria | Exemplos | Como fica |
|---|---|---|
| **Apps + configuração** | Firefox (extensões, preferências, tema), Proton Pass, neovim, wezterm… | ✅ 100% declarativo — instala e configura no `switch` |
| **Logins em apps** | Firefox Sync, conta Proton, Discord, Spotify | ✋ 1x manual — sessão fica salva no app; não dá (e não deve) ir versionada no repo |
| **Tokens que a máquina lê sozinha** | `JIRA_API_TOKEN` no `~/.secrets`, chaves de serviços | 🔐 sops-nix (criptografado no repo, decriptado no boot) |

**Firefox** já vem com uBlock Origin + Proton Pass + Pywalfox (tema Noctalia)
instalados via `modules/home/apps.nix`. Você só **loga uma vez** na conta Firefox
(Sync restaura favoritos/histórico) e no Proton Pass — o resto é declarativo.

Outros apps de GUI já declarados no mesmo módulo: **Obsidian**, **mpv** (VAAPI na
RX 7600) e **Ankama Launcher** (Dofus, Waven, Wakfu…).

O Noctalia também tem **templates de tema para outros apps** (VSCode, Discord,
Obsidian, Spotify, Steam, Neovim, terminal): ative em Settings → Templates do
próprio Noctalia (Settings → Templates → Browse Templates). Instalar o app é o
que falta — me diga quais você usa e eu adiciono.

## Proton Pass vs sops-nix (papeis diferentes, não concorrentes)

- **Proton Pass** = senhas de sites/apps que **você** digita e usa interativamente:
  autofill no Firefox via extensão, e no resto do sistema via app desktop
  (`proton-pass`, já instalado). Não existe autofill automático global em apps
  nativos no Linux (limitação do ecossistema), mas o app fica na bandeja/tray
  para copiar qualquer senha.
- **sops-nix** = segredos que **o sistema** precisa ler sem você: env vars dos
  seus scripts, tokens de serviços, chaves de CI. Ele guarda esses valores
  criptografados no repo e decripta sozinho a cada rebuild, em `/run/secrets`
  (RAM, só root lê). Ou seja: o repo fica público sem vazar nada, e o
  `~/.secrets` do bash deixa de ser um arquivo solto na máquina.

Resumo: **Proton Pass para você, sops-nix para a máquina.** Os dois convivem.

## Primeiro login (checklist de ~5 min)

Depois do primeiro `switch`, rode uma vez:

```bash
# Terminal
gh auth login          # GitHub CLI (credential helper do git)
atuin register         # conta do Atuin (sync de histórico)
pi                     # autenticar o pi (providers/API keys)

# GUI
# 1. Firefox: logar na conta (Sync restaura favoritos/histórico)
# 2. Proton Pass (extensão + app): logar na conta Proton
# 3. Noctalia: Settings → Templates → ativar templates (Firefox/Pywalfox etc.)
```

## Multi-host

Adicionar outra máquina = novo diretório `hosts/<nome>/` + uma entrada
`nixosConfigurations.<nome>` no `flake.nix`. Os módulos de `modules/` são
reaproveitados (o host escolhe o que importa).

## Troubleshooting

- **`nix flake` não reconhece o repo**: o flake está em `nixos/` — use sempre o
  caminho completo (`~/dotfiles/nixos`) ou rode os comandos dentro da pasta.
- **LSP do Mason não roda**: garanta `programs.nix-ld.enable = true` (já está em
  `base.nix`) e rebuild após instalar plugins novos.
- **`stow */` tentando linkar a pasta nixos**: o `.stow-local-ignore` na raiz do
  repo já ignora `nixos/`.
- **Erro 403 do GitHub em builds**: rate limit sem token — `gh auth login` e
  tente de novo.
- **Screenshot/screencast não funciona**: os portals rodam sob a sessão niri via
  greetd; verifique `journalctl --user -u xdg-desktop-portal*`.
