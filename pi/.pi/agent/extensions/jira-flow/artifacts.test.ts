import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	materializeArtifacts,
	materializeEpicStories,
	materializeStoryTasks,
	validateArtifacts,
	validateStories,
	validateTasks,
	type EpicArtifact,
	type StoryArtifact,
	type TaskArtifact,
} from "./artifacts.ts";

const TEMPLATES = path.join(import.meta.dir, "templates");

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "jira-flow-artifacts-"));
}

const epic: EpicArtifact = { key: "PROJ-1", summary: "Épico de teste" };

function story(partial: Partial<StoryArtifact> & { id: string }): StoryArtifact {
	return { title: partial.id, wave: 1, valorObservavel: "algo observável", acceptanceCriteria: ["Dado/Quando/Então"], ...partial };
}

function task(partial: Partial<TaskArtifact> & { id: string }): TaskArtifact {
	return { title: partial.id, wave: 1, ...partial };
}

const meta = {
	jiraKey: "PROJ-1",
	issueType: "Story",
	project: "PROJ",
	jiraUrl: "https://jira.exemplo",
	syncedAt: "2026-01-01T00:00:00.000Z",
};

describe("validateStories", () => {
	test("exige valor observável e critérios", () => {
		const errors = validateStories({
			epic,
			stories: [story({ id: "STORY-01", valorObservavel: "", acceptanceCriteria: [] })],
		});
		expect(errors.join("\n")).toContain("valorObservavel");
		expect(errors.join("\n")).toContain("critério de aceite");
	});

	test("acusa ID duplicado e dependência inexistente", () => {
		const errors = validateStories({
			epic,
			stories: [story({ id: "STORY-01" }), story({ id: "STORY-01", dependsOn: ["STORY-09"] })],
		});
		expect(errors.join("\n")).toContain("ID duplicado");
		expect(errors.join("\n")).toContain("STORY-09");
	});
});

describe("validateTasks", () => {
	test("no fluxo Story, tarefa de código exige validation.expected", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [task({ id: "TASK-01", type: "Codificação", acceptanceCriteria: ["Dado/Quando/Então"] })],
		});
		expect(errors.join("\n")).toContain("validation.expected");
	});

	test("fluxo plano (manutenção) não exige validation", () => {
		const errors = validateTasks({
			flow: "maintenance",
			tasks: [task({ id: "TASK-01", type: "Codificação", acceptanceCriteria: ["Dado/Quando/Então"] })],
		});
		expect(errors).toEqual([]);
	});

	test("pw2 fora de local exige company", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [
				task({
					id: "TASK-01",
					type: "Codificação",
					acceptanceCriteria: ["Dado/Quando/Então"],
					validation: { kind: "pw2", environment: "production", expected: "200" },
				}),
			],
		});
		expect(errors.join("\n")).toContain("validation.company");
	});
});

