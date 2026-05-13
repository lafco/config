---
name: mr-review
description: Revisão de Merge Requests (MR) — analisa diff de branches Git em busca de erros de sintaxe, problemas arquiteturais, quebras de contrato, e más práticas. Consulta o prdbook (vault de documentação) para validar mudanças contra regras de negócio e arquitetura documentada do produto. Use quando o usuário pedir "review", "revisar MR", "code review", "analisar diff", "revisar branch" ou mencionar revisão de código.
---

# MR Review

Skill para revisão automatizada de Merge Requests. Analisa o diff de um branch contra a base (main/master), identifica problemas e sugere correções, usando o prdbook como fonte de verdade arquitetural.

## Pré-requisitos

- Repositório Git com branch de feature
- (Opcional) prdbook configurado com vault do produto afetado

## Fluxo da revisão

### Passo 1: Coleta do diff

```bash
cd <repo> && git diff origin/master...HEAD -- <arquivos>
# ou
cd <repo> && git diff main...HEAD -- <arquivos>
```

Para cada arquivo modificado, ler o conteúdo completo com `read` para verificar contexto além do diff.

### Passo 2: Identificação do produto

Mapear os arquivos modificados para produtos do prdbook:

- Analisar paths (ex: `mvc/controllers/acessos.php` → produto `acesso`)
- Verificar se o produto tem pasta em `~/prdbook/{produto}/`
- Se tiver, chamar `get_product_knowledge("{produto}")` para carregar regras de negócio, arquitetura e contratos
- Se NÃO tiver, anotar que o produto não está documentado (sugerir criação posterior)

### Passo 3: Categorias de análise

| Categoria | O que verificar |
|---|---|
| **Sintaxe** | Parse errors, missing semicolons, unmatched brackets, undefined variables |
| **Assinaturas** | Métodos cuja assinatura mudou — verificar TODOS os callers (grep no repo) |
| **Contratos** | Campos removidos de arrays/objetos que são consumidos por outras camadas (ex: controller retorna array que JS espera) |
| **Efeitos colaterais** | `exit`/`die` no meio do código, loops infinitos, alteração de estado global |
| **Regressões** | Funcionalidade removida ou comportamento alterado silenciosamente |
| **Consistência** | Nomes de métodos seguem padrão do codebase? Mensagens de erro batem com valores reais? |
| **Performance** | Batches/queries que podem causar OOM, memory_limit desnecessário, N+1 queries |
| **Segurança** | XSS, injeção, dados sensíveis expostos |

### Passo 4: Salvar relatório em arquivo

**SEMPRE** salvar o relatório da revisão em um arquivo `.md` cujo nome é o nome do branch:

```bash
mkdir -p ~/prdbook/staging/reviews
```

Criar `~/prdbook/staging/reviews/{NOME_DO_BRANCH}.md` com o conteúdo completo do relatório.

### Passo 5: Estrutura do relatório

```markdown
## 🔴 Críticos (corrigir antes do merge)
- Quebra de contrato...
- Campo removido que JS espera...

## 🟠 Problemas (devem ser corrigidos)
- Exit no meio do controller...
- Mensagem de erro inconsistente...

## 🟡 Alertas (considerar ajuste)
- Nome de método fora do padrão...
- Memória extra desnecessária...

## 🔵 Oportunidades
- Produto sem documentação no prdbook...

## ✅ Acertos
- O que ficou bom no diff
```

### Passo 6: Verificação de callers

Para toda assinatura de método alterada, fazer grep no repositório para verificar TODOS os callers:

```bash
cd <repo> && grep -rn "nome_do_metodo" --include="*.php" --include="*.js"
```

Anotar no relatório se todos foram atualizados.

### Passo 7: Sugestão de documentação

Se o produto não tem pasta no prdbook:
1. Oferecer para criar a estrutura: `prdbook/{produto}/index.md`, `architecture.md`, etc.
2. Mapear os arquivos principais (controllers, models, components, views)
3. Populá-los após confirmação do usuário

## Regras importantes

1. **Sempre verificar callers** — mudar assinatura de método sem atualizar todos os callers = runtime error
2. **Sempre verificar contratos entre camadas** — o que o PHP retorna deve bater com o que o JS espera
3. **Nunca confiar só no diff** — ler o arquivo completo para contexto de imports, propriedades da classe, etc.
4. **Priorizar críticos primeiro** — se há erros que quebram em produção, listá-los no topo
5. **Sugerir criação de documentação** — produto sem pasta no prdbook = dívida técnica documental
6. **Sempre salvar o relatório** — criar `~/prdbook/staging/reviews/{BRANCH}.md` e retornar apenas o link para o usuário
