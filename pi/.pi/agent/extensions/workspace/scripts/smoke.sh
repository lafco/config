#!/usr/bin/env bash
# Prova o loop completo da extensão workspace: despacho em background, pergunta
# durável, resposta em outra sessão e evidência escrita.
#
# Roda um `pi --mode rpc` como cliente, dirige os comandos /workspace e verifica
# os arquivos reais no worktree e no estado. Sai != 0 em qualquer falha.
set -euo pipefail

TMP="$(mktemp -d)"
WS_HOME="$TMP/ws-home"
REPO="$TMP/repo"
LOG="$TMP/parent.log"
ERR="$TMP/parent.err"
FIFO="$TMP/stdin"
TIMEOUT_DISPATCH=240
TIMEOUT_ANSWER=240

cleanup() {
	[[ -n "${PARENT:-}" ]] && kill "$PARENT" 2>/dev/null || true
	rm -f "$FIFO"
}
trap cleanup EXIT

mkdir -p "$REPO"
git -C "$REPO" init -q
printf '# repo de teste\n\nUm arquivo qualquer.\n' >"$REPO/README.md"
git -C "$REPO" add -A
git -C "$REPO" -c user.email=t@example.com -c user.name=t commit -qm init

mkfifo "$FIFO"
WORKSPACE_HOME="$WS_HOME" pi --mode rpc --no-session <"$FIFO" >"$LOG" 2>"$ERR" &
PARENT=$!
exec 3>"$FIFO"

send() { printf '%s\n' "$1" >&3; }
cmd() { jq -cn --arg m "$1" '{id:"c",type:"prompt",message:$m}'; }

PROMPT="Leia README.md. A política da raia não define o nome do arquivo de saída. Escreva PERGUNTA.md pedindo o nome do arquivo e pare sem criar outro arquivo."

send "$(cmd "/workspace dispatch test $REPO -- $PROMPT")"
echo "despachado; aguardando a pergunta..."

deadline=$((SECONDS + TIMEOUT_DISPATCH))
QUESTION_FILE=""
while ((SECONDS < deadline)); do
	QUESTION_FILE="$(find "$WS_HOME/runs" -path '*questions*' -name '*.json' 2>/dev/null | head -1 || true)"
	[[ -n "$QUESTION_FILE" ]] && break
	sleep 2
done
[[ -n "$QUESTION_FILE" ]] || {
	echo "FALHA: nenhuma pergunta apareceu em ${TIMEOUT_DISPATCH}s" >&2
	tail -5 "$LOG" >&2
	exit 1
}

RUN_ID="$(jq -r .runId "$QUESTION_FILE")"
Q_ID="$(jq -r .id "$QUESTION_FILE")"
echo "pergunta persistida: $RUN_ID/$Q_ID"
jq -r .prompt "$QUESTION_FILE" | head -5

# O processo pai pode morrer aqui e a pergunta continua em disco.
send "$(cmd "/workspace answer $RUN_ID/$Q_ID Use o nome RESULTADO.md")"
echo "respondida; aguardando o filho retomar..."

deadline=$((SECONDS + TIMEOUT_ANSWER))
STATUS=""
while ((SECONDS < deadline)); do
	STATUS="$(jq -r .status "$WS_HOME/runs/$RUN_ID/item.json" 2>/dev/null || echo "")"
	[[ "$STATUS" == "done" || "$STATUS" == "failed" ]] && break
	sleep 2
done
[[ "$STATUS" == "done" ]] || {
	echo "FALHA: status final '$STATUS'" >&2
	tail -20 "$LOG" >&2
	exit 1
}

WORKTREE="$(jq -r '.worktree // .repo' "$WS_HOME/runs/$RUN_ID/item.json")"
[[ -f "$WORKTREE/RESULTADO.md" ]] || {
	echo "FALHA: o filho não escreveu RESULTADO.md em $WORKTREE" >&2
	ls -la "$WORKTREE" >&2
	exit 1
}
[[ -f "$WS_HOME/runs/$RUN_ID/evidence.md" ]] || { echo "FALHA: sem evidence.md" >&2; exit 1; }
grep -q -- "-> Use o nome RESULTADO.md" "$WS_HOME/lanes/test/decisions.md" ||
	{ echo "FALHA: a resposta não virou regra na política" >&2; exit 1; }

echo "fase 1 ok: pergunta durável, resposta aplicada, RESULTADO.md escrito, evidência e política"

# Fase 2: o filho morre com a pergunta pendente e a resposta chega depois,
# em outra sessão. O run precisa ser redespachado com a resposta no contexto.
MARKER="$TMP/marker2"
touch "$MARKER"
sleep 1
send "$(cmd "/workspace dispatch test2 $REPO -- $PROMPT")"
QUESTION_FILE2=""
deadline=$((SECONDS + TIMEOUT_DISPATCH))
while ((SECONDS < deadline)); do
	QUESTION_FILE2="$(find "$WS_HOME/runs" -path '*questions*' -name '*.json' -newer "$MARKER" 2>/dev/null | head -1 || true)"
	[[ -n "$QUESTION_FILE2" ]] && break
	sleep 2
done
[[ -n "$QUESTION_FILE2" ]] || { echo "FALHA: fase 2 sem pergunta" >&2; exit 1; }

RUN2="$(jq -r .runId "$QUESTION_FILE2")"
Q2="$(jq -r .id "$QUESTION_FILE2")"
CHILD_PID="$(jq -r .pid "$WS_HOME/runs/$RUN2/item.json")"
kill -9 "$CHILD_PID" 2>/dev/null || true
sleep 3
echo "filho $RUN2 morto; respondendo fora da sessão..."

send "$(cmd "/workspace answer $RUN2/$Q2 Use o nome RESULTADO2.md")"
deadline=$((SECONDS + TIMEOUT_ANSWER))
NEW_RUN=""
while ((SECONDS < deadline)); do
	NEW_RUN="$(jq -r '.id' "$WS_HOME"/runs/*/item.json 2>/dev/null | grep -v -e "$RUN_ID" -e "$RUN2" | head -1 || true)"
	if [[ -n "$NEW_RUN" ]]; then
		STATUS2="$(jq -r .status "$WS_HOME/runs/$NEW_RUN/item.json")"
		[[ "$STATUS2" == "done" || "$STATUS2" == "failed" ]] && break
	fi
	sleep 2
done
[[ "$(jq -r .status "$WS_HOME/runs/$NEW_RUN/item.json" 2>/dev/null)" == "done" ]] || {
	echo "FALHA: o redespacho não terminou ($NEW_RUN)" >&2
	exit 1
}
WORKTREE2="$(jq -r '.worktree // .repo' "$WS_HOME/runs/$NEW_RUN/item.json")"
[[ -f "$WORKTREE2/RESULTADO2.md" ]] || { echo "FALHA: redespacho não escreveu RESULTADO2.md em $WORKTREE2" >&2; exit 1; }

echo "check ok: pergunta durável, resposta aplicada, filho morto redespachado com a resposta, evidência e política"
