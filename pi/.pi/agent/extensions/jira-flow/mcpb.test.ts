import { describe, expect, test } from "bun:test";
import {
	loadProductsMap,
	resolveProductFromMap,
	resolveProductFromMapDetailed,
	type ProductsMap,
} from "./mcpb.ts";

const map: ProductsMap = {
	projects: { DRHJNES: "vacations" },
	components: { Férias: "vacations", "Meu Ponto Eletrônico": "pontoweb" },
	labels: { estagiario: "vacations" },
	ignore: ["OKR", "PLR", "Score de Risco"],
};

describe("resolveProductFromMapDetailed", () => {
	test("componente vence o projeto (caso PontoWeb num épico de Férias)", () => {
		const result = resolveProductFromMapDetailed(map, {
			project: "DRHJNES",
			components: ["Meu Ponto Eletrônico"],
			labels: [],
		});
		expect(result).toEqual({ product: "pontoweb", source: "component", matched: "Meu Ponto Eletrônico" });
	});

	test("sem componente, cai no default do projeto", () => {
		const result = resolveProductFromMapDetailed(map, { project: "DRHJNES", components: [], labels: [] });
		expect(result).toEqual({ product: "vacations", source: "project", matched: "DRHJNES" });
	});

	test("sem componente nem projeto, cai na label", () => {
		const result = resolveProductFromMapDetailed(map, { project: "OUTRO", components: [], labels: ["estagiario"] });
		expect(result).toEqual({ product: "vacations", source: "label", matched: "estagiario" });
	});

	test("nada casa quando o projeto é desconhecido", () => {
		expect(resolveProductFromMapDetailed(map, { project: "OUTRO", components: [], labels: [] })).toBeNull();
	});

	test("match de componente é case/acento-insensível", () => {
		const result = resolveProductFromMapDetailed(map, { project: "X", components: ["ferias"], labels: [] });
		expect(result?.source).toBe("component");
		expect(result?.product).toBe("vacations");
	});

	test("componente de processo não cai no default do projeto", () => {
		const result = resolveProductFromMapDetailed(map, { project: "DRHJNES", components: ["OKR"], labels: [] });
		expect(result).toEqual({ product: null, source: "ignored", matched: "OKR" });
		expect(resolveProductFromMap(map, { project: "DRHJNES", components: ["OKR"], labels: [] })).toBeNull();
	});

	test("componente de produto vence o componente de processo", () => {
		const result = resolveProductFromMapDetailed(map, {
			project: "DRHJNES",
			components: ["OKR", "Férias"],
			labels: [],
		});
		expect(result).toEqual({ product: "vacations", source: "component", matched: "Férias" });
	});

	test("a versão simples devolve só o produto", () => {
		expect(resolveProductFromMap(map, { project: "DRHJNES", components: [], labels: [] })).toBe("vacations");
	});
});

describe("products-map.json", () => {
	test("mapeia os componentes de produto e não usa o projeto como default", () => {
		const loaded = loadProductsMap(import.meta.dir);
		expect(loaded.projects).toEqual({});
		expect(loaded.components["Meu Ponto Eletrônico"]).toBe("pontoweb");
		expect(loaded.components["Férias"]).toBe("vacations");
	});

	test("mapeia os produtos decididos e separa físico/virtual", () => {
		const loaded = loadProductsMap(import.meta.dir);
		expect(loaded.components["Rostering - Folgas"]).toBe("folgas");
		expect(loaded.components["Gestão de Escalas"]).toBe("rostering");
		expect(loaded.components["Controle de Acesso"]).toBe("acessoweb");
		expect(loaded.components["Controle de Acesso Virtual"]).toBe("smartgate");
		expect(loaded.components["PW-Espelho de Ponto"]).toBe("espelho");
		expect(loaded.components["Mapa de Frequência"]).toBe("livemaps");
		expect(loaded.components["Cerca virtual"]).toBe("mapa_frequencia");
		expect(loaded.labels["cerca_virtual"]).toBe("mapa_frequencia");
		expect(loaded.components["TimeSheet"]).toBe("timesheet");
	});

	test("marca os componentes de processo como não-produto", () => {
		const loaded = loadProductsMap(import.meta.dir);
		expect(loaded.ignore).toContain("OKR");
		expect(loaded.ignore).toContain("Score de Risco");
		const result = resolveProductFromMapDetailed(loaded, {
			project: "DRHJNES",
			components: ["PLR"],
			labels: [],
		});
		expect(result?.product).toBeNull();
	});

	test("sem componente e sem projeto mapeado, não resolve (pede confirmação)", () => {
		const loaded = loadProductsMap(import.meta.dir);
		expect(
			resolveProductFromMapDetailed(loaded, { project: "DRHJNES", components: [], labels: [] }),
		).toBeNull();
	});
});