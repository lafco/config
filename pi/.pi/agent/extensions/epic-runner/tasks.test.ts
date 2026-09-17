import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	detectFileConflicts,
	parseFrontmatter,
	parseScalar,
	readTaskFile,
	selectReadyWave,
	setTaskStatus,
	updateIndexRow,
	type TaskFile,
} from "./tasks.ts";

function task(partial: Partial<TaskFile> & { id: string }): TaskFile {
	return {
		title: partial.id,
		slug: partial.id.toLowerCase(),
		file: `/tmp/${partial.id}.md`,
		wave: 1,
		dependsOn: [],
		status: "backlog",
		filesLikelyTouched: [],
		...partial,
	};
}

describe("frontmatter", () => {
	test("parseScalar lê lista inline respeitando aspas com vírgula", () => {
		expect(parseScalar('["src/a.ts", "src/b, c.ts"]')).toEqual(["src/a.ts", "src/b, c.ts"]);
		expect(parseScalar("[]")).toEqual([]);
		expect(parseScalar("3")).toBe(3);
		expect(parseScalar("true")).toBe(true);
	});

	test("parseFrontmatter extrai o bloco inicial", () => {
		const front = parseFrontmatter(
			'---\nid: "TASK-01"\nwave: 2\ndepends_on: [TASK-00]\nstatus: backlog\n---\n\n# TASK-01 — algo\n',
		);
		expect(front.id).toBe("TASK-01");
		expect(front.wave).toBe(2);
		expect(front.depends_on).toEqual(["TASK-00"]);
	});
});

describe("selectReadyWave", () => {
	test("prioriza a menor onda com dependências concluídas", () => {
		const tasks = [
			task({ id: "TASK-01", wave: 1, status: "pronto" }),
			task({ id: "TASK-02", wave: 2, dependsOn: ["TASK-01"] }),
			task({ id: "TASK-03", wave: 2, dependsOn: ["TASK-01"] }),
			task({ id: "TASK-04", wave: 3, dependsOn: ["TASK-02"] }),
		];
		const ready = selectReadyWave(tasks);
		expect(ready.wave).toBe(2);
		expect(ready.tasks.map((item) => item.id)).toEqual(["TASK-02", "TASK-03"]);
	});

	test("bloqueia tarefa cuja dependência não concluiu", () => {
		const tasks = [task({ id: "TASK-01" }), task({ id: "TASK-02", wave: 2, dependsOn: ["TASK-01"] })];
		const ready = selectReadyWave(tasks);
		expect(ready.wave).toBe(1);
		expect(ready.tasks.map((item) => item.id)).toEqual(["TASK-01"]);
	});

	test("descreve a dependência pendente quando a onda pedida está bloqueada", () => {
		const tasks = [task({ id: "TASK-01" }), task({ id: "TASK-02", wave: 2, dependsOn: ["TASK-01"] })];
		const ready = selectReadyWave(tasks, 2);
		expect(ready.tasks).toEqual([]);
		expect(ready.blockedByDependencies.map((item) => item.id)).toEqual(["TASK-02"]);
	});

	test("não devolve tarefas concluídas", () => {
		const tasks = [task({ id: "TASK-01", status: "pronto" })];
		expect(selectReadyWave(tasks)).toEqual({ wave: null, tasks: [], blockedByDependencies: [] });
	});
});

describe("detectFileConflicts", () => {
	test("acusa o mesmo arquivo declarado por duas tarefas", () => {
		const tasks = [
			task({ id: "TASK-01", repo: "/repo", filesLikelyTouched: ["src/a.ts"] }),
			task({ id: "TASK-02", repo: "/repo", filesLikelyTouched: ["src/a.ts", "src/b.ts"] }),
		];
		expect(detectFileConflicts(tasks)).toHaveLength(1);
	});

	test("não acusa quando os repositórios são diferentes", () => {
		const tasks = [
			task({ id: "TASK-01", repo: "/repo-a", filesLikelyTouched: ["src/a.ts"] }),
			task({ id: "TASK-02", repo: "/repo-b", filesLikelyTouched: ["src/a.ts"] }),
		];
		expect(detectFileConflicts(tasks)).toEqual([]);
	});
});

describe("escrita de status", () => {
	test("setTaskStatus troca apenas a linha do frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epic-runner-"));
		const file = path.join(dir, "TASK-01-x.md");
		fs.writeFileSync(file, '---\nid: "TASK-01"\nstatus: backlog\n---\n\n# TASK-01 — x\n', "utf8");
		setTaskStatus(file, "fazendo");
		expect(readTaskFile(file).status).toBe("fazendo");
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("updateIndexRow atualiza status e evidência pela coluna do cabeçalho", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epic-runner-"));
		const index = path.join(dir, "index.md");
		fs.writeFileSync(
			index,
			[
				"## Tarefas",
				"",
				"| ID | Título | Onda | Dependências | Validação | Status | Evidência |",
				"|----|--------|------|--------------|-----------|--------|-----------|",
				"| [TASK-01](./tasks/TASK-01-x.md) | x | 1 | — | pw2 | backlog | — |",
				"",
			].join("\n"),
			"utf8",
		);
		updateIndexRow(index, "TASK-01", { status: "pronto", evidence: "[TASK-01](./evidence/TASK-01-x.md)" });
		const line = fs.readFileSync(index, "utf8").split("\n").find((row) => row.includes("TASK-01"))!;
		expect(line).toContain("pronto");
		expect(line).toContain("./evidence/TASK-01-x.md");
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
