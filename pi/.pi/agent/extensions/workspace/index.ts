/**
 * Extensão `workspace` — dispatch de tarefas em background e fila de atenção.
 *
 * O comando `/workspace` cria e acompanha tarefas; o widget mostra o que está
 * rodando e o que espera resposta. O estado vive em `~/.pi/workspace` e é escrito
 * só por este processo, então ele sobrevive a fechar a conversa: a pergunta
 * continua na fila e pode ser respondida em outra sessão.
 *
 * Este arquivo é o adaptador do pi. `state.ts` e `runner.ts` são Node puro.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { dispatch, getRunner, liveRunners, shutdownAll } from "./runner.ts";
import {
	appendDecision,
	ensureLayout,
	LIVE_STATUSES,
	listItems,
	nextId,
	nowIso,
	oneLine,
	pendingQuestions,
	policyPath,
	readItem,
	readPolicy,
	readQuestion,
	runDir,
	seedPolicy,
	WORKSPACE_HOME,
	writeItem,
	writeQuestion,
	type WorkItem,
} from "./state.ts";

const WIDGET_KEY = "workspace";
const REFRESH_MS = 2000;

const HELP = [
	"workspace:",
	"  /workspace                                 status, ativos e fila",
	"  /workspace dispatch <raia> <repo> -- <tarefa>",
	"  /workspace inbox                           perguntas esperando você",
	"  /workspace answer <run>/<q> <resposta>",
	"  /workspace log <run> [linhas]              fim da conversa do filho",
	"  /workspace cancel <run>",
	"  /workspace policy <raia>                   regras que substituem a pergunta",
	"",
	`estado em ${WORKSPACE_HOME}`,
].join("\n");

export default function (pi: ExtensionAPI) {
	let refresh: NodeJS.Timeout | undefined;
	let lastCtx: ExtensionCommandContext | undefined;

	const events = {
		onItem: () => render(),
		onQuestion: (_item: WorkItem, question: { id: string; runId: string; prompt: string }) => {
			lastCtx?.ui.notify(`workspace: ${question.runId}/${question.id} espera você — ${oneLine(question.prompt, 80)}`, "info");
			render();
		},
		onLine: (item: WorkItem, line: string) => {
			if (line.includes("error")) lastCtx?.ui.notify(`workspace ${item.id}: ${oneLine(line, 120)}`, "error");
		},
	};

	function render(): void {
		const ctx = lastCtx;
		if (!ctx?.hasUI) return;
		const items = listItems();
		const live = items.filter((item) => LIVE_STATUSES.includes(item.status));
		const pending = pendingQuestions();
		if (live.length === 0 && pending.length === 0) {
			ctx.ui.setWidget(WIDGET_KEY, []);
			return;
		}
		const lines = [`workspace  ${live.length} ativo  ${pending.length} esperando você`];
		for (const item of live.slice(0, 4)) {
			lines.push(`  ${item.id}  ${item.status}  ${path.basename(item.repo)}  ${oneLine(item.prompt, 44)}`);
		}
		for (const question of pending.slice(0, 3)) {
			lines.push(`  ? ${question.runId}/${question.id}  ${oneLine(question.prompt, 56)}`);
		}
		if (pending.length > 3) lines.push(`  ? mais ${pending.length - 3} na fila`);
		ctx.ui.setWidget(WIDGET_KEY, lines);
	}

	function findQuestion(target: string): { item: WorkItem; questionId: string } | undefined {
		const [runId, questionId] = target.includes("/") ? target.split("/") : [target, ""];
		const item = readItem(runId);
		if (!item) return undefined;
		const id = questionId || item.questions[item.questions.length - 1];
		return id ? { item, questionId: id } : undefined;
	}

	pi.on("session_start", async (_event, ctx) => {
		ensureLayout();
		if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
		lastCtx = ctx as ExtensionCommandContext;
		refresh = setInterval(render, REFRESH_MS);
		render();
	});

	pi.on("session_shutdown", async () => {
		if (refresh) clearInterval(refresh);
		shutdownAll();
	});

	pi.registerCommand("workspace", {
		description: "Tarefas em background e fila de perguntas (status, dispatch, inbox, answer, log, cancel)",
		handler: async (args, ctx) => {
			lastCtx = ctx;
			const trimmed = args.trim();
			const [verb = "status", ...rest] = trimmed.split(/\s+/);
			ensureLayout();

			if (verb === "status" || verb === "") {
				const items = listItems();
				if (items.length === 0) {
					ctx.ui.notify(`nenhuma tarefa ainda.\n\n${HELP}`, "info");
					return;
				}
				const lines = items.slice(0, 8).map((item) => {
					const when = item.updatedAt.slice(11, 19);
					return `${item.id}  ${item.status.padEnd(13)} ${when}  ${item.lane}  ${oneLine(item.prompt, 50)}`;
				});
				const pending = pendingQuestions();
				if (pending.length > 0) {
					lines.push("", "esperando você:");
					for (const q of pending.slice(0, 5)) lines.push(`  ${q.runId}/${q.id}  ${oneLine(q.prompt, 70)}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
				render();
				return;
			}

			if (verb === "dispatch") {
				const raw = rest.join(" ");
				const [head, ...tail] = raw.split("--");
				const [lane, repo] = head.trim().split(/\s+/);
				const prompt = tail.join("--").trim();
				if (!lane || !repo || !prompt) {
					ctx.ui.notify("uso: /workspace dispatch <raia> <repo> -- <tarefa>", "error");
					return;
				}
				const repoPath = path.resolve(ctx.cwd, repo);
				if (!fs.existsSync(repoPath)) {
					ctx.ui.notify(`repo inexistente: ${repoPath}`, "error");
					return;
				}
				if (liveRunners().some((runner) => runner.item.lane === lane)) {
					ctx.ui.notify(`raia ${lane} já tem tarefa rodando; espere terminar`, "error");
					return;
				}
				const id = nextId("run");
				const item: WorkItem = {
					id,
					lane,
					repo: repoPath,
					prompt,
					args: [],
					status: "queued",
					createdAt: nowIso(),
					updatedAt: nowIso(),
					originSessionId: ctx.sessionManager.getSessionId(),
					questions: [],
				};
				writeItem(item);
				ctx.ui.notify(`despachado ${id} na raia ${lane}`, "info");
				dispatch(item, events);
				render();
				return;
			}

			if (verb === "inbox") {
				const pending = pendingQuestions();
				if (pending.length === 0) {
					ctx.ui.notify("nada esperando você", "info");
					return;
				}
				const lines: string[] = [];
				for (const q of pending) {
					lines.push(`${q.runId}/${q.id}  (${q.source}, raia do run)`);
					lines.push(...q.prompt.split("\n").map((line) => `  ${line}`));
					if (q.options?.length) lines.push(`  opções: ${q.options.join(" | ")}`);
					lines.push(`  responder: /workspace answer ${q.runId}/${q.id} <resposta>`, "");
				}
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			if (verb === "answer") {
				const target = rest[0];
				const answer = rest.slice(1).join(" ").trim();
				if (!target || !answer) {
					ctx.ui.notify("uso: /workspace answer <run>/<q> <resposta>", "error");
					return;
				}
				const found = findQuestion(target);
				if (!found) {
					ctx.ui.notify(`pergunta não encontrada: ${target}`, "error");
					return;
				}
				const question = readQuestion(found.item.id, found.questionId);
				if (!question) {
					ctx.ui.notify(`pergunta não encontrada: ${target}`, "error");
					return;
				}
				const runner = getRunner(found.item.id);
				const resumed = runner ? runner.resume(question, answer).resumed : false;
				if (resumed) {
					ctx.ui.notify(`respondida ${target}; o run retomou`, "info");
				} else {
					if (question.state !== "answered") {
						question.state = "answered";
						question.answer = answer;
						question.answeredAt = nowIso();
						writeQuestion(question);
						appendDecision(found.item.lane, question.prompt, answer);
					}
					const retry: WorkItem = {
						...found.item,
						id: nextId("run"),
						status: "queued",
						createdAt: nowIso(),
						updatedAt: nowIso(),
						finishedAt: undefined,
						exitCode: undefined,
						error: undefined,
						questions: [],
						prompt: [
							found.item.prompt,
							"",
							`Pergunta anterior respondida (${question.id}): ${oneLine(question.prompt, 300)}`,
							`Resposta: ${answer}`,
						].join("\n"),
					};
					writeItem(retry);
					dispatch(retry, events);
					ctx.ui.notify(`run ${found.item.id} estava parado; redespachado como ${retry.id} com a resposta`, "info");
				}
				render();
				return;
			}

			if (verb === "log") {
				const runId = rest[0];
				const count = Number(rest[1] ?? 15) || 15;
				if (!runId) {
					ctx.ui.notify("uso: /workspace log <run> [linhas]", "error");
					return;
				}
				const file = path.join(runDir(runId), "transcript.jsonl");
				try {
					const lines = fs.readFileSync(file, "utf8").trim().split("\n").slice(-count);
					const text = lines
						.map((line) => {
							try {
								const record = JSON.parse(line) as Record<string, unknown>;
								if (record.type === "message_end") {
									const message = record.message as { role?: string; content?: { type?: string; text?: string }[] };
									const body = (message.content ?? [])
										.map((part) => (part.type === "text" ? part.text : part.type === "tool_use" ? `[tool ${String((part as { name?: string }).name)}]` : ""))
										.filter(Boolean)
										.join(" ");
									return `${message.role}: ${oneLine(body, 220)}`;
								}
								return `${String(record.type)}${record.event ? `:${String(record.event)}` : ""}`;
							} catch {
								return oneLine(line, 120);
							}
						})
						.join("\n");
					ctx.ui.notify(text || "(transcript vazio)", "info");
				} catch {
					ctx.ui.notify(`sem transcript para ${runId}`, "error");
				}
				return;
			}

			if (verb === "cancel") {
				const runId = rest[0];
				const runner = runId ? getRunner(runId) : undefined;
				if (!runner) {
					ctx.ui.notify(`run não está ativo: ${runId ?? "(nenhum)"}`, "error");
					return;
				}
				runner.cancel();
				ctx.ui.notify(`cancelado ${runId}`, "info");
				render();
				return;
			}

			if (verb === "policy") {
				const lane = rest[0];
				if (!lane) {
					ctx.ui.notify("uso: /workspace policy <raia>", "error");
					return;
				}
				seedPolicy(lane);
				const text = readPolicy(lane);
				ctx.ui.notify(`${policyPath(lane)}\n\n${text}`, "info");
				return;
			}

			ctx.ui.notify(HELP, "info");
		},
	});
}
