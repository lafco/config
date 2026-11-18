/**
 * Runner: um `pi --mode rpc` por tarefa, em worktree própria.
 *
 * O filho não recebe a conversa do pai, só a política da raia e a tarefa. Quando
 * ele precisa de uma decisão, escreve `PERGUNTA.md` no worktree e para; se uma
 * extensão dele abrir um diálogo, o pedido chega por `extension_ui_request`. Nos
 * dois casos o pedido vira um `Question` durável em disco antes de qualquer
 * resposta, porque o humano pode responder horas depois, em outra sessão.
 *
 * Sem dependência do pi neste arquivo, para o loop poder ser exercitado por script.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	appendDecision,
	ensureLayout,
	nowIso,
	oneLine,
	type Question,
	readPolicy,
	runDir,
	seedPolicy,
	writeItem,
	writeQuestion,
	type WorkItem,
} from "./state.ts";

const QUESTION_FILE = "PERGUNTA.md";
const MAX_TEXT = 200_000;

export interface RunnerEvents {
	onItem(): void;
	onQuestion(item: WorkItem, question: Question): void;
	onLine(item: WorkItem, line: string): void;
}

const active = new Map<string, Runner>();

export function getRunner(id: string): Runner | undefined {
	return active.get(id);
}

export function liveRunners(): Runner[] {
	return [...active.values()];
}

export function shutdownAll(): void {
	for (const runner of active.values()) runner.cancel();
	active.clear();
}

function git(repo: string, args: string[]): { ok: boolean; stdout: string } {
	const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
	return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
}

/** Um worktree por tarefa: dois agentes no mesmo checkout corrompem o estado um do outro. */
export function prepareWorktree(repo: string, id: string): { worktree?: string; branch?: string; error?: string } {
	if (!git(repo, ["rev-parse", "--git-dir"]).ok) return {};
	const base = git(repo, ["rev-parse", "HEAD"]).stdout;
	if (!base) return { error: `${repo} não tem commit; rodando sem worktree` };
	const branch = `workspace/${id}`;
	const worktree = path.join(repo, ".worktrees", id);
	const added = spawnSync("git", ["-C", repo, "worktree", "add", "-b", branch, worktree, base], { encoding: "utf8" });
	if (added.status !== 0) return { error: `git worktree falhou: ${(added.stderr ?? "").trim()}` };
	return { worktree, branch };
}

export function buildPrompt(item: WorkItem, policy: string): string {
	const lines = [
		`# Tarefa ${item.id} (raia ${item.lane})`,
		"",
		`Repositório: ${item.repo}`,
		item.worktree ? `Worktree: ${item.worktree}` : "",
		"",
		"## Política desta raia",
		"",
		policy || "(sem política registrada; então pergunte quando a escolha muda o resultado)",
		"",
		"## Regra de decisão",
		"",
		"- Se uma regra da política cobre o caso, decida sozinho e diga qual regra aplicou.",
		`- Se nada cobre e a escolha muda o resultado, escreva ${QUESTION_FILE} no diretório atual, com a pergunta em uma frase, as opções e o que você já sabe. Depois pare e não invente a decisão.`,
		"- Nunca espere resposta dentro do mesmo turno: o humano pode responder depois.",
		"",
		"## Tarefa",
		"",
		item.prompt,
	];
	return lines.filter((line) => line !== "").join("\n");
}

export class Runner {
	item: WorkItem;
	private child?: ChildProcess;
	private buffer = "";
	private startedAt = Date.now();
	private settled = false;
	private events: RunnerEvents;
	private answering = false;

	constructor(item: WorkItem, events: RunnerEvents) {
		this.item = item;
		this.events = events;
	}

