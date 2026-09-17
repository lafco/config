/**
 * Leitura e escrita dos artefatos do refinamento (`~/epics/<KEY>/`).
 *
 * Funções puras (parse de frontmatter, seleção de onda, conflito de arquivos)
 * ficam testáveis isoladamente; o I/O de arquivo fica nas poucas funções que
 * realmente tocam o disco.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Status que não voltam para a fila. */
const DONE_STATUSES = new Set(["pronto", "concluido", "concluído", "done", "cancelado", "cancelada"]);

export interface TaskFile {
	id: string;
	title: string;
	/** Slug do nome do arquivo (parte depois de `TASK-NN-`). */
	slug: string;
	/** Caminho absoluto do arquivo da tarefa. */
	file: string;
	wave: number;
	dependsOn: string[];
	status: string;
	repo?: string;
	branch?: string;
	filesLikelyTouched: string[];
	validationKind?: string;
	validationEnvironment?: string;
	validationCompany?: string;
	validationRegister?: string;
	validationExpected?: string;
	kind?: string;
}

export interface StoryDir {
	key: string;
	dir: string;
	tasksDir: string;
	evidenceDir: string;
	indexFile: string;
	tasks: TaskFile[];
}

// ---------------------------------------------------------------------------
// Frontmatter (subconjunto de YAML usado pelo template da tarefa)
// ---------------------------------------------------------------------------

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
	) {
		return trimmed
			.slice(1, -1)
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
	}
	return trimmed;
}

