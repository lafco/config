/**
 * Tools do fluxo de refinamento, registradas pela extension `jira-flow`.
 *
 * - `emit_epic_artifacts`  entrega a análise + tarefas para o harness gravar os arquivos.
 * - `ask_user`             pergunta estruturada (opções + "digitar outra"), TUI.
 * - `submit_analysis`      ponto de revisão/aprovação do "modelo do épico".
 * - `consult_specialist`   consulta conversacional ao catálogo de produtos.
 *
 * O estado em memória (Fase 0/ativa) vem de `state.ts`.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { materializeArtifacts } from "./artifacts.ts";
import { McpbClient, McpbError } from "./mcpb.ts";
import { OpenSearchError } from "./opensearch.ts";
import { ProductsError } from "./products.ts";
import { approveAnalysis, getRefinement, stopRefinement } from "./state.ts";

let registered = false;

export interface FlowToolsOptions {
	templatesDir: string;
}

export function registerFlowTools(pi: ExtensionAPI, options: FlowToolsOptions): void {
	if (registered) return;
	registered = true;
	registerEmitTool(pi, options);
	registerOpenSearchTool(pi);
	registerChangeIssueTypeTool(pi);
	registerAskTool(pi);
	registerAnalysisTool(pi);
	registerConsultTool(pi);
}

interface ToolResult<T> {
	content: { type: "text"; text: string }[];
	details: T;
	isError?: boolean;
}

function ok<T>(text: string, details: T): ToolResult<T> {
	return { content: [{ type: "text", text }], details };
}

function fail<T>(text: string, details: T): ToolResult<T> {
	return { content: [{ type: "text", text }], details, isError: true };
}

// ---------------------------------------------------------------------------
// emit_epic_artifacts
// ---------------------------------------------------------------------------

const EmitTaskSchema = Type.Object({
	id: Type.String({ description: "ID local estável, ex.: TASK-01" }),
	title: Type.String(),
	wave: Type.Integer({ minimum: 1, description: "Onda de execução (1, 2, 3...)" }),
	dependsOn: Type.Optional(Type.Array(Type.String(), { description: "IDs das tarefas predecessoras" })),
	estimate: Type.Optional(Type.String({ description: "S | M | L ou horas" })),
	objective: Type.Optional(Type.String()),
	context: Type.Optional(Type.String()),
	acceptanceCriteria: Type.Optional(
		Type.Array(Type.String(), { description: "Cada item no formato Dado/Quando/Então" }),
	),
	technicalNotes: Type.Optional(Type.String()),
	affectedAreas: Type.Optional(Type.String()),
	tests: Type.Optional(Type.String()),
	outOfScope: Type.Optional(Type.String()),
	risks: Type.Optional(Type.String()),
	labels: Type.Optional(Type.Array(Type.String())),
	type: Type.Optional(
		Type.String({
			description:
				"Categoria da tarefa: Codificação [BACKEND] | Codificação [FRONTEND] | Defeito | Execução de TU | Merge | Associado [CLIENTE] | Spike | Task | Story | Bug",
		}),
	),
	storyPoints: Type.Optional(Type.Number()),
});

const EmitSchema = Type.Object({
	epic: Type.Object({
		key: Type.String(),
		summary: Type.String(),
		objective: Type.Optional(Type.String()),
		context: Type.Optional(Type.String()),
		successCriteria: Type.Optional(Type.String()),
		analysis: Type.Optional(Type.String()),
		outOfScope: Type.Optional(Type.String()),
		openQuestions: Type.Optional(Type.String()),
		labels: Type.Optional(Type.Array(Type.String())),
	}),
	tasks: Type.Array(EmitTaskSchema, { description: "Tarefas da quebra, em qualquer ordem" }),
});

type EmitParams = Static<typeof EmitSchema>;

function registerEmitTool(pi: ExtensionAPI, options: FlowToolsOptions): void {
	pi.registerTool({
		name: "emit_epic_artifacts",
		label: "Gravar artefatos da issue",
		description:
			"Ferramenta interna do fluxo /refinar-issue. Entrega a análise da issue e a lista de tarefas/atividades para o harness gravar epic.md, index.md e tasks/*.md. Só chame quando o fluxo /refinar-issue estiver ativo, a análise tiver sido aprovada via `submit_analysis` e a entrega tiver sido validada com o usuário.",
		parameters: EmitSchema,
		async execute(_toolCallId, params: EmitParams) {
			const state = getRefinement();
			if (!state) {
				return fail("Nenhum refinamento ativo. Inicie com /refinar-issue <KEY>.", {});
			}
			if (!state.analysisApproved) {
				return fail(
					"Análise ainda não aprovada. Chame `submit_analysis` e obtenha o OK do usuário antes de emitir os artefatos.",
					{},
				);
			}

			try {
				const result = await materializeArtifacts({
					dir: state.dir,
					templatesDir: options.templatesDir,
					epic: params.epic,
					tasks: params.tasks,
					meta: {
						jiraKey: state.key,
						issueType: state.issueType,
						project: state.project,
						jiraUrl: state.jiraUrl,
						syncedAt: new Date().toISOString(),
					},
				});
				stopRefinement();
				const list = result.files.map((file) => `- ${file}`).join("\n");
				return ok(`Artefatos gravados em ${result.dir}\n${list}`, result);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return fail(`Falha ao gravar artefatos: ${message}`, {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// search_opensearch
// ---------------------------------------------------------------------------

const OpenSearchSchema = Type.Object({
	text: Type.Optional(Type.String({ description: "Texto ou expressão query_string para buscar nos logs" })),
	index: Type.Optional(Type.String({ description: "Índice ou padrão de índices; usa o configurado quando omitido" })),
	since: Type.Optional(Type.String({ description: "Início do intervalo, aceito pelo OpenSearch (ex.: now-2h ou ISO-8601)" })),
	until: Type.Optional(Type.String({ description: "Fim do intervalo, aceito pelo OpenSearch" })),
	from: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
	size: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});

type OpenSearchParams = Static<typeof OpenSearchSchema>;

function registerOpenSearchTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search_opensearch",
		label: "Buscar logs no OpenSearch",
		description:
			"Busca logs no OpenSearch usando uma API key mantida somente pelo harness. Disponível apenas nos fluxos de Manutenção e Apoio ao cliente. Use o menor intervalo, índice e quantidade de resultados necessários; nunca peça ou exponha a credencial.",
		parameters: OpenSearchSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: OpenSearchParams, signal) {
			const state = getRefinement();
			if (!state) return fail("Nenhum refinamento ativo.", {});
			if (state.flow !== "maintenance" && state.flow !== "customer-support") {
				return fail("A busca no OpenSearch só está disponível nos fluxos de Manutenção e Apoio ao cliente.", {});
			}
			if (!state.opensearch) {
				return fail(
					"OpenSearch não configurado. Continue com os dados disponíveis e registre essa limitação na análise.",
					{},
				);
			}
			try {
				const result = await state.opensearch.search(params, signal ?? undefined);
				const hits = result.hits.map((hit) => {
					const source = JSON.stringify(hit.source);
					return {
						id: hit.id,
						index: hit.index,
						score: hit.score,
						_source: source.length > 8000 ? `${source.slice(0, 8000)}…` : source,
					};
				});
				return ok(JSON.stringify({ total: result.total, query: result.query, hits }, null, 2), {
					total: result.total,
					count: hits.length,
					query: result.query,
				});
			} catch (error) {
				const message = error instanceof OpenSearchError ? error.message : String(error);
				return fail(`Falha ao consultar o OpenSearch: ${message}`, {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// change_issue_to_maintenance
// ---------------------------------------------------------------------------

const ChangeIssueTypeSchema = Type.Object({
	confirm: Type.Boolean({ description: "Deve ser true somente após confirmação explícita do usuário" }),
	targetName: Type.Optional(Type.String({ description: "Nome do tipo de manutenção no Jira" })),
	targetId: Type.Optional(Type.String({ description: "ID do tipo, se já conhecido; evita consulta adicional" })),
	reason: Type.String({ description: "Motivo baseado nas evidências da investigação" }),
});

type ChangeIssueTypeParams = Static<typeof ChangeIssueTypeSchema>;

function registerChangeIssueTypeTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "change_issue_to_maintenance",
		label: "Alterar issue para manutenção",
		description:
			"Altera o tipo da issue atual para Manutenção. Disponível apenas no fluxo de Apoio ao cliente e somente após confirmação explícita; em TUI o harness ainda pede confirmação antes do PUT no Jira.",
		parameters: ChangeIssueTypeSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: ChangeIssueTypeParams, signal, _onUpdate, ctx: ExtensionContext) {
			const state = getRefinement();
			if (!state) return fail("Nenhum refinamento ativo.", {});
			if (state.flow !== "customer-support") {
				return fail("A alteração para Manutenção só está disponível no fluxo de Apoio ao cliente.", {});
			}
			if (!params.confirm) {
				return fail("Alteração não executada: falta confirmação explícita do usuário.", {});
			}
			if (ctx.mode === "tui") {
				const approved = await ctx.ui.confirm(
					"Alterar tipo da issue?",
					`${state.key} será alterada de '${state.issueType}' para '${params.targetName?.trim() || "Manutenção"}'.\n\nMotivo: ${params.reason}`,
				);
				if (!approved) return fail("O usuário cancelou a alteração da issue.", {});
			} else {
				return fail("Modo não interativo: confirme a alteração na interface antes de executar esta operação.", {});
			}
			try {
				const updated = await state.jira.updateIssueType(
					state.key,
					params.targetName?.trim() || "Manutenção",
					params.targetId,
					signal ?? undefined,
				);
				state.issueType = updated.typeName;
				return ok(`Issue ${updated.key} alterada para ${updated.typeName}.`, { ...updated, reason: params.reason });
			} catch (error) {
				return fail(`Não foi possível alterar o tipo da issue: ${error instanceof Error ? error.message : String(error)}`, {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// ask_user
// ---------------------------------------------------------------------------

const AskOptionSchema = Type.Object({
	label: Type.String({ description: "Texto da opção" }),
	descricao: Type.Optional(Type.String({ description: "Explicação curta exibida abaixo do texto" })),
	recomendada: Type.Optional(Type.Boolean({ description: "Marcar como a opção recomendada" })),
});

const AskSchema = Type.Object({
	pergunta: Type.String({ description: "A pergunta a fazer ao usuário" }),
	contexto: Type.Optional(
		Type.String({ description: "Por que a pergunta importa / o que já se sabe (mostrado antes das opções)" }),
	),
	opcoes: Type.Array(AskOptionSchema, { description: "Opções de resposta rápida" }),
	permiteOutro: Type.Optional(
		Type.Boolean({ description: "Permitir a opção 'Digitar outra resposta' (padrão: true)" }),
	),
});

type AskParams = Static<typeof AskSchema>;

interface AskDetails {
	pergunta: string;
	opcoes: string[];
	resposta: string | null;
	foiCustom?: boolean;
}

interface DisplayOption {
	label: string;
	descricao?: string;
	recomendada?: boolean;
	isOther?: boolean;
}

function registerAskTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user",
		label: "Perguntar ao usuário",
		description:
			"Faz uma pergunta estruturada ao usuário: opções numeradas (com descrição e marcação de recomendada) e uma opção de digitar outra resposta. Use no refinamento para validar entendimento e decisões. Uma pergunta por vez. Em modo não interativo retorna erro — nesse caso faça a pergunta em texto na conversa.",
		parameters: AskSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: AskParams, _signal, _onUpdate, ctx: ExtensionContext) {
			const details: AskDetails = {
				pergunta: params.pergunta,
				opcoes: params.opcoes.map((option) => option.label),
				resposta: null,
			};

			if (ctx.mode !== "tui") {
				return fail(
					`Interface não disponível (modo "${ctx.mode}"). Faça a pergunta em texto na conversa.`,
					details,
				);
			}

			const permitsOther = params.permiteOutro !== false;
			if (params.opcoes.length === 0 && !permitsOther) {
				return fail("Forneça ao menos uma opção ou permita 'Outro'.", details);
			}

			const allOptions: DisplayOption[] = [...params.opcoes];
			if (permitsOther) allOptions.push({ label: "Digitar outra resposta", isOther: true });

			const result = await ctx.ui.custom<{ resposta: string; foiCustom: boolean } | null>(
				(tui, theme, _kb, done) => {
					let optionIndex = 0;
					let editMode = false;
					let cachedLines: string[] | undefined;

					const editorTheme: EditorTheme = {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						},
					};
					const editor = new Editor(tui, editorTheme);

					editor.onSubmit = (value) => {
						const trimmed = value.trim();
						if (trimmed) {
							done({ resposta: trimmed, foiCustom: true });
						} else {
							editMode = false;
							editor.setText("");
							refresh();
						}
					};

					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function handleInput(data: string) {
						if (editMode) {
							if (matchesKey(data, Key.escape)) {
								editMode = false;
								editor.setText("");
								refresh();
								return;
							}
							editor.handleInput(data);
							refresh();
							return;
						}

						if (matchesKey(data, Key.up)) {
							optionIndex = Math.max(0, optionIndex - 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.enter)) {
							const selected = allOptions[optionIndex];
							if (selected.isOther) {
								editMode = true;
								refresh();
							} else {
								done({ resposta: selected.label, foiCustom: false });
							}
							return;
						}
						if (matchesKey(data, Key.escape)) {
							done(null);
						}
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;

						const lines: string[] = [];
						const renderWidth = Math.max(1, width);

						function addWrapped(text: string) {
							lines.push(...wrapTextWithAnsi(text, renderWidth));
						}

						function addWrappedWithPrefix(prefix: string, text: string) {
							const prefixWidth = visibleWidth(prefix);
							if (prefixWidth >= renderWidth) {
								addWrapped(prefix + text);
								return;
							}
							const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
							const continuationPrefix = " ".repeat(prefixWidth);
							for (let i = 0; i < wrapped.length; i++) {
								lines.push(`${i === 0 ? prefix : continuationPrefix}${wrapped[i]}`);
							}
						}

						lines.push(theme.fg("accent", "─".repeat(renderWidth)));
						addWrappedWithPrefix(" ", theme.fg("text", params.pergunta));
						if (params.contexto?.trim()) {
							lines.push("");
							addWrappedWithPrefix(" ", theme.fg("muted", params.contexto.trim()));
						}
						lines.push("");

						for (let i = 0; i < allOptions.length; i++) {
							const option = allOptions[i];
							const selected = i === optionIndex;
							const isOther = option.isOther === true;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";
							const suffix = option.recomendada ? theme.fg("success", "  (recomendada)") : "";
							const label = `${i + 1}. ${option.label}${isOther && editMode ? " ✎" : ""}`;
							const color = selected || (isOther && editMode) ? "accent" : "text";

							addWrappedWithPrefix(prefix, theme.fg(color, label) + suffix);

							if (option.descricao) {
								addWrappedWithPrefix("     ", theme.fg("muted", option.descricao));
							}
						}

						if (editMode) {
							lines.push("");
							addWrappedWithPrefix(" ", theme.fg("muted", "Sua resposta:"));
							for (const line of editor.render(Math.max(1, renderWidth - 2))) {
								lines.push(` ${line}`);
							}
						}

						lines.push("");
						if (editMode) {
							addWrappedWithPrefix(" ", theme.fg("dim", "Enter envia • Esc volta"));
						} else {
							addWrappedWithPrefix(" ", theme.fg("dim", "↑↓ navega • Enter seleciona • Esc cancela"));
						}
						lines.push(theme.fg("accent", "─".repeat(renderWidth)));

						cachedLines = lines;
						return lines;
					}

					return {
						render,
						invalidate: () => {
							cachedLines = undefined;
						},
						handleInput,
					};
				},
			);

			if (!result) {
				return ok("O usuário cancelou a pergunta.", details);
			}

			details.resposta = result.resposta;
			details.foiCustom = result.foiCustom;
			return ok(
				result.foiCustom
					? `O usuário respondeu (texto livre): ${result.resposta}`
					: `O usuário escolheu: ${result.resposta}`,
				details,
			);
		},
		renderCall(args, theme) {
			const labels = (Array.isArray(args.opcoes) ? args.opcoes : []).map((option) => option.label);
			const all = args.permiteOutro === false ? labels : [...labels, "Digitar outra resposta"];
			const numbered = all.map((label, index) => `${index + 1}. ${label}`);
			let text = theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", args.pergunta);
			if (numbered.length) text += `\n${theme.fg("dim", `  ${numbered.join("  ·  ")}`)}`;
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as AskDetails | undefined;
			if (!details || details.resposta === null) {
				return new Text(theme.fg("warning", "Pergunta cancelada"), 0, 0);
			}
			const prefix = details.foiCustom ? theme.fg("muted", "(texto) ") : "";
			return new Text(`${theme.fg("success", "✓ ")}${prefix}${theme.fg("accent", details.resposta)}`, 0, 0);
		},
	});
}

// ---------------------------------------------------------------------------
// submit_analysis
// ---------------------------------------------------------------------------

const AnalysisSchema = Type.Object({
	resumo: Type.String({ description: "Resumo do épico em 3–5 linhas" }),
	objetivo: Type.Optional(Type.String({ description: "Objetivo de negócio" })),
	personas: Type.Optional(Type.Array(Type.String())),
	restricoes: Type.Optional(Type.Array(Type.String())),
	criteriosDeSucesso: Type.Optional(Type.Array(Type.String())),
	areasDoCodigo: Type.Optional(
		Type.Array(Type.String({ description: "Caminho/módulo concreto do repositório" })),
	),
	foraDeEscopo: Type.Optional(Type.Array(Type.String())),
	riscos: Type.Optional(Type.Array(Type.String())),
	duvidas: Type.Optional(Type.Array(Type.String({ description: "Perguntas ainda em aberto" }))),
});

type AnalysisParams = Static<typeof AnalysisSchema>;

interface AnalysisDetails {
	status: "approved" | "rejected" | "cancelled" | "automatic";
	comment?: string;
}

function renderAnalysis(params: AnalysisParams): string {
	const section = (title: string, value?: string) => `## ${title}\n${(value ?? "").trim() || "—"}`;
	const list = (title: string, values?: string[]) =>
		`## ${title}\n${values && values.length ? values.map((value) => `- ${value}`).join("\n") : "—"}`;

	return [
		section("Resumo", params.resumo),
		section("Objetivo", params.objetivo),
		list("Personas", params.personas),
		list("Restrições", params.restricoes),
		list("Critérios de sucesso", params.criteriosDeSucesso),
		list("Áreas do código", params.areasDoCodigo),
		list("Fora de escopo", params.foraDeEscopo),
		list("Riscos", params.riscos),
		list("Dúvidas em aberto", params.duvidas),
	].join("\n\n");
}

async function reviewAnalysis(ctx: ExtensionContext, body: string): Promise<AnalysisDetails> {
	if (ctx.mode !== "tui") {
		approveAnalysis();
		return { status: "automatic" };
	}

	const viewed = await ctx.ui.editor("Revise a análise — Enter continua (texto só de leitura)", body);
	if (viewed === undefined) return { status: "cancelled" };

	const choice = await ctx.ui.select("Análise do épico", [
		"Aprovar",
		"Rejeitar com comentário",
		"Cancelar",
	]);
	if (!choice || choice === "Cancelar") return { status: "cancelled" };
	if (choice === "Aprovar") {
		approveAnalysis();
		return { status: "approved" };
	}

	const comment = (await ctx.ui.editor("Comentário da rejeição (o que ajustar?)", ""))?.trim();
	return { status: "rejected", comment: comment || undefined };
}

function registerAnalysisTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "submit_analysis",
		label: "Submeter análise da issue",
		description:
			"Ferramenta interna do fluxo /refinar-issue. Submete o modelo de entendimento da issue para o usuário revisar e aprovar. A entrega não pode ser emitida antes da análise aprovada. Em caso de rejeição, o retorno traz o comentário do usuário para você ajustar e submeter de novo.",
		parameters: AnalysisSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: AnalysisParams, _signal, _onUpdate, ctx: ExtensionContext) {
			if (!getRefinement()) {
				return fail("Nenhum refinamento ativo. Inicie com /refinar-issue <KEY>.", {
					status: "cancelled",
				} satisfies AnalysisDetails);
			}

			const body = renderAnalysis(params);
			let review: AnalysisDetails;
			try {
				review = await reviewAnalysis(ctx, body);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return fail(`Falha ao abrir a revisão: ${message}`, { status: "cancelled" } satisfies AnalysisDetails);
			}

			if (review.status === "approved" || review.status === "automatic") {
				const note =
					review.status === "automatic"
						? "Modo não interativo: análise registrada sem revisão humana."
						: "Análise aprovada pelo usuário.";
				return ok(note, review);
			}
			if (review.status === "cancelled") {
				return fail("Revisão da análise cancelada. Retome com o usuário antes de continuar.", review);
			}
			return ok(
				`Análise rejeitada pelo usuário. Ajuste conforme o comentário e chame \`submit_analysis\` de novo.\nComentário: ${review.comment ?? "(sem comentário)"}`,
				review,
			);
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("submit_analysis ")) + theme.fg("muted", "modelo da issue"), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as AnalysisDetails | undefined;
			switch (details?.status) {
				case "approved":
					return new Text(theme.fg("success", "✓ Análise aprovada"), 0, 0);
				case "automatic":
					return new Text(theme.fg("warning", "◦ Análise registrada (sem revisão)"), 0, 0);
				case "rejected":
					return new Text(
						theme.fg("error", "✗ Rejeitada") + theme.fg("muted", ` — ${details.comment ?? "sem comentário"}`),
						0,
						0,
					);
				default:
					return new Text(theme.fg("warning", "Revisão cancelada"), 0, 0);
			}
		},
	});
}

// ---------------------------------------------------------------------------
// consult_specialist
// ---------------------------------------------------------------------------

const ConsultSchema = Type.Object({
	pergunta: Type.String({ description: "Dúvida técnica/produto a esclarecer" }),
	produto: Type.Optional(Type.String({ description: "Produto (padrão: o resolvido na Fase 0)" })),
	especialista: Type.Optional(Type.String({ description: "Especialista específico, quando souber qual" })),
});

type ConsultParams = Static<typeof ConsultSchema>;

function registerConsultTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "consult_specialist",
		label: "Consultar especialista de produto",
		description:
			"Consulta o catálogo de produtos (HTTP) e, se indisponível, cai para o índice local `mcpb ask` (respostas com citações). Use na Fase 1 (entendimento) e na Fase 3 (especificação) quando precisar de contexto que o código não responde. Se nenhuma fonte responder, o erro indica investigar o repositório (scout/leitura direta) e registrar a dúvida.",
		parameters: ConsultSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: ConsultParams, signal) {
			const state = getRefinement();
			if (!state) {
				return fail("Nenhum refinamento ativo. Inicie com /refinar-issue <KEY>.", {});
			}
			const product = params.produto?.trim() || state.productContext?.product;
			if (!product) {
				return fail("Produto desconhecido: informe `produto` explicitamente ou configure o mapa/mcpb.", {});
			}
			const errors: string[] = [];

			if (state.products) {
				try {
					const resposta = await state.products.ask(
						{ product, question: params.pergunta, specialist: params.especialista?.trim() || undefined },
						signal ?? undefined,
					);
					return ok(resposta, { product, specialist: params.especialista ?? null, source: "catalogo" });
				} catch (error) {
					errors.push(error instanceof ProductsError ? error.message : String(error));
				}
			}

			if (state.mcpbBin) {
				try {
					const result = await new McpbClient(state.mcpbBin).ask(
						{ product, question: params.pergunta },
						signal ?? undefined,
					);
					const cites = result.citations.length
						? `\n\nCitações:\n${result.citations.map((citation) => `- ${citation}`).join("\n")}`
						: "";
					return ok(`${result.answer}${cites}`, {
						product,
						specialist: null,
						source: "mcpb",
						citations: result.citations,
					});
				} catch (error) {
					errors.push(error instanceof McpbError ? `mcpb: ${error.message}` : String(error));
				}
			}

			return fail(
				`Consulta ao especialista falhou (${errors.join(" · ") || "nenhuma fonte disponível"}). ` +
					"Investigue o repositório (scout/leitura direta) e registre a dúvida em `duvidas`/`riscos`.",
				{},
			);
		},
		renderCall(args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("consult_specialist ")) + theme.fg("muted", args.pergunta),
				0,
				0,
			);
		},
		renderResult(result, _options, theme) {
			if (isToolError(result)) {
				const text = result.content[0];
				return new Text(theme.fg("warning", text?.type === "text" ? text.text : "Falha"), 0, 0);
			}
			const text = result.content[0];
			return new Text(theme.fg("success", "✓ ") + (text?.type === "text" ? text.text : ""), 0, 0);
		},
	});
}

// Exports auxiliares de tipagem (não usados pelo runtime do pi).
export type { AnalysisDetails, AskDetails };

function isToolError(result: unknown): boolean {
	return typeof result === "object" && result !== null && (result as { isError?: boolean }).isError === true;
}
