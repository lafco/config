import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TaskArtifact } from "./artifacts.ts";
import {
	applyValidationDefaults,
	loadValidationDefaults,
	validationDefaultsMarkdown,
	type ValidationDefaults,
} from "./validation-defaults.ts";

const defaults: ValidationDefaults = {
	pw2Local: { environment: "local", company: "a408453", register: "236" },
};

function task(partial: Partial<TaskArtifact> & { id: string }): TaskArtifact {
	return { title: partial.id, wave: 1, ...partial };
}

describe("applyValidationDefaults", () => {
	test("preenche company e register de pw2 local vazios", () => {
		const tasks = applyValidationDefaults(
			[task({ id: "TASK-01", validation: { kind: "pw2", environment: "local", expected: "200" } })],
			defaults,
		);
		expect(tasks[0]!.validation).toMatchObject({
			environment: "local",
			company: "a408453",
			register: "236",
		});
	});

	test("não sobrescreve company/register declarados na tarefa", () => {
		const tasks = applyValidationDefaults(
			[
				task({
					id: "TASK-01",
					validation: { kind: "pw2", environment: "local", company: "a999", register: "5986", expected: "200" },
				}),
			],
			defaults,
		);
		expect(tasks[0]!.validation).toMatchObject({ company: "a999", register: "5986" });
	});

	test("não toca em pw2 não-local nem em outros kinds", () => {
		const tasks = applyValidationDefaults(
			[
				task({ id: "TASK-01", validation: { kind: "pw2", environment: "production", company: "a999", expected: "200" } }),
				task({ id: "TASK-02", validation: { kind: "unit-tests", expected: "verde" } }),
			],
			defaults,
		);
		expect(tasks[0]!.validation).toMatchObject({ company: "a999" });
		expect(tasks[0]!.validation?.register).toBeUndefined();
		expect(tasks[1]!.validation?.company).toBeUndefined();
	});
});

describe("loadValidationDefaults", () => {
	test("lê o validation-defaults.json da extension", () => {
		const loaded = loadValidationDefaults(import.meta.dir);
		expect(loaded.pw2Local).toMatchObject({ environment: "local", company: "a408453", register: "236" });
	});

	test("cai para vazio quando o arquivo não existe", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "defaults-"));
		expect(loadValidationDefaults(dir)).toEqual({ pw2Local: null });
		fs.rmSync(dir, { recursive: true, force: true });
	});
});

describe("validationDefaultsMarkdown", () => {
	test("descreve a convenção local", () => {
		const text = validationDefaultsMarkdown(defaults);
		expect(text).toContain("a408453");
		expect(text).toContain("236");
	});

	test("sem default, não gera seção", () => {
		expect(validationDefaultsMarkdown({ pw2Local: null })).toBe("");
	});
});