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
| Terminal | zellij (multiplexer); no NixOS o terminal é o herdr-app, ver abaixo |
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
dot init -q               # silencioso (só erros/avisos; log em ~/.cache/dot/init.log)
dot init --skip-font      # sem as fontes
dot init --only nvim      # instala só uma ferramenta
dot update                # git pull + re-stow
dot doctor                # diagnóstico do ambiente
dot stow                  # (re)aplica symlinks
dot stow -n               # dry-run
dot links                 # (re)cria os links locais (repos privados em ~/repos)
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
├── local-links.tsv  # manifesto dos links locais (conteúdo privado, fora do stow)
├── bash/            # .bashrc, .bash_profile, .aliases, .functions
├── nvim/            # ~/.config/nvim/ (LazyVim)
├── pi/              # ~/.pi/agent/ (settings, extensions, skills; sem folding)
├── herdr-app/       # ~/.config/herdr-app/ (settings.json, keys.json; sem folding)
├── zellij/          # ~/.config/zellij/ (multiplexer)
├── television/      # ~/.config/television/ (fuzzy finder)
├── starship/        # ~/.config/starship.toml (prompt)
├── atuin/           # ~/.config/atuin/config.toml (histórico)
├── gh-dash/         # ~/.config/gh-dash/config.yml (dashboard GitHub)
├── skills/          # ~/.agents/skills/ (hub de symlinks para o pacote pi-agent-skills)
└── packages/        # failed_tools.txt (runtime, não versionado)
```

## Skills de agente (hub central)

O pacote `skills` linka `~/.agents/skills/` para o repo: um hub único que **pi**,
**Zed** e **opencode** leem nativamente, sem cópia por ferramenta. O conteúdo não
mora aqui — o hub só carrega symlinks para o pacote
[`pi-agent-skills`](/home/lafco/repos/pi-agent-skills), que versiona as 26 skills do
Addy Osmani (MIT), as 8 do Elephant-Goldfish Model (Apache-2.0) e as nossas.

```bash
~/repos/pi-agent-skills/scripts/install-pi.sh   # agentes + pacote + symlinks do hub
```

```bash
# pi:       /skill:<nome> ...  ou /spec, /plan, /build, /test, /review, /ship
# zed:      /<nome> (slash command) ou @skill
# opencode: @<nome> ...        (lê o mesmo hub)
```

Numa máquina nova: `dot init` traz o hub, e o `install-pi.sh` do pacote popula os
links. Layout, licenças e como atualizar os upstreams: ver `skills/README.md` e
`~/repos/pi-agent-skills/UPSTREAM.md`.

## Conteúdo local, fora do stow

O pacote `pi` é stowado com `--no-folding` (ver `NO_FOLD_PACKAGES` no script
`dot`). Em vez de dobrar `~/.pi/agent/skills` num symlink para o repo, o stow cria
diretórios reais e linka só as folhas versionadas. Consequências:

- conteúdo de máquina (skills, agents, prompts e extensões privadas) mora em
  `~/.pi/agent/{skills,extensions,agents,prompts}` como arquivo comum, **fora do
  checkout** — não aparece em `git status`, não precisa de `.gitignore` e um
  `git clean -xdf` não apaga;
- `stow -R` não encosta nesse conteúdo nem o transforma em conflito;
- um clone novo do dotfiles traz só o que é genérico; o que é de trabalho você
  repõe à mão naquela máquina.

Se um dia `~/.pi/agent/skills` virar symlink de novo (stow sem a flag num
diretório que não existe), o conteúdo local fica preso dentro do checkout. Foi o
que motivou a mudança: antes o `.gitignore` listava nome por nome e o repositório
público acabava nomeando coisa interna.

## Herdr app (desktop)

O `herdr-app` (nixpkgs-unstable, no NixOS vindo de `home/modules/ai.nix`) é o
terminal principal da máquina daily. O pacote `herdr-app` versiona **só** o que
é do usuário: `settings.json` e `keys.json`. O resto de `~/.config/herdr-app` é
do app — `view.json`, `shared.json`, `window.json`, `installed.json`, `seen.json`,
`data/`, `frame/`, `icons/`, `mods/`, `layouts/.state/` e os `*.d.ts` (reescritos a
cada start) — e fica fora do checkout por causa do `--no-folding`.

O app grava com `write_atomic`, que resolve o alvo do symlink antes do rename
(`src/persist.rs`, `resolve_target`): editar pelas configurações do app ou pelo
atalho de escape (`ctrl-alt-shift-escape`) grava direto no repo, e o symlink não
vira arquivo comum. Basta `dot stow herdr-app` depois de clonar.

O que ainda **não** é versionado, por escolha: `layouts/<nome>.json` (o app
reescreve a cada arrasto de painel, então o repo ganharia diff constante) e
`programs.json` (preferências de ícone/nome de programa).

```bash
dot stow herdr-app   # (re)aplica os links de settings.json e keys.json
```

## Links locais (conteúdo privado)

Os repos privados de trabalho ficam em `~/repos/` e entram no pi por symlink
dentro dos diretórios reais acima — não por cópia. `local-links.tsv`
(versionado) é a fonte de verdade: cada linha tem `<caminho relativo a $HOME>` +
TAB + `<alvo do symlink>`, e o alvo sobe 3 níveis até `$HOME`
(`../../../repos/<repo>/...`).

```bash
dot links     # cria/conserta os links a partir do manifesto
dot doctor    # acusa link local ausente ou quebrado
```

`dot init`, `dot update` e `dot stow` rodam `dot links` no fim. Numa máquina sem
os repos privados os alvos ausentes viram aviso, não erro. Nenhum desses links
entra no checkout, então perdê-los não suja o git — só derruba a tool no pi sem
avisar. Em 2026-09-30 um `dot stow` que tratava link como conflito moveu todos
para `~/.dotfiles-backup/` e nada os recriou: o pi subiu sem `pw2_request`.

## Dia a dia

```bash
# Depois de editar configs no repo:
cd ~/dotfiles
dot stow -n     # dry-run
dot stow        # aplica

# Conflitos (arquivos que já existem em ~ e não são do stow) são movidos para
# ~/.dotfiles-backup/<timestamp>/ antes de linkar; --no-backup desativa.
# Links do home-manager (/nix/store) nunca são tocados — o stow é abortado.

# Depois de atualizar:
dot update      # git pull + re-stow

# Adicionar um config novo:
mkdir -p ~/dotfiles/meu-app/.config/meu-app
echo "..." > ~/dotfiles/meu-app/.config/meu-app/config.yaml
# 1. adicione "meu-app" à lista STOW_PACKAGES no script `dot`
# 2. dot stow meu-app

# Se o pacote precisar de diretórios reais em $HOME para conteúdo local
# (caso do `pi`), adicione-o também a NO_FOLD_PACKAGES.
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