	start(policy: string): void {
		ensureLayout();
		const cwd = this.item.worktree ?? this.item.repo;
		const args = ["--mode", "rpc", "--no-session", ...this.item.args];
		const child = spawn("pi", args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, WORKSPACE_RUN_ID: this.item.id, WORKSPACE_LANE: this.item.lane },
		});
		this.child = child;
		active.set(this.item.id, this);

		this.item.status = "running";
		this.item.pid = child.pid;
		this.item.updatedAt = nowIso();
		writeItem(this.item);

		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => this.onData(chunk));
		child.stderr?.on("data", (chunk: string) => {
			fs.appendFileSync(path.join(runDir(this.item.id), "stderr.log"), chunk);
		});
		child.on("error", (error: Error) => this.finish("failed", error.message));
		child.on("exit", (code: number | null) => this.onExit(code));

		this.write({ id: "prompt-1", type: "prompt", message: buildPrompt(this.item, policy) });
		this.events.onItem();
	}

	private write(record: unknown): void {
		if (!this.child?.stdin?.writable) return;
		this.child.stdin.write(`${JSON.stringify(record)}\n`);
	}

	private onData(chunk: string): void {
		this.buffer += chunk;
		let index = this.buffer.indexOf("\n");
		while (index >= 0) {
			const line = this.buffer.slice(0, index).replace(/\r$/, "");
			this.buffer = this.buffer.slice(index + 1);
			if (line.trim()) this.onRecord(line);
			index = this.buffer.indexOf("\n");
		}
	}

	private onRecord(line: string): void {
		fs.appendFileSync(path.join(runDir(this.item.id), "transcript.jsonl"), `${line}\n`);
		let record: Record<string, unknown>;
		try {
			record = JSON.parse(line) as Record<string, unknown>;
		} catch {
			return;
		}
		const type = record.type as string | undefined;
		if (type === "extension_ui_request") {
			this.onDialog(record);
			return;
		}
		if (type === "message_end") {
			const text = assistantText(record.message);
			if (text) {
				this.item.lastText = text.slice(0, MAX_TEXT);
				this.item.updatedAt = nowIso();
				writeItem(this.item);
			}
			return;
		}
		if (type === "response" && record.success === false) {
			this.item.error = String(record.error ?? "erro de RPC");
			this.events.onLine(this.item, `${type}: ${this.item.error}`);
			return;
		}
		if (type === "agent_settled") this.onSettled();
	}

	private onDialog(record: Record<string, unknown>): void {
		const method = record.method as string;
		if (!["select", "confirm", "input", "editor"].includes(method)) return;
		const prompt = [record.title, record.message].filter(Boolean).join("\n") || `(diálogo ${method})`;
		const question = this.newQuestion({
			source: "dialog",
			method: method as Question["method"],
			prompt,
			options: Array.isArray(record.options) ? (record.options as string[]) : undefined,
			dialogId: String(record.id),
		});
		this.waitForHuman(question);
	}

	private onSettled(): void {
		if (this.settled) return;
		const pending = this.readQuestionFile();
		if (pending) {
			const question = this.newQuestion({ source: "file", method: "input", prompt: pending, options: undefined });
			this.waitForHuman(question);
			return;
		}
		this.finish(this.item.error ? "failed" : "done");
	}

	private waitForHuman(question: Question): void {
		this.item.status = "waiting_human";
		this.item.updatedAt = nowIso();
		this.item.questions.push(question.id);
		writeItem(this.item);
		writeQuestion(question);
		this.events.onQuestion(this.item, question);
	}

	private readQuestionFile(): string | undefined {
		const cwd = this.item.worktree ?? this.item.repo;
		const file = path.join(cwd, QUESTION_FILE);
		try {
			const stat = fs.statSync(file);
			if (stat.mtimeMs < this.startedAt) return undefined;
			const text = fs.readFileSync(file, "utf8").trim();
			return text || undefined;
		} catch {
			return undefined;
		}
	}

	private newQuestion(input: {
		source: Question["source"];
		method: Question["method"];
		prompt: string;
		options?: string[];
		dialogId?: string;
	}): Question {
		const seq = this.item.questions.length + 1;
		return {
			id: `q${seq}`,
			runId: this.item.id,
			source: input.source,
			method: input.method,
			prompt: input.prompt,
			options: input.options,
			dialogId: input.dialogId,
			state: "pending",
			createdAt: nowIso(),
			originSessionId: this.item.originSessionId,
		};
	}

	/**
	 * Resposta chegou. O filho pode estar vivo (retoma o turno) ou morto (o
	 * chamador redespacha com a resposta no contexto). Devolve o que aconteceu.
	 */
	resume(question: Question, answer: string): { resumed: boolean } {
		question.state = "answered";
		question.answer = answer;
		question.answeredAt = nowIso();
		writeQuestion(question);
		appendDecision(this.item.lane, question.prompt, answer);

		const alive = this.child && this.child.exitCode === null && !this.child.killed;
		if (!alive) return { resumed: false };

		if (question.source === "dialog") {
			const response: Record<string, unknown> = {
				type: "extension_ui_response",
				id: question.dialogId ?? question.id,
			};
			if (question.method === "confirm") response.confirmed = /^(s|sim|y|yes|true)$/i.test(answer.trim());
			else if (question.method === "select") response.value = answer;
			else response.value = answer;
			this.answering = true;
			this.write(response);
		}
		this.item.status = "running";
		this.item.updatedAt = nowIso();
		writeItem(this.item);
		this.events.onItem();
		if (question.source === "file") {
			const message = [
				`Resposta à sua pergunta pendente (${question.id}):`,
				"",
				question.prompt,
				"",
				`Resposta: ${answer}`,
				"",
				`Retome a tarefa a partir daí. Apague ou reescreva ${QUESTION_FILE} se ela deixou de valer.`,
			].join("\n");
			this.write({ id: `answer-${question.id}`, type: "prompt", message });
		}
		return { resumed: true };
	}

	private onExit(code: number | null): void {
		if (this.settled) return;
		this.item.exitCode = code;
		const pending = this.readQuestionFile();
		if (pending && code === 0) {
			const question = this.newQuestion({ source: "file", method: "input", prompt: pending });
			this.waitForHuman(question);
			return;
		}
		this.finish(code === 0 ? "done" : "failed", code === 0 ? undefined : `processo saiu com código ${code}`);
	}

	finish(status: WorkItem["status"], error?: string): void {
		if (this.settled) return;
		this.settled = true;
		this.item.status = status;
		this.item.error = error ?? this.item.error;
		this.item.exitCode = this.child?.exitCode ?? null;
		this.item.finishedAt = nowIso();
		this.item.updatedAt = this.item.finishedAt;
		writeItem(this.item);
		this.writeEvidence();
		active.delete(this.item.id);
		if (this.child && this.child.exitCode === null) {
			if (this.child.stdin?.writable) this.child.stdin.end();
			this.child.kill("SIGTERM");
		}
		this.events.onItem();
	}

	private writeEvidence(): void {
		const seconds = Math.round((Date.now() - this.startedAt) / 1000);
		const lines = [
			`# Evidência — ${this.item.id}`,
			"",
			`- **Status:** ${this.item.status}`,
			`- **Raia:** ${this.item.lane}`,
			`- **Repositório:** ${this.item.repo}`,
			this.item.worktree ? `- **Worktree:** ${this.item.worktree}` : "",
			this.item.branch ? `- **Branch:** ${this.item.branch}` : "",
			`- **Duração:** ${seconds}s`,
			this.item.exitCode !== undefined ? `- **Saída do processo:** ${this.item.exitCode}` : "",
			this.item.error ? `- **Erro:** ${this.item.error}` : "",
			...(this.item.notes ?? []).map((note) => `- **Aviso:** ${note}`),
			`- **Perguntas:** ${this.item.questions.length}`,
			"",
			"## Último texto do agente",
			"",
			this.item.lastText ?? "(sem texto final capturado)",
			"",
			"## Arquivos",
			"",
			`- transcript: ${path.join(runDir(this.item.id), "transcript.jsonl")}`,
			`- stderr: ${path.join(runDir(this.item.id), "stderr.log")}`,
			"",
		];
		fs.writeFileSync(path.join(runDir(this.item.id), "evidence.md"), lines.filter((l) => l !== "").join("\n"));
	}

	cancel(): void {
		if (this.settled) return;
		this.item.error = "cancelado pelo humano";
		this.finish("interrupted");
	}
}

function assistantText(message: unknown): string {
	const msg = message as { role?: string; content?: unknown } | undefined;
	if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) return "";
	return msg.content
		.filter((part): part is { type: string; text: string } => {
			const p = part as { type?: string; text?: string };
			return p.type === "text" && typeof p.text === "string";
		})
		.map((part) => part.text)
		.join("\n")
		.trim();
}

export function dispatch(
	item: WorkItem,
	events: RunnerEvents,
	options: { worktree?: boolean } = {},
): { item: WorkItem; runner: Runner } {
	ensureLayout();
	seedPolicy(item.lane);
	const policy = readPolicy(item.lane);
	item.policyHash = policy ? oneLine(policy, 60) : undefined;

	if (options.worktree !== false && !item.worktree) {
		const prepared = prepareWorktree(item.repo, item.id);
		if (prepared.worktree) {
			item.worktree = prepared.worktree;
			item.branch = prepared.branch;
		}
		if (prepared.error) item.notes = [...(item.notes ?? []), prepared.error];
	}

	const runner = new Runner(item, events);
	runner.start(policy);
	return { item, runner };
}

export { QUESTION_FILE };