describe("contrato de teste e definition of ready", () => {
	const CODIGO = {
		type: "Codificação",
		acceptanceCriteria: ["Dado/Quando/Então"],
		repo: "/r",
		filesLikelyTouched: ["src/a.ts"],
		validation: { kind: "unit-tests" as const, expected: "o teste passa" },
	};

	test("tarefa de código do fluxo Story exige test.strategy", () => {
		const errors = validateTasks({ flow: "story", tasks: [task({ id: "TASK-01", ...CODIGO })] });
		expect(errors.join("\n")).toContain("test.strategy");
	});

	test("tdd exige arquivo e os dois comandos", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [task({ id: "TASK-01", ...CODIGO, test: { strategy: "tdd" } })],
		});
		const joined = errors.join("\n");
		expect(joined).toContain("test.file");
		expect(joined).toContain("test.redCommand");
		expect(joined).toContain("test.greenCommand");
	});

	test("tdd completo passa", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [
				task({
					id: "TASK-01",
					...CODIGO,
					test: {
						strategy: "tdd",
						file: "tests/a.test.ts",
						redCommand: "bun test tests/a.test.ts",
						greenCommand: "bun test tests/a.test.ts",
					},
				}),
			],
		});
		expect(errors).toEqual([]);
	});

	test("verify-only e none exigem justificativa", () => {
		const semWhy = validateTasks({
			flow: "story",
			tasks: [task({ id: "TASK-01", ...CODIGO, test: { strategy: "verify-only" } })],
		});
		expect(semWhy.join("\n")).toContain("test.why");

		const comWhy = validateTasks({
			flow: "story",
			tasks: [
				task({ id: "TASK-01", ...CODIGO, test: { strategy: "none", why: "sem suíte no repo; prova é manual" } }),
			],
		});
		expect(comWhy).toEqual([]);
	});

	test("estratégia desconhecida é recusada", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [task({ id: "TASK-01", ...CODIGO, test: { strategy: "red-green" as never } })],
		});
		expect(errors.join("\n")).toContain("inválido");
	});

	test("fluxo Story exige repo e filesLikelyTouched", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [
				task({
					id: "TASK-01",
					...CODIGO,
					repo: undefined,
					filesLikelyTouched: [],
					test: { strategy: "none", why: "sem suíte" },
				}),
			],
		});
		const joined = errors.join("\n");
		expect(joined).toContain("precisa de `repo`");
		expect(joined).toContain("filesLikelyTouched");
	});

	test("tarefa de diagnóstico (implementableByAgent false) não exige teste", () => {
		const errors = validateTasks({
			flow: "story",
			tasks: [
				task({
					id: "TASK-01",
					type: "Codificação",
					acceptanceCriteria: ["Dado/Quando/Então"],
					implementableByAgent: false,
					validation: { kind: "manual", expected: "o humano confere" },
				}),
			],
		});
		expect(errors.join("\n")).not.toContain("test.strategy");
	});

	test("fluxo plano não exige contrato de teste, mas exige quando kind é correção", () => {
		const plano = validateTasks({
			flow: "maintenance",
			tasks: [task({ id: "TASK-01", type: "Codificação", acceptanceCriteria: ["Dado/Quando/Então"] })],
		});
		expect(plano).toEqual([]);

		const correcao = validateTasks({
			flow: "maintenance",
			tasks: [
				task({
					id: "TASK-01",
					kind: "correção",
					acceptanceCriteria: ["Dado/Quando/Então"],
					validation: { kind: "manual", expected: "sem erro no log" },
				}),
			],
		});
		expect(correcao.join("\n")).toContain("test.strategy");
	});
});

describe("validateArtifacts (paralelismo e avisos)", () => {
	test("recusa duas tarefas da mesma onda com o mesmo arquivo", () => {
		const report = validateArtifacts({
			epic,
			flow: "story",
			tasks: [
				task({ id: "TASK-01", repo: "/r", filesLikelyTouched: ["src/a.ts"], validation: { kind: "manual", expected: "ok" } }),
				task({ id: "TASK-02", repo: "/r", filesLikelyTouched: ["src/a.ts"], validation: { kind: "manual", expected: "ok" } }),
			],
		});
		expect(report.errors.join("\n")).toContain("mesmo arquivo");
	});

	test("avisa tarefa de onda paralela sem filesLikelyTouched", () => {
		const report = validateArtifacts({
			epic,
			flow: "story",
			tasks: [
				task({ id: "TASK-01", repo: "/r", filesLikelyTouched: ["src/a.ts"], validation: { kind: "manual", expected: "ok" } }),
				task({ id: "TASK-02", repo: "/r", validation: { kind: "manual", expected: "ok" } }),
			],
		});
		expect(report.warnings.join("\n")).toContain("filesLikelyTouched");
	});

	test("avisa validação pw2 com empresa fora de autoRunCompanies", () => {
		const report = validateArtifacts({
			epic,
			flow: "story",
			autoRunCompanies: [],
			tasks: [
				task({
					id: "TASK-01",
					repo: "/r",
					filesLikelyTouched: ["src/a.ts"],
					validation: { kind: "pw2", environment: "production", company: "a999", expected: "200" },
				}),
			],
		});
		expect(report.errors).toEqual([]);
		expect(report.warnings.join("\n")).toContain("autoRunCompanies");
	});
});

