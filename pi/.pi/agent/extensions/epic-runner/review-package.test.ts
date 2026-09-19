import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildReviewPackage } from "./review-package.ts";
import { addWorktree, removeWorktree } from "./worktrees.ts";

function repoG(): { dir: string; base: string; git: (...a: string[]) => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  const git = (...args: string[]) => void execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  fs.writeFileSync(path.join(dir, "a.txt"), "um\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  git("checkout", "-q", "-b", "feat/t");
  fs.writeFileSync(path.join(dir, "a.txt"), "um\ndois\n");
  git("commit", "-qam", "task 1");
  fs.writeFileSync(path.join(dir, "a.txt"), "um\ndois\ntres\n");
  git("commit", "-qam", "task 2");
  return { dir, base, git };
}

describe("pacote de review", () => {
  test("junta commits, resumo e diff do ponto de bifurcação", async () => {
    const { dir, base } = repoG();
    const pkg = await buildReviewPackage({ repo: dir, baseRef: base, branch: "feat/t", outFile: path.join(dir, "out.diff") });
    const content = fs.readFileSync(pkg.file, "utf8");
    expect(pkg.commits).toBe(2);
    expect(pkg.files).toBe(1);
    expect(pkg.truncated).toBe(false);
    expect(pkg.base).toBe(base);
    expect(content).toContain("task 2");
    expect(content).toContain("+tres");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("usa merge-base quando recebe a branch base", async () => {
    const { dir, base } = repoG();
    const pkg = await buildReviewPackage({ repo: dir, baseBranch: "main", branch: "feat/t", outFile: path.join(dir, "out2.diff") });
    expect(pkg.base).toBe(base);
    expect(pkg.commits).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("sem base nenhuma, falha em vez de gerar diff vazio", async () => {
    const { dir } = repoG();
    await expect(
      buildReviewPackage({ repo: dir, branch: "feat/t", outFile: path.join(dir, "out3.diff") }),
    ).rejects.toThrow("Sem base para o diff");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("trunca com marcação quando o diff estoura o limite", async () => {
    const { dir, base, git } = repoG();
    fs.writeFileSync(path.join(dir, "grande.txt"), Array.from({ length: 400 }, (_, i) => `linha ${i}`).join("\n"));
    git("add", ".");
    git("commit", "-qm", "arquivo grande");
    const pkg = await buildReviewPackage({ repo: dir, baseRef: base, branch: "feat/t", outFile: path.join(dir, "out4.diff"), maxBytes: 2000 });
    expect(pkg.truncated).toBe(true);
    expect(fs.readFileSync(pkg.file, "utf8")).toContain("TRUNCADO");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("integracao com worktree", () => {
  test("baseSha da worktree recorta exatamente os commits da tarefa", async () => {
    const { dir } = repoG();
    // A worktree sai da branch atual do checkout (aqui, feat/t) — não de `main`.
    const tip = execFileSync("git", ["rev-parse", "feat/t"], { cwd: dir, encoding: "utf8" }).trim();
    const wt = await addWorktree({ taskId: "TASK-01", repo: dir, branch: "feat/lab-task-01", storyKey: "LAB-1" });
    expect(wt.baseSha).toBe(tip);
    fs.writeFileSync(path.join(wt.cwd, "b.txt"), "novo\n");
    void execFileSync("git", ["add", "."], { cwd: wt.cwd, stdio: "pipe" });
    void execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "entrega da tarefa"], {
      cwd: wt.cwd,
      stdio: "pipe",
    });
    const pkg = await buildReviewPackage({
      repo: dir,
      baseRef: wt.baseSha,
      branch: "feat/lab-task-01",
      outFile: path.join(dir, "wt.diff"),
    });
    expect(pkg.commits).toBe(1);
    expect(pkg.files).toBe(1);
    expect(fs.readFileSync(pkg.file, "utf8")).toContain("+novo");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("limpeza preserva o trabalho", () => {
  test("remove a worktree mas não apaga branch não mergeada", async () => {
    const { dir } = repoG();
    const wt = await addWorktree({ taskId: "TASK-01", repo: dir, branch: "feat/lab-task-01", storyKey: "LAB-1" });
    fs.writeFileSync(path.join(wt.cwd, "c.txt"), "entrega\n");
    void execFileSync("git", ["add", "."], { cwd: wt.cwd, stdio: "pipe" });
    void execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "entrega"], {
      cwd: wt.cwd,
      stdio: "pipe",
    });

    const result = await removeWorktree({ taskId: "TASK-01", repo: dir, branch: "feat/lab-task-01", storyKey: "LAB-1" });
    expect(result.removed).toBe(true);
    expect(result.branchDeleted).toBe(false);
    expect(result.branchKept).toBe("feat/lab-task-01");
    // A branch e o commit da entrega continuam lá.
    const branches = execFileSync("git", ["branch", "--list", "feat/lab-task-01"], { cwd: dir, encoding: "utf8" });
    expect(branches).toContain("feat/lab-task-01");
    expect(execFileSync("git", ["log", "--oneline", "feat/lab-task-01"], { cwd: dir, encoding: "utf8" })).toContain("entrega");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
