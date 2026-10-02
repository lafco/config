const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function loadHelpers() {
    try {
        return require("../files");
    } catch (error) {
        if (error.code === "MODULE_NOT_FOUND" && error.message.includes("'../files'")) {
            return {};
        }
        throw error;
    }
}

async function withTempDirectory(run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "epics-quick-open-"));
    try {
        await run(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

test("collectFiles returns nested absolute paths in sorted order", async () => {
    const { collectFiles } = loadHelpers();
    assert.equal(typeof collectFiles, "function", "files.js must export collectFiles");

    await withTempDirectory(async (root) => {
        await fs.mkdir(path.join(root, "nested"));
        await fs.writeFile(path.join(root, "alpha.md"), "alpha");
        await fs.writeFile(path.join(root, "nested", "beta.md"), "beta");

        assert.deepEqual(await collectFiles(root), [
            path.join(root, "alpha.md"),
            path.join(root, "nested", "beta.md"),
        ]);
    });
});

test("collectFiles includes hidden, extensionless, Markdown, and diff files", async () => {
    const { collectFiles } = loadHelpers();
    assert.equal(typeof collectFiles, "function", "files.js must export collectFiles");

    await withTempDirectory(async (root) => {
        const names = [".private", "no-extension", "notes.md", "patch.diff"];
        for (const name of names) {
            await fs.writeFile(path.join(root, name), "content");
        }

        assert.deepEqual(await collectFiles(root), names.map((name) => path.join(root, name)));
    });
});

test("buildQuickPickItems distinguishes equal basenames with relative paths", () => {
    const { buildQuickPickItems } = loadHelpers();
    assert.equal(typeof buildQuickPickItems, "function", "files.js must export buildQuickPickItems");

    const root = path.join(os.tmpdir(), "epics");
    const first = path.join(root, "STORY-1", "index.md");
    const second = path.join(root, "STORY-2", "index.md");

    assert.deepEqual(buildQuickPickItems([first, second], root), [
        { label: "index.md", description: path.join("STORY-1", "index.md"), filePath: first },
        { label: "index.md", description: path.join("STORY-2", "index.md"), filePath: second },
    ]);
});

test("collectFiles returns an empty list for an empty root", async () => {
    const { collectFiles } = loadHelpers();
    assert.equal(typeof collectFiles, "function", "files.js must export collectFiles");

    await withTempDirectory(async (root) => {
        assert.deepEqual(await collectFiles(root), []);
    });
});

test("collectFiles propagates missing-root and permission errors", async (t) => {
    const { collectFiles } = loadHelpers();
    assert.equal(typeof collectFiles, "function", "files.js must export collectFiles");

    for (const code of ["ENOENT", "EACCES"]) {
        await t.test(code, async () => {
            const io = {
                async readdir() {
                    throw Object.assign(new Error(code), { code });
                },
            };

            await assert.rejects(collectFiles("/epics", io), { code });
        });
    }
});
