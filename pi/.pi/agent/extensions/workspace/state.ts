/**
 * Estado durável do workspace: uma tarefa é um diretório, não uma linha de banco.
 *
 * `runs/<id>/item.json` é a fonte da verdade do run, `questions/` guarda o que
 * espera o humano, `transcript.jsonl` é a conversa crua do filho e `evidence.md`
 * é o artefato que fecha a tarefa. Um único escritor, o processo pai: os filhos
 * headless nunca escrevem aqui.
 *
 * Sem dependência do pi neste arquivo, para o loop poder ser exercitado por script.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const WORKSPACE_HOME = process.env.WORKSPACE_HOME ?? path.join(os.homedir(), ".pi", "workspace");
export const RUNS_DIR = path.join(WORKSPACE_HOME, "runs");
export const LANES_DIR = path.join(WORKSPACE_HOME, "lanes");

export type RunStatus = "queued" | "running" | "waiting_human" | "done" | "failed" | "interrupted";
export type DialogMethod = "select" | "confirm" | "input" | "editor";
export type QuestionState = "pending" | "answered" | "expired";

export interface Question {
	id: string;
	runId: string;
	source: "file" | "dialog";
	method: DialogMethod;
	prompt: string;
	options?: string[];
	/** id do `extension_ui_request` no filho, para a resposta voltar no id certo. */
	dialogId?: string;
	state: QuestionState;
	createdAt: string;
	answeredAt?: string;
	answer?: string;
	/** Sessão do pi que pediu o trabalho, para a resposta voltar à conversa certa. */
	originSessionId: string;
}

export interface WorkItem {
	id: string;
	lane: string;
	repo: string;
	worktree?: string;
	branch?: string;
	prompt: string;
	args: string[];
	status: RunStatus;
	createdAt: string;
	updatedAt: string;
	finishedAt?: string;
	originSessionId: string;
	pid?: number;
	exitCode?: number | null;
	error?: string;
	/** Avisos que não invalidam o trabalho, como rodar sem worktree. */
	notes?: string[];
	/** Último texto do assistente, para o painel e para a evidência. */
	lastText?: string;
	questions: string[];
	policyHash?: string;
}

export const LIVE_STATUSES: RunStatus[] = ["queued", "running", "waiting_human"];

export function nowIso(): string {
	return new Date().toISOString();
}

export function ensureLayout(): void {
	fs.mkdirSync(RUNS_DIR, { recursive: true });
	fs.mkdirSync(LANES_DIR, { recursive: true });
}

export function runDir(id: string): string {
	return path.join(RUNS_DIR, id);
}

export function questionsDir(id: string): string {
	return path.join(runDir(id), "questions");
}

export function laneDir(lane: string): string {
	return path.join(LANES_DIR, lane);
}

export function writeJsonAtomic(file: string, value: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(value, null, "\t")}\n`);
	fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as T;
	} catch {
		return undefined;
	}
}

export function writeItem(item: WorkItem): void {
	writeJsonAtomic(path.join(runDir(item.id), "item.json"), item);
}

export function readItem(id: string): WorkItem | undefined {
	return readJson<WorkItem>(path.join(runDir(id), "item.json"));
}

export function listItems(): WorkItem[] {
	ensureLayout();
	const items: WorkItem[] = [];
	for (const entry of fs.readdirSync(RUNS_DIR, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const item = readItem(entry.name);
		if (item) items.push(item);
	}
	return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function writeQuestion(question: Question): void {
	writeJsonAtomic(path.join(questionsDir(question.runId), `${question.id}.json`), question);
}

export function readQuestion(runId: string, questionId: string): Question | undefined {
	return readJson<Question>(path.join(questionsDir(runId), `${questionId}.json`));
}

export function listQuestions(runId?: string): Question[] {
	const out: Question[] = [];
	for (const item of runId ? [readItem(runId)].filter(Boolean) as WorkItem[] : listItems()) {
		const dir = questionsDir(item.id);
		if (!fs.existsSync(dir)) continue;
		for (const file of fs.readdirSync(dir)) {
			if (!file.endsWith(".json")) continue;
			const question = readJson<Question>(path.join(dir, file));
			if (question) out.push(question);
		}
	}
	return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function pendingQuestions(): Question[] {
	return listQuestions().filter((q) => q.state === "pending");
}

export function nextId(prefix: string): string {
	const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
	const rand = Math.random().toString(36).slice(2, 6);
	return `${prefix}-${stamp}-${rand}`;
}

/** Política da raia: as regras que substituem a pergunta. */
export function policyPath(lane: string): string {
	return path.join(laneDir(lane), "decisions.md");
}

export function readPolicy(lane: string): string {
	try {
		return fs.readFileSync(policyPath(lane), "utf8").trim();
	} catch {
		return "";
	}
}

export function seedPolicy(lane: string): void {
	const file = policyPath(lane);
	if (fs.existsSync(file)) return;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(
		file,
		[
			`# Política da raia ${lane}`,
			"",
			"Regras que o agente aplica sozinho. Pergunte só quando nenhuma regra cobrir o caso.",
			"",
			"## Decisões que param o trabalho",
			"",
			"- Ambiguidade não coberta por esta política: descreva a interpretação escolhida e pergunte.",
			"- Ação irreversível (force-push, delete, deploy, mensagem para cliente): pergunte sempre.",
			"- Validação ou review que falhou depois de 2 tentativas: pare e pergunte.",
			"",
			"## Decisões que o agente toma sozinho",
			"",
			"- Nome de arquivo, estrutura interna, ordem de edição e mensagem de commit local.",
			"- Rodar testes e linters do repositório antes de declarar pronto.",
			"- Reportar o que não conseguiu verificar em vez de supor que passou.",
			"",
		].join("\n"),
	);
}

/** Append-only: a resposta de hoje é a regra de amanhã. */
export function appendDecision(lane: string, question: string, answer: string): void {
	seedPolicy(lane);
	const line = `- [${nowIso().slice(0, 10)}] ${oneLine(question)} -> ${oneLine(answer)}`;
	fs.appendFileSync(policyPath(lane), `${line}\n`);
}

export function oneLine(text: string, max = 180): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
