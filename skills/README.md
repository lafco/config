# Skills de agente — hub central

Skills no formato [Agent Skills](https://agentskills.io/specification) (uma pasta
com `SKILL.md` por skill), compartilhadas por todas as ferramentas de agente
através de `~/.agents/skills/`. É uma cópia vendored do plugin
[pstack](https://github.com/cursor/plugins/tree/main/pstack) (58 skills),
feita para ser modificada.

## Layout

```
skills/
├── README.md           # este arquivo
└── .agents/
    └── skills/         # symlinks para pstack/skills/<nome>
        ├── ptm -> ../../../pstack/skills/ptm
        └── ...

pstack/                 # cópia fiel do plugin (fonte da verdade)
├── skills/             # os SKILL.md de verdade
├── agents/             # subagents do Cursor (poteto-agent, comment-sicko)
├── automations/        # pack benny (Cursor-only)
├── docs/  assets/  plugin.json  .cursor-plugin/
├── update.sh           # diff/apply contra o upstream
└── UPSTREAM.md         # origem, commit e como atualizar
```

O pacote stow `skills` linka `~/.agents/skills` para
`~/dotfiles/skills/.agents/skills`. Editar um skill (por qualquer um dos
symlinks) edita o arquivo versionado.

## Onde cada ferramenta enxerga

| Ferramenta | Global | Por projeto | Observação |
|---|---|---|---|
| pi | `~/.agents/skills/` | `.agents/skills/` (descoberto subindo a árvore até a raiz do repo) | suporte nativo, segue a spec |
| Zed | `~/.agents/skills/` | `<worktree>/.agents/skills/` | aceita symlink; só carrega de worktrees confiáveis |
| opencode | `~/.agents/skills/` (fonte de compatibilidade) | `.agents/skills/` (compat) | lê o hub direto — nada a linkar |
| Projeto t3/outro | — | `.agents/skills/` dentro do repo | quem roda ali é o pi/zed/opencode do projeto |

Nenhuma cópia é feita para as ferramentas: todas leem o mesmo diretório (ou um
symlink para ele), então qualquer mudança vale na hora em todas.

## Uso

- **pi**: `/skill:ptm ...` (força uma skill) — os skills aparecem em
  `/skill:` e o modelo pode invocá-los sozinho quando a descrição casar.
- **Zed**: `/` no message editor e selecione o skill pelo nome, ou `@skill`.
- **opencode**: mencione a skill no prompt com `@ptm ...` (com
  `disable-model-invocation` ela não entra na lista automática do modelo, mas
  carrega por menção explícita).

### Projeto (ex.: app t3-stack)

Para ter as skills também dentro de um projeto (versão por projeto):

```bash
cd ~/repos/meu-app
ln -s ~/dotfiles/skills/.agents/skills .agents/skills
```

Isso é opcional: o caminho global já cobre todos os projetos. Use o link no
projeto quando quiser compartilhar as skills com quem clona o repo (o symlink
não funciona para terceiros — copie ou versione os arquivos).

## Adicionar skill própria

Criar uma pasta com `SKILL.md`:

```bash
mkdir -p ~/dotfiles/skills/.agents/skills/minha-skill
```

```markdown
---
name: minha-skill
description: O que ela faz e quando usar.
---

Instruções...
```

Regras: nome em minúsculas, números e hífens (máx. 64 chars), descrição até
1024 chars, SKILL.md de preferência com menos de 500 linhas (Zed recomenda).
Rode `dot stow skills` se criar a pasta direto em `~` (não precisa se criar no
repo — o symlink de `~/.agents/skills` já aponta para cá).

Nota: o stow dobra o pacote num link único `~/.agents` → repo. Qualquer coisa
que uma ferramenta escrever em `~/.agents` (ex.: skill criada pela UI do Zed no
escopo User) cai no checkout e aparece como arquivo não rastreado — é a
proposta: tudo versionado no hub. Se um dia outro tool exigir `~/.agents` como
diretório real, adicione `skills` a `NO_FOLD_PACKAGES` no `dot`.

## Compatibilidade (o que veio do Cursor e precisa de atenção)

- Quase todas as skills vêm com `disable-model-invocation: true`: o modelo não
  as invoca sozinho — só por comando (`/skill:nome` no pi, `/` no Zed). Remova a
  linha do frontmatter nas que quiser ativar por roteamento automático.
- Frontmatter `icon`, `color` e `paths` são específicos do Cursor. O pi apenas
  avisa; o Zed ignora. Podem ser removidos sem efeito nas duas ferramentas.
- `agents/`, `automations/`, `plugin.json` e `.cursor-plugin/` são
  Cursor-only e ficam aqui como referência (ex.: portar `poteto-agent` para
  `~/.pi/agent/agents/` ou para subagents do Zed, quando quiser).
- Skills que dependem de recurso do Cursor (`setup-pstack`, `ketchup-video`,
  `make-bot-ui`, autopilot, etc.) vão precisar de adaptação ao pi/zed — é parte
  da modificação desta cópia.

## Atualizar do upstream

```bash
~/dotfiles/pstack/update.sh          # diff contra cursor/plugins (sem mexer)
~/dotfiles/pstack/update.sh --apply  # sobrescreve com o upstream
```

Veja `pstack/UPSTREAM.md` para a origem exata e o commit vendored.
