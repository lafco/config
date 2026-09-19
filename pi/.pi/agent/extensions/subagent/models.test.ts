import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EMPTY_CONFIG, failureReason, loadModelConfig, resolveModel, shouldFallback } from "./models.ts";

const config = {
	agents: { worker: ["provider-a/code", "provider-b/pro"], scanner: ["provider-a/flash"] },
	thinking: { worker: "medium" as const },
};

describe("resolveModel", () => {
	test("config do agente vem antes do frontmatter e da sessão", () => {
		const resolution = resolveModel({
			agentName: "worker",
			agentModel: "frontmatter/old",
			sessionModel: "sessao/caro",
			config,
		});
		expect(resolution.models).toEqual(["provider-a/code", "provider-b/pro", "frontmatter/old", "sessao/caro"]);
		expect(resolution.source).toBe("config");
		expect(resolution.thinking).toBe("medium");
	});

	test("despacho tem precedência e mantém os fallbacks do config", () => {
		const resolution = resolveModel({
			agentName: "worker",
			dispatchModel: "provider-b/pro",
			sessionModel: "sessao/caro",
			config,
		});
		expect(resolution.models[0]).toBe("provider-b/pro");
		expect(resolution.models).toEqual(["provider-b/pro", "provider-a/code", "sessao/caro"]);
		expect(resolution.source).toBe("dispatch");
	});

	test("sem config, cai para o frontmatter e depois para a sessão", () => {
		expect(resolveModel({ agentName: "x", agentModel: "front/1", sessionModel: "s/2", config: EMPTY_CONFIG })).toEqual({
			models: ["front/1", "s/2"],
			thinking: undefined,
			source: "frontmatter",
		});
		expect(resolveModel({ agentName: "x", sessionModel: "s/2", config: EMPTY_CONFIG }).source).toBe("sessao");
	});

	test("agente desconhecido usa o modelo da sessão (sem fallback inventado)", () => {
		expect(resolveModel({ agentName: "y", sessionModel: "s/2", config }).models).toEqual(["s/2"]);
	});
});

describe("shouldFallback", () => {
	test("cai para o próximo modelo quando a tentativa não produziu resposta", () => {
		expect(shouldFallback({ messages: [], exitCode: 1, stopReason: "error" })).toBe(true);
		expect(shouldFallback({ messages: [{ role: "user" }], exitCode: 0 })).toBe(true);
	});

	test("modelo indisponível cai para o fallback mesmo com mensagem de erro vazia", () => {
		// Regressão: o pi emite um `assistant` com conteúdo vazio e
		// stopReason=error quando o modelo não existe — isso não é resposta.
		expect(
			shouldFallback({
				messages: [{ role: "assistant", content: [] }],
				exitCode: 1,
				stopReason: "error",
			}),
		).toBe(true);
		expect(
			shouldFallback({
				messages: [{ role: "assistant", content: [{ type: "text", text: "   " }] }],
				exitCode: 1,
				stopReason: "error",
			}),
		).toBe(true);
	});

	test("não troca de modelo quando o agente respondeu", () => {
		expect(
			shouldFallback({
				messages: [{ role: "assistant", content: [{ type: "text", text: "feito" }] }],
				exitCode: 1,
				stopReason: "error",
			}),
		).toBe(false);
	});

	test("chamada de ferramenta conta como trabalho feito", () => {
		expect(
			shouldFallback({
				messages: [{ role: "assistant", content: [{ type: "toolCall" }] }],
				exitCode: 1,
				stopReason: "error",
			}),
		).toBe(false);
	});
});

describe("loadModelConfig", () => {
	test("lê agents e thinking e ignora níveis inválidos", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-models-"));
		const file = path.join(dir, "models.json");
		fs.writeFileSync(
			file,
			JSON.stringify({
				agents: { worker: ["a/1", " b/2 ", ""], vazio: [], numero: 3 },
				thinking: { worker: "high", errado: "turbo" },
			}),
			"utf8",
		);
		const loaded = loadModelConfig(dir, file);
		expect(loaded.agents.worker).toEqual(["a/1", "b/2"]);
		expect(loaded.agents.vazio).toBeUndefined();
		expect(loaded.agents.numero).toBeUndefined();
		expect(loaded.thinking.worker).toBe("high");
		expect(loaded.thinking.errado).toBeUndefined();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("arquivo ausente ou inválido devolve config vazia", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-models-"));
		expect(loadModelConfig(dir, path.join(dir, "nao-existe.json"))).toEqual(EMPTY_CONFIG);
		const bad = path.join(dir, "bad.json");
		fs.writeFileSync(bad, "{nao é json", "utf8");
		expect(loadModelConfig(dir, bad)).toEqual(EMPTY_CONFIG);
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("o models.json do repo cobre os agentes que a esteira despacha", () => {
		const loaded = loadModelConfig(import.meta.dir, path.join(import.meta.dir, "models.json"));
		for (const agent of ["worker", "task-reviewer", "validator", "scout", "planner"]) {
			expect(loaded.agents[agent]?.length ?? 0).toBeGreaterThanOrEqual(2);
		}
		// Fallback em outro provider: dois modelos do mesmo gateway caem juntos.
		for (const [agent, list] of Object.entries(loaded.agents)) {
			const providers = new Set(list.map((model: string) => model.split("/")[0]));
			expect(providers.size, `${agent} precisa de fallback em outro provider`).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("failureReason", () => {
	test("prefere errorMessage e cai para stderr/exit", () => {
		expect(failureReason({ errorMessage: "429 rate limited", exitCode: 1 })).toBe("429 rate limited");
		expect(failureReason({ stderr: "linha 1\nlinha 2", exitCode: 1 })).toBe("linha 1 linha 2");
		expect(failureReason({ exitCode: 7 })).toBe("exit 7");
	});
});