describe("materialização", () => {
	test("Epic grava epic.md, stories/ e índice com a história", async () => {
		const dir = tmpDir();
		const result = await materializeEpicStories({
			dir,
			templatesDir: TEMPLATES,
			epic,
			stories: [story({ id: "STORY-01", title: "Cadastrar algo", jiraKey: "PROJ-10" })],
			meta,
		});
		expect(fs.existsSync(path.join(dir, "epic.md"))).toBe(true);
		expect(fs.existsSync(path.join(dir, "stories", "STORY-01-cadastrar-algo.md"))).toBe(true);
		const index = fs.readFileSync(path.join(dir, "index.md"), "utf8");
		expect(index).toContain("STORY-01");
		expect(index).toContain("./PROJ-10/index.md");
		expect(result.files.length).toBeGreaterThanOrEqual(3);
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("Story grava story.md, tasks/, evidence/ e índice com Validação", async () => {
		const dir = tmpDir();
		const result = await materializeStoryTasks({
			dir,
			templatesDir: TEMPLATES,
			story: story({ id: "STORY-01", title: "Cadastrar algo", jiraKey: "PROJ-10" }),
				tasks: [
					task({
						id: "TASK-01",
						title: "Ajustar endpoint",
						type: "Codificação",
						acceptanceCriteria: ["Dado/Quando/Então"],
						repo: "/r",
						branch: "feat/PROJ-10-task-01",
						filesLikelyTouched: ["src/a.ts"],
						validation: { kind: "pw2", environment: "local", expected: "200" },
						test: {
							strategy: "tdd",
							file: "tests/endpoint.test.ts",
							redCommand: "bun test tests/endpoint.test.ts",
							greenCommand: "bun test tests/endpoint.test.ts",
						},
					}),
				],
			meta,
			flow: "story",
		});
		expect(fs.existsSync(path.join(dir, "story.md"))).toBe(true);
		expect(fs.existsSync(path.join(dir, "evidence"))).toBe(true);
		const taskFile = path.join(dir, "tasks", "TASK-01-ajustar-endpoint.md");
		expect(fs.existsSync(taskFile)).toBe(true);
		const taskContent = fs.readFileSync(taskFile, "utf8");
		expect(taskContent).toContain('validation_kind: "pw2"');
		expect(taskContent).toContain("repo:");
		expect(taskContent).toContain('test_strategy: "tdd"');
		expect(taskContent).toContain("- **Arquivo de teste:** tests/endpoint.test.ts");
		expect(taskContent).toContain("- **Deve falhar antes (RED):** bun test tests/endpoint.test.ts");
		const index = fs.readFileSync(path.join(dir, "index.md"), "utf8");
		expect(index).toContain("Validação");
		expect(result.files.length).toBeGreaterThanOrEqual(3);
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("fluxo plano continua gravando epic.md + tasks/ + index.md", async () => {
		const dir = tmpDir();
		await materializeArtifacts({
			dir,
			templatesDir: TEMPLATES,
			epic,
			tasks: [task({ id: "TASK-01", title: "Corrigir cálculo", type: "Defeito", acceptanceCriteria: ["Dado/Quando/Então"] })],
			meta,
			flow: "maintenance",
		});
		expect(fs.existsSync(path.join(dir, "epic.md"))).toBe(true);
		expect(fs.existsSync(path.join(dir, "tasks", "TASK-01-corrigir-calculo.md"))).toBe(true);
		expect(fs.existsSync(path.join(dir, "index.md"))).toBe(true);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