/** Quebra `a, "b, c", d` respeitando aspas. */
function splitInlineList(inner: string): string[] {
	const items: string[] = [];
	let current = "";
	let quote: string | null = null;
	for (const char of inner) {
		if (quote) {
			if (char === quote) quote = null;
			current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === ",") {
			items.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	items.push(current);
	return items.map((item) => unquote(item)).filter((item) => item.length > 0);
}

export function parseScalar(raw: string): unknown {
	const value = raw.trim();
	if (value === "" || value === '""' || value === "''") return "";
	if (value === "[]") return [];
	if (value.startsWith("[") && value.endsWith("]")) {
		return splitInlineList(value.slice(1, -1));
	}
	if (value === "true") return true;
	if (value === "false") return false;
	if (/^-?\d+$/.test(value)) return Number(value);
	return unquote(value);
}

/** Extrai o bloco `---` inicial do markdown como pares chave/valor. */
export function parseFrontmatter(markdown: string): Record<string, unknown> {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
	if (!match) return {};
	const data: Record<string, unknown> = {};
	for (const line of match[1]!.split(/\r?\n/)) {
		const separator = line.indexOf(":");
		if (separator <= 0) continue;
		const key = line.slice(0, separator).trim();
		if (!key || key.startsWith("#")) continue;
		data[key] = parseScalar(line.slice(separator + 1));
	}
	return data;
}

function asString(value: unknown): string | undefined {
	if (typeof value === "string") return value.trim() || undefined;
	if (typeof value === "number") return String(value);
	return undefined;
}

function asNumber(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
	return fallback;
}

function asStringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
	const single = asString(value);
	return single ? [single] : [];
}

/** Primeiro heading `# ID — título` do arquivo. */
function titleFromMarkdown(markdown: string, fallback: string): string {
	const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
	if (!heading) return fallback;
	const dash = heading.indexOf("—");
	return dash > 0 ? heading.slice(dash + 1).trim() : heading;
}

// ---------------------------------------------------------------------------
// Leitura da story
// ---------------------------------------------------------------------------

export function taskSlug(fileName: string): string {
	return fileName.replace(/^TASK-\d+-/, "").replace(/\.md$/, "");
}

export function readTaskFile(file: string): TaskFile {
	const markdown = fs.readFileSync(file, "utf8");
	const front = parseFrontmatter(markdown);
	const fileName = path.basename(file);
	const id = asString(front.id) ?? `TASK-${/(\d+)/.exec(fileName)?.[1] ?? "00"}`;
	return {
		id,
		title: asString(front.summary) ?? titleFromMarkdown(markdown, fileName),
		slug: taskSlug(fileName),
		file,
		wave: asNumber(front.wave, 1),
		dependsOn: asStringList(front.depends_on),
		status: asString(front.status) ?? "backlog",
		repo: asString(front.repo),
		branch: asString(front.branch),
		filesLikelyTouched: asStringList(front.files_likely_touched),
		kind: asString(front.kind),
		validationKind: asString(front.validation_kind),
		validationEnvironment: asString(front.validation_environment),
		validationCompany: asString(front.validation_company),
		validationRegister: asString(front.validation_register),
		validationExpected: asString(front.validation_expected),
	};
}

/** Lê a pasta da story (`<epicsDir>/<KEY>`) e suas tarefas. */
export function readStory(storyKey: string, epicsDir: string): StoryDir {
	const key = storyKey.trim().toUpperCase();
	const dir = path.join(epicsDir, key);
	if (!fs.existsSync(dir)) {
		throw new Error(`Pasta da story não encontrada: ${dir}`);
	}
	const tasksDir = path.join(dir, "tasks");
	const files = fs.existsSync(tasksDir)
		? fs
				.readdirSync(tasksDir)
				.filter((name) => /^TASK-\d+-.+\.md$/.test(name))
				.sort()
		: [];
	const tasks = files.map((name) => readTaskFile(path.join(tasksDir, name)));
	return {
		key,
		dir,
		tasksDir,
		evidenceDir: path.join(dir, "evidence"),
		indexFile: path.join(dir, "index.md"),
		tasks,
	};
}

// ---------------------------------------------------------------------------
// Seleção de onda e conflitos
// ---------------------------------------------------------------------------

function isDone(status: string): boolean {
	return DONE_STATUSES.has(status.trim().toLowerCase());
}

export interface ReadyWave {
	wave: number | null;
	tasks: TaskFile[];
	/** Tarefas da onda pedida que ainda esperam dependência. */
	blockedByDependencies: TaskFile[];
}

/**
 * Próxima onda pronta: tarefas não concluídas cujas dependências já
 * terminaram, priorizando a menor onda. Com `requestedWave`, restringe a ela.
 */
export function selectReadyWave(tasks: TaskFile[], requestedWave?: number): ReadyWave {
	const done = new Set(tasks.filter((task) => isDone(task.status)).map((task) => task.id));
	const pending = tasks.filter((task) => !isDone(task.status));
	const readyOf = (task: TaskFile): boolean => task.dependsOn.every((dependency) => done.has(dependency));

	let candidates = pending;
	if (typeof requestedWave === "number") {
		candidates = pending.filter((task) => task.wave === requestedWave);
	}
	const ready = candidates.filter(readyOf);
	const waiting = candidates.filter((task) => !readyOf(task));

	if (typeof requestedWave === "number") {
		return { wave: requestedWave, tasks: ready, blockedByDependencies: waiting };
	}
	if (ready.length === 0) return { wave: null, tasks: [], blockedByDependencies: [] };

	const wave = Math.min(...ready.map((task) => task.wave));
	return {
		wave,
		tasks: ready.filter((task) => task.wave === wave),
		blockedByDependencies: [],
	};
}

/** Arquivos declarados por mais de uma tarefa (mesmo repositório). */
export function detectFileConflicts(tasks: TaskFile[]): string[] {
	const owners = new Map<string, string>();
	const conflicts: string[] = [];
	for (const task of tasks) {
		const repo = (task.repo ?? "").trim();
		for (const file of task.filesLikelyTouched) {
			const key = `${repo}::${file}`;
			const owner = owners.get(key);
			if (owner && owner !== task.id) {
				conflicts.push(`${owner} e ${task.id} declaram o mesmo arquivo (${file}).`);
			} else {
				owners.set(key, task.id);
			}
		}
	}
	return conflicts;
}

// ---------------------------------------------------------------------------
// Escrita de status e evidência
// ---------------------------------------------------------------------------

const STATUS_LINE = /^(\s*status:\s*).*$/m;

export function setTaskStatus(file: string, status: string): void {
	const markdown = fs.readFileSync(file, "utf8");
	const next = STATUS_LINE.test(markdown)
		? markdown.replace(STATUS_LINE, `$1${status}`)
		: markdown;
	fs.writeFileSync(file, next, "utf8");
}

function splitRow(line: string): string[] {
	return line
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

function joinRow(cells: string[]): string {
	return `| ${cells.join(" | ")} |`;
}

function taskIdOfCell(cell: string): string | undefined {
	return /(TASK-\d+)/.exec(cell)?.[1];
}

/**
 * Atualiza a linha da tarefa na tabela do `index.md` (Status e, quando houver,
 * a coluna Evidência). Funciona tanto no índice da story quanto no índice
 * plano — as colunas são descobertas pelo cabeçalho.
 */
export function updateIndexRow(
	indexFile: string,
	taskId: string,
	updates: { status?: string; evidence?: string },
): boolean {
	if (!fs.existsSync(indexFile)) return false;
	const lines = fs.readFileSync(indexFile, "utf8").split("\n");
	let header: string[] | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (!line.trim().startsWith("|")) continue;
		const cells = splitRow(line);
		if (cells[0]?.toUpperCase() !== "ID") continue;
		header = cells;
		for (let j = i + 1; j < lines.length; j++) {
			const row = lines[j]!;
			if (!row.trim().startsWith("|")) break;
			const rowCells = splitRow(row);
			if (taskIdOfCell(rowCells[0] ?? "") !== taskId) continue;

			if (updates.status !== undefined) {
				const column = header.findIndex((name) => name.toLowerCase() === "status");
				if (column >= 0) rowCells[column] = updates.status;
			}
			if (updates.evidence !== undefined) {
				const column = header.findIndex((name) => name.toLowerCase().startsWith("evid"));
				if (column >= 0) rowCells[column] = updates.evidence;
			}
			lines[j] = joinRow(rowCells);
			fs.writeFileSync(indexFile, lines.join("\n"), "utf8");
			return true;
		}
		return false;
	}
	return false;
}

export function writeEvidence(story: StoryDir, task: TaskFile, content: string): string {
	fs.mkdirSync(story.evidenceDir, { recursive: true });
	const file = path.join(story.evidenceDir, `${task.id}-${task.slug}.md`);
	fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`, "utf8");
	return file;
}
