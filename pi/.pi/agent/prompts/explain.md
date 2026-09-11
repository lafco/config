---
description: Gera um documento explicativo em HTML sobre uma mudança (diff, branch, PR, commit)
argument-hint: "[ref | caminho da task/epic]"
---
Use a tool `subagent` no modo `single` com o agente "explainer" para explicar: ${@:-as mudanças ainda não commitadas (`git diff HEAD` mais os arquivos novos não rastreados)}

Como montar o `task` — o agente tem **contexto isolado** e não vê esta conversa:

- **Alvo, por extenso**: o repositório/`cwd`, a ref exata e o comando de diff a usar (`git diff HEAD`, `git diff main...HEAD`, `git show <sha>`, ou o caminho de uma task/epic). Se for diff de working tree, diga que os não rastreados (`git status --short`) também fazem parte da mudança.
- **Procedência**: se você já sabe de onde veio a solicitação (task em `~/epics/<KEY>/`, issue, mensagem de commit), passe o caminho. Isso é o que permite a seção "Why this way" se apoiar em evidência em vez de adivinhação do modelo.
- **Idioma**: pt-BR.
- **Limite**: "Não altere o código do repositório, não commite. Você só escreve o HTML em `~/explanations/`."
- **Não delegar**: "Complete com seu próprio contexto e ferramentas. Não spawne nem delegue a subagentes."
- Peça o retorno no formato do agente: `## Documento` (caminho), `## O que ele cobre`, `## Não verificado`.

Ao receber, mostre o caminho do arquivo ao usuário e a seção `## Não verificado`. Se ele quiser abrir: `xdg-open <arquivo>`.

Não resuma o documento inteiro aqui — o entregável é o arquivo, e ele existe para ser lido, não substituído.
