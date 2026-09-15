# Exemplos de quebra (calibração)

Um caso para calibrar a régua antes de propor a árvore: a transformação
"passos da descrição → fatia vertical".

## Caso 1 — DRHJNES-1015: widget de mensagem aos colaboradores (Spike → fluxo genérico)

A descrição trazia um passo a passo técnico (campos em `tabs/widgets.php`,
`saveWidgetExterno`, integração no `salvaConfiguracao`, `getWidgetExterno`,
modal em `externo/dashboard.php`) e quatro testes mínimos de comportamento:
cadastrar, visualizar no MyAhgora, sobrepor o anterior, flag desligada sem
regressão.

### Quebra ruim (o que não fazer)

| Tarefa | Problema |
|---|---|
| Criar campos de parametrização em `configuracoes/tabs/widgets.php` | Tela isolada; nada observável chega ao colaborador |
| Criar `saveWidgetExterno` no controller de widgets | Método isolado, sem demonstração possível |
| Integrar os campos no `salvaConfiguracao` | Continuação do anterior; cabe no mesmo commit |
| Criar `getWidgetExterno` | Só tem efeito junto com o modal |
| Criar modal em `externo/dashboard.php` | A feature só passa a existir no quinto passo |
| `Execução de TU` / validação manual | Teste não é entrega; validação é critério de aceite |
| Tratar casos de borda e refatorar | Trabalho adjacente que a issue não pediu |

Sete tarefas, seis ondas: o valor só aparece no fim, e a descrição — que é
pista — virou o plano. É exatamente isso que a quebra deve recusar.

### Quebra boa (1 tarefa, L)

**`Codificação` — Widget externo: empresa parametriza a mensagem e o
colaborador a vê no MyAhgora**

- **Valor observável:** admin salva a mensagem na aba Widgets e o colaborador
  logado no MyAhgora (Web) vê o widget; um novo cadastro sobrepõe o anterior.
- **Os cinco passos são notas técnicas desta fatia** — os métodos `saveWidgetExterno`
  e `getWidgetExterno`, a integração no `salvaConfiguracao` e o modal nascem no
  mesmo commit; nenhum deles vira tarefa.
- **Fora de escopo:** refatorar o sistema de widgets, casos de borda,
  suíte e2e. A flag desligada sem regressão é critério de aceite, não tarefa.
- **Só dividiria por tamanho** (estourou as ~16h), nunca por camada: por
  exemplo, se a mensagem precisasse ser enviada por e-mail além do widget,
  essa seria uma segunda entrega.

**Regra extraída:** se todos os passos da descrição morrem no mesmo commit, a
quebra é **uma** tarefa. Se a issue pede dois comportamentos observáveis
distintos, cada um vira uma tarefa — nunca cada camada.
