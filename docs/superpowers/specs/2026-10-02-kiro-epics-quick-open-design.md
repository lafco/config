# Kiro: acesso rápido a arquivos de `~/epics`

## Objetivo

Disponibilizar um atalho global no Kiro para localizar e abrir qualquer arquivo de `~/epics`, mesmo quando essa pasta não pertence ao workspace atual. Os seletores de arquivo e pasta do Kiro também devem usar a interface interna, em vez do seletor nativo do sistema.

## Contexto e evidências

- As configurações do Kiro são mantidas no pacote Stow `kiro/.config/Kiro/User/`.
- O Kiro instalado é a versão 1.2.4 e usa `~/.kiro/extensions` como diretório de extensões.
- A configuração versionada atual não contém `files.simpleDialog.enable` nem `window.dialogStyle`.
- No código instalado do Kiro 1.2.4, `files.simpleDialog.enable` tem valor padrão `false` e controla se os comandos internos de abrir arquivo/pasta usam o seletor simplificado do Kiro ou o seletor nativo. `window.dialogStyle` controla outro serviço de diálogos e não seleciona a interface do seletor de arquivos.
- `files.dialog.defaultPath` não garante uma pasta fixa: o Kiro prioriza o último arquivo ativo ou a raiz do workspace e usa essa configuração como fallback.
- `~/epics` contém atualmente 71 arquivos: 70 Markdown e 1 diff. Não há diretórios `.git` nem links simbólicos nesse recorte.
- A CLI do Kiro oferece `--install-extension` para instalar uma extensão local empacotada como VSIX.

## Decisões

### Seletor interno

Definir `files.simpleDialog.enable` como `true` nas configurações globais de usuário do Kiro. Isso afeta os seletores de arquivo e pasta do Kiro, incluindo os comandos atuais `Ctrl+Shift+F` e `Ctrl+Shift+O`.

### Extensão Epics Quick Open

Criar uma extensão local compatível com a API de extensões do Kiro/VS Code. Ela registra o comando `lafco.epicsQuickOpen`, executado por `Ctrl+Shift+E`.

Ao executar o comando, a extensão:

1. Resolve a pasta fixa como `path.join(os.homedir(), "epics")`.
2. Enumera recursivamente todos os arquivos regulares abaixo dessa pasta, sem filtrar por extensão e sem consultar as pastas do workspace.
3. Exibe os arquivos em uma lista pesquisável do Kiro. Cada opção mostra o nome e o caminho relativo para distinguir arquivos com nomes iguais.
4. Abre o arquivo selecionado no editor do Kiro sem trocar ou alterar o workspace.

A extensão será executada no host local do Kiro para que o caminho sempre aponte para o `~/epics` da máquina, inclusive se o workspace atual for remoto. A lista será atualizada a cada invocação; o tamanho observado (71 arquivos) não justifica cache ou índice persistente.

Se `~/epics` não existir ou não puder ser lido, o comando mostra uma mensagem clara no Kiro e não altera o workspace.

### Atalhos

- Adicionar `files.simpleDialog.enable: true` a `kiro/.config/Kiro/User/settings.json`.
- Adicionar `Ctrl+Shift+E` -> `lafco.epicsQuickOpen` em `kiro/.config/Kiro/User/keybindings.json`.
- Remover o atalho padrão `Ctrl+Shift+E` de `workbench.view.explorer` para liberar a combinação. O atalho existente `Ctrl+E` para o Explorer permanece.
- Manter `Ctrl+Shift+F` -> `workbench.action.files.openFile` e `Ctrl+Shift+O` -> `workbench.action.files.openFolder`.

### Integração com Stow

Manter o código e o manifesto da extensão dentro do pacote já existente `kiro`, em `kiro/.kiro/extensions/lafco.epics-quick-open-<versão>/`. O Stow deve expor essa pasta em `~/.kiro/extensions/`; não é necessário adicionar outro pacote à lista do comando `dot`.

A instalação por link do Stow precisa ser validada no Kiro. Se o Kiro não carregar a extensão pelo link, a alternativa suportada é empacotá-la como VSIX e instalá-la com `kiro --install-extension <arquivo.vsix>`.

## Testes e validação

- Testes unitários com `node:test` para enumeração recursiva, caminhos relativos, arquivos sem filtro de extensão e diretório inexistente.
- Validação manual no Kiro, com um workspace diferente de `~/epics`:
  - `Ctrl+Shift+E` mostra arquivos de `~/epics`, permite filtrar pelo nome/caminho e abre a seleção dentro do Kiro.
  - A pasta/workspace atual não muda após a abertura.
  - `Ctrl+Shift+F` e `Ctrl+Shift+O` usam os seletores internos do Kiro, sem abrir o seletor nativo do sistema.
  - `Ctrl+E` continua focando o Explorer; `Ctrl+Shift+E` executa somente o comando da extensão.
- Verificar que `kiro --list-extensions` ou a interface de extensões reconhece a instalação gerenciada pelo Stow. Se não reconhecer, validar a instalação local via VSIX.

## Fora de escopo

- Adicionar `~/epics` a cada workspace ou criar um workspace multi-root.
- Pesquisar conteúdo dentro dos arquivos; a busca é por nome e caminho.
- Alterar o comportamento dos demais atalhos ou instalar a extensão em outros editores.
