# Skills de agente — hub central

Este diretório é o hub comum (`~/.agents/skills/`) que **pi**, **Zed** e **opencode**
leem nativamente. Ele está vazio de propósito: as skills vêm do pacote
[`pi-agent-skills`](file:///home/lafco/repos/pi-agent-skills), e o hub carrega
symlinks para elas.

```
~/repos/pi-agent-skills/          fonte (git)
├── vendor/addy/skills/           26 skills do Addy Osmani (MIT)
├── vendor/egm/skills/            8 skills do Elephant-Goldfish Model (Apache-2.0)
└── skills/                       skills nossas

~/.agents/skills/                 hub -> symlinks para as pastas acima
```

Regenerar os links: `~/repos/pi-agent-skills/scripts/install-pi.sh` (que também
instala os agentes do pi e registra o pacote).

## Onde cada ferramenta enxerga

| Ferramenta | Global | Por projeto |
|---|---|---|
| pi | `~/.agents/skills/` + as skills do pacote | `.agents/skills/` |
| Zed | `~/.agents/skills/` | `<worktree>/.agents/skills/` |
| opencode | `~/.agents/skills/` | `.agents/skills/` |

## Adicionar uma skill

Skill nossa vai em `/home/lafco/repos/pi-agent-skills/skills/<nome>/SKILL.md`.
Depois rode `scripts/install-pi.sh` para criar o symlink no hub. Não crie a skill
direto aqui: o hub é gerado.

Skill específica de um projeto não entra no hub. Coloque em
`<repo>/.agents/skills/<nome>/SKILL.md` e versione junto com o projeto.

## Regras de formato

- nome em minúsculas, números e hífens (até 64 chars), igual ao diretório
- `description` diz o que faz **e** quando se aplica — é o que roteia
- `SKILL.md` abaixo de 500 linhas; material pesado em `references/` ao lado
- `disable-model-invocation: true` só quando a skill deve ser exclusivamente manual
