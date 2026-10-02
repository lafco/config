import { describe, expect, test } from "bun:test";
import {
	buildProductCatalog,
	loadProductsMap,
	resolveProductFromMap,
	resolveProductFromMapDetailed,
	resolveProductFromRepos,
	resolveProductFromText,
	type ProductCatalogEntry,
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

const catalog: ProductCatalogEntry[] = [
	{ name: "pontoweb", displayName: "PontoWeb", repos: [{ name: "pw2", path: "/ahg/pw2" }] },
	{
		name: "vacations",
		displayName: "Vacations",
		repos: [
			{ name: "pw2", path: "/ahg/pw2" },
			{ name: "vacations-client", path: "/ahg/vacations-client" },
		],
		aliases: ["ferias", "férias"],
	},
	{
		name: "rostering",
		displayName: "Rostering",
		repos: [
			{ name: "rostering-api", path: "/ahg/rostering-api" },
			{ name: "rostering-ui", path: "/ahg/rostering-ui" },
		],
		aliases: ["escalas"],
	},
];

describe("resolveProductFromRepos", () => {
	test("repo exclusivo de um produto resolve pelo caminho", () => {
		expect(resolveProductFromRepos(catalog, ["/ahg/rostering-api"])).toEqual({
			product: "rostering",
			source: "repo",
			matched: "/ahg/rostering-api",
		});
	});

	test("subdiretório do repo também resolve", () => {
		expect(resolveProductFromRepos(catalog, ["/ahg/rostering-api/src/modules"])).toEqual({
			product: "rostering",
			source: "repo",
			matched: "/ahg/rostering-api/src/modules",
		});
	});

	test("repo sem path no catálogo casa pelo basename", () => {
		const withNameOnly: ProductCatalogEntry[] = [{ name: "espelho", displayName: "Espelho", repos: [{ name: "mirror-client" }] }];
		expect(resolveProductFromRepos(withNameOnly, ["/home/x/ahg/mirror-client"])).toEqual({
			product: "espelho",
			source: "repo",
			matched: "/home/x/ahg/mirror-client",
		});
	});

	test("pw2 é compartilhado: ambíguo, não resolve", () => {
		expect(resolveProductFromRepos(catalog, ["/ahg/pw2"])).toBeNull();
	});

	test("repo desconhecido não resolve", () => {
		expect(resolveProductFromRepos(catalog, ["/ahg/dotfiles"])).toBeNull();
	});

	test("candidato ambíguo não aborta o próximo candidato", () => {
		expect(resolveProductFromRepos(catalog, ["/ahg/pw2", "/ahg/vacations-client"])).toEqual({
			product: "vacations",
			source: "repo",
			matched: "/ahg/vacations-client",
		});
	});
});

describe("resolveProductFromText", () => {
	test("casa o nome do produto no resumo", () => {
		expect(
			resolveProductFromText(catalog, { summary: "Rostering - publicar escala", components: [], labels: [] }),
		).toEqual({ product: "rostering", source: "text", matched: "rostering" });
	});

	test("casa o alias em pt-BR (acento-insensível)", () => {
		expect(resolveProductFromText(catalog, { summary: "Férias - parcelamento", components: [], labels: [] })).toEqual({
			product: "vacations",
			source: "text",
			matched: "ferias",
		});
	});

	test("casa por componente ou label quando o resumo não ajuda", () => {
		expect(resolveProductFromText(catalog, { summary: "Ajuste", components: ["escalas"], labels: [] })).toEqual({
			product: "rostering",
			source: "text",
			matched: "escalas",
		});
	});

	test("sem match, devolve null", () => {
		expect(
			resolveProductFromText(catalog, { summary: "Atlas - publicar escala", components: [], labels: [] }),
		).toBeNull();
	});

	test("match ambíguo (dois produtos com o mesmo alias) não resolve", () => {
		const ambiguous = [...catalog, { name: "outro", displayName: "Outro", repos: [], aliases: ["escalas"] }];
		expect(resolveProductFromText(ambiguous, { summary: "escalas", components: [], labels: [] })).toBeNull();
	});
});

describe("buildProductCatalog", () => {
	test("o mcpb manda em repos/displayName; o local acrescenta aliases", () => {
		const catalog = buildProductCatalog(
			[{ name: "vacations", displayName: "Vacations", repos: [{ name: "pw2", path: "/ahg/pw2" }] }],
			{
				vacations: {
					displayName: "Vacations (local)",
					repos: [
						{ name: "pw2", path: "/ahg/pw2" },
						{ name: "vacations-client", path: "/ahg/vacations-client" },
					],
					aliases: ["ferias"],
				},
			},
		);
		expect(catalog).toEqual([
			{
				name: "vacations",
				displayName: "Vacations",
				repos: [{ name: "pw2", path: "/ahg/pw2" }],
				aliases: ["ferias"],
			},
		]);
	});

	test("produto só local entra com repos e aliases", () => {
		const catalog = buildProductCatalog([], {
			folgas: { displayName: "Folgas", repos: [{ name: "folgas-api" }], aliases: ["dayoff"] },
		});
		expect(catalog).toEqual([
			{ name: "folgas", displayName: "Folgas", repos: [{ name: "folgas-api" }], aliases: ["dayoff"] },
		]);
	});

	test("mcpb sem repos cai nos repos do registro local", () => {
		const catalog = buildProductCatalog(
			[{ name: "rostering", displayName: "Rostering", repos: [] }],
			{ rostering: { displayName: "Rostering", repos: [{ name: "rostering-api", path: "/ahg/rostering-api" }] } },
		);
		expect(catalog[0]?.repos).toEqual([{ name: "rostering-api", path: "/ahg/rostering-api" }]);
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