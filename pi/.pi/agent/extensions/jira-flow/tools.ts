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
	type: Type.Optional(Type.String({ description: "Task | Story | Bug" })),
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
		label: "Gravar artefatos do épico",
		description:
			"Ferramenta interna do fluxo /refinar-issue. Entrega a análise do épico e a lista de tarefas para o harness gravar epic.md, index.md e tasks/*.md. Só chame quando o fluxo /refinar-issue estiver ativo, a análise tiver sido aprovada via `submit_analysis` e a quebra tiver sido validada com o usuário.",
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
		label: "Submeter análise do épico",
		description:
			"Ferramenta interna do fluxo /refinar-issue. Submete o 'modelo do épico' (entendimento) para o usuário revisar e aprovar. O refinamento não pode ser decomposto nem emitido antes da aprovação. Em caso de rejeição, o retorno traz o comentário do usuário para você ajustar e submeter de novo.",
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
			return new Text(theme.fg("toolTitle", theme.bold("submit_analysis ")) + theme.fg("muted", "modelo do épico"), 0, 0);
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
			"Consulta o catálogo de produtos (agentes especialistas) sobre um produto do épico. Use na Fase 1 (entendimento) e na Fase 3 (especificação) quando precisar de contexto que o código não responde. Se o catálogo estiver indisponível, o erro indica usar o fallback (investigação do repositório) e registrar a dúvida.",
		parameters: ConsultSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: ConsultParams, signal) {
			const state = getRefinement();
			if (!state) {
				return fail("Nenhum refinamento ativo. Inicie com /refinar-issue <KEY>.", {});
			}
			const client = state.products;
			if (!client) {
				return fail(
					"Catálogo de produtos indisponível. Investigue o repositório (scout/leitura direta) e registre a dúvida em `duvidas`/`riscos`.",
					{},
				);
			}
			const product = params.produto?.trim() || state.productContext?.product;
			if (!product) {
				return fail("Produto desconhecido: informe `produto` explicitamente ou configure o catálogo.", {});
			}

			try {
				const resposta = await client.ask(
					{ product, question: params.pergunta, specialist: params.especialista?.trim() || undefined },
					signal ?? undefined,
				);
				return ok(resposta, { product, specialist: params.especialista ?? null });
			} catch (error) {
				const message = error instanceof ProductsError ? error.message : String(error);
				return fail(`Consulta ao especialista falhou: ${message}`, {});
			}
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
