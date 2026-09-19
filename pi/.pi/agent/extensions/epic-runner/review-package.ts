/**
 * Pacote de review de uma tarefa.
 *
 * O revisor precisa decidir sobre um diff, não sobre o repositório inteiro.
 * Este módulo monta **um arquivo** com a lista de commits, o resumo de
 * alterações e o diff com contexto estendido, do ponto de bifurcação da
 * branch da tarefa até o HEAD dela — para o revisor ler numa chamada só, sem
 * repetir `git log`/`git diff` e sem varrer o checkout.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { gitRun } from "./worktrees.ts";

/** ~400 KB: acima disso o pacote é truncado com marcação explícita. */
const DEFAULT_MAX_BYTES = 400_000;
const CONTEXT_LINES = 10;

export interface ReviewPackage {
	file: string;
	base: string;
	head: string;
	files: number;
	commits: number;
	bytes: number;
	truncated: boolean;
	stat: string;
}

/**
 * Grava o pacote de review e devolve o caminho + metadados. A base é o
 * `base_sha` gravado no frontmatter ao preparar a worktree (ponto de
 * bifurcação da branch da tarefa); sem ele, cai no `merge-base` com a branch
 * base informada — e falha explicitamente se nenhuma das duas existir, em vez
 * de gerar um diff vazio que pareceria "nada mudou".
 */
export async function buildReviewPackage(input: {
	repo: string;
	baseRef?: string;
	baseBranch?: string;
	branch: string;
	outFile: string;
	maxBytes?: number;
}): Promise<ReviewPackage> {
	const { repo, branch, outFile } = input;
	const head = await gitRun(["rev-parse", branch], repo);
	let base = (input.baseRef ?? "").trim();
	if (!base) {
		const baseBranch = (input.baseBranch ?? "").trim();
		if (!baseBranch) {
			throw new Error(
				`Sem base para o diff de ${branch}: a tarefa não tem \`base_sha\` e nenhuma branch base foi informada. Rode \`prepare_task_worktrees\` de novo ou passe \`baseBranch\`.`,
			);
		}
		base = await gitRun(["merge-base", baseBranch, head], repo);
	}

	const log = await gitRun(["log", "--oneline", `${base}..${head}`], repo);
	const stat = await gitRun(["diff", "--stat", `${base}..${head}`], repo);
	const nameOnly = await gitRun(["diff", "--name-only", `${base}..${head}`], repo);
	const diff = await gitRun(["diff", `-U${CONTEXT_LINES}`, `${base}..${head}`], repo);

	const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
	const header = [
		`# Pacote de review — ${branch}`,
		"",
		`- **Base:** \`${base}\``,
		`- **Head:** \`${head}\``,
		`- **Commits:** ${log ? log.split("\n").length : 0}`,
		`- **Arquivos:** ${nameOnly ? nameOnly.split("\n").length : 0}`,
		"",
		"Este arquivo é a sua visão da mudança: as linhas de contexto dele **são** os arquivos alterados.",
		"Não repita `git log`/`git diff` nem percorra o restante do repositório — só leia um arquivo à parte",
		"quando um trecho do diff que você precisa julgar estiver cortado no meio.",
		"",
		"## Commits",
		"",
		log || "(sem commits)",
		"",
		"## Resumo",
		"",
		"```",
		stat || "(sem alterações)",
		"```",
		"",
		"## Diff",
		"",
	];

	let body = diff;
	let truncated = false;
	const budget = maxBytes - Buffer.byteLength(header.join("\n"), "utf8");
	if (budget > 0 && Buffer.byteLength(body, "utf8") > budget) {
		truncated = true;
		body = `${Buffer.from(body, "utf8").subarray(0, budget).toString("utf8")}\n\n[TRUNCADO: o diff excede ${maxBytes} bytes — os arquivos acima do corte não aparecem aqui. Leia os arquivos que faltam no diretório da tarefa e diga no veredito que o diff veio truncado.]`;
	}

	fs.mkdirSync(path.dirname(outFile), { recursive: true });
	const content = `${header.join("\n")}${body}\n`;
	fs.writeFileSync(outFile, content, "utf8");

	return {
		file: outFile,
		base,
		head,
		files: nameOnly ? nameOnly.split("\n").length : 0,
		commits: log ? log.split("\n").length : 0,
		bytes: Buffer.byteLength(content, "utf8"),
		truncated,
		stat,
	};
}
