import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	loadLocalProducts,
	localProductContext,
	resolveRepoPath,
	type LocalProducts,
} from "./local-products.ts";

describe("loadLocalProducts", () => {
	test("lê o products.json da extension com os produtos decididos", () => {
		const loaded = loadLocalProducts(import.meta.dir);
		for (const name of ["folgas", "rostering", "acessoweb", "smartgate", "espelho", "timesheet", "livemaps", "mapa_frequencia"]) {
			expect(loaded[name]).toBeDefined();
		}
		expect(loaded.folgas?.repos).toEqual(["folgas-api", "folgas-ui"]);
		expect(loaded.espelho?.repos).toEqual(["mirror-client", "pw2"]);
		expect(loaded.smartgate?.repos).toEqual(["smartgate-client", "pw2"]);
		expect(loaded.livemaps?.repos).toEqual(["livemaps", "livemaps-client", "livemaps_consumer", "pw2"]);
		expect(loaded.mapa_frequencia?.repos).toEqual(["pw2"]);
		expect(loaded.timesheet?.repos).toEqual(["ts", "ts-client"]);
	});

	test("inclui os produtos já indexados como fallback do índice", () => {
		const loaded = loadLocalProducts(import.meta.dir);
		expect(loaded.pontoweb?.repos).toEqual(["pw2"]);
		expect(loaded.vacations?.repos).toEqual(["pw2", "vacations-client"]);
	});

	test("cai para vazio quando o arquivo não existe", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-products-"));
		expect(loadLocalProducts(dir)).toEqual({});
		fs.rmSync(dir, { recursive: true, force: true });
	});
});

describe("resolveRepoPath", () => {
	test("resolve um repo existente a partir do AHG_DIR", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ahg-"));
		fs.mkdirSync(path.join(dir, "folgas-api"));
		const previous = process.env.AHG_DIR;
		process.env.AHG_DIR = dir;
		try {
			expect(resolveRepoPath("folgas-api")).toBe(path.join(dir, "folgas-api"));
			expect(resolveRepoPath("nao-existe")).toBeNull();
		} finally {
			if (previous === undefined) delete process.env.AHG_DIR;
			else process.env.AHG_DIR = previous;
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("localProductContext", () => {
	const products: LocalProducts = {
		folgas: { displayName: "Folgas", description: "gestão de folgas", repos: ["folgas-api", "folgas-ui"] },
	};

	test("devolve null para produto não registrado", () => {
		expect(localProductContext("inexistente", products)).toBeNull();
	});

	test("monta o contexto com displayName, descrição e repos", () => {
		const context = localProductContext("folgas", products, "/tmp");
		expect(context?.product).toBe("folgas");
		expect(context?.displayName).toBe("Folgas");
		expect(context?.description).toBe("gestão de folgas");
		expect(context?.repos.map((repo) => repo.name)).toEqual(["folgas-api", "folgas-ui"]);
	});
});