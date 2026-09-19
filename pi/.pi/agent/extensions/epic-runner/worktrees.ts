/**
 * Wrapper de `git worktree` para isolar a implementação de cada tarefa.
 *
 * Cada tarefa roda numa worktree própria (`<repo>/.worktrees/<KEY>-<TASK>`)
 * com a branch declarada no arquivo da tarefa. O merge das branches continua
 * sendo decisão do orquestrador/humano.
 */

import { execFile } from "node:child_process";
import * as path from "node:path";

export class GitError extends Error {
	constructor(message: string, readonly command: string) {
		super(message);
		this.name = "GitError";
	}
}

function git(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("git", args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) {
				const detail = String(stderr || stdout || error.message).trim();
				reject(new GitError(detail.split("\n").slice(-4).join(" "), `git ${args.join(" ")}`));
				return;
			}
			resolve(String(stdout).trim());
		});
	});
}

/** Executa git lendo o repositório (usado pelo pacote de review). */
export function gitRun(args: string[], cwd: string): Promise<string> {
	return git(args, cwd);
}

export function worktreePath(repo: string, storyKey: string, taskId: string): string {
	return path.join(repo, ".worktrees", `${storyKey}-${taskId}`);
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
	try {
		await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repo);
		return true;
	} catch {
		return false;
	}
}

export async function currentBranch(repo: string): Promise<string> {
	return git(["rev-parse", "--abbrev-ref", "HEAD"], repo);
}

export interface WorktreeResult {
	taskId: string;
	repo: string;
	branch: string;
	cwd: string;
	created: boolean;
	/** Ponto de bifurcação da branch da tarefa: base do diff do review. */
	baseSha?: string;
}

/** Cria (ou reaproveita) a worktree da tarefa e devolve o diretório/branch. */
export async function addWorktree(input: {
	taskId: string;
	repo: string;
	branch: string;
	storyKey: string;
	baseBranch?: string;
}): Promise<WorktreeResult> {
	const { taskId, repo, branch, storyKey, baseBranch } = input;
	const cwd = worktreePath(repo, storyKey, taskId);
	if (await branchExists(repo, branch)) {
		await git(["worktree", "add", cwd, branch], repo);
		const base = baseBranch?.trim() || (await currentBranch(repo));
		return { taskId, repo, branch, cwd, created: true, baseSha: await mergeBase(repo, base, branch) };
	}
	const base = baseBranch?.trim() || (await currentBranch(repo));
	await git(["worktree", "add", "-b", branch, cwd, base], repo);
	return { taskId, repo, branch, cwd, created: true, baseSha: await mergeBase(repo, base, branch) };
}

/**
 * Ponto de bifurcação entre a base e a branch da tarefa. `merge-base` (e não
 * `HEAD~1`) mantém o diff do review correto mesmo com vários commits na
 * tarefa ou com a base avançando durante a execução.
 */
async function mergeBase(repo: string, base: string, branch: string): Promise<string | undefined> {
	try {
		return await git(["merge-base", base, branch], repo);
	} catch {
		return undefined;
	}
}

/** Remove a worktree e a branch (best-effort na branch). */
export async function removeWorktree(input: {
	taskId: string;
	repo: string;
	branch?: string;
	storyKey: string;
}): Promise<{ taskId: string; cwd: string; removed: boolean; branchDeleted: boolean }> {
	const { taskId, repo, branch, storyKey } = input;
	const cwd = worktreePath(repo, storyKey, taskId);
	await git(["worktree", "remove", "--force", cwd], repo);
	let branchDeleted = false;
	if (branch?.trim()) {
		try {
			await git(["branch", "-D", branch.trim()], repo);
			branchDeleted = true;
		} catch {
			branchDeleted = false;
		}
	}
	return { taskId, cwd, removed: true, branchDeleted };
}

export async function listWorktrees(repo: string): Promise<string> {
	return git(["worktree", "list"], repo);
}
