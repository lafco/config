const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function loadHelpers() {
    try {
        return require("../workspaces");
    } catch (error) {
        if (error.code === "MODULE_NOT_FOUND" && error.message.includes("'../workspaces'")) {
            return {};
        }
        throw error;
    }
}

async function withTempDirectory(run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspaces-quick-open-"));
    try {
        await run(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

async function writeWorkspace(root, name, folders) {
    const filePath = path.join(root, `${name}.code-workspace`);
    await fs.writeFile(filePath, JSON.stringify({
        folders: folders.map((folder) => ({ name: folder.name, path: folder.path })),
    }));
    return filePath;
}

test("collectWorkspaces returns only .code-workspace files in sorted order", async () => {
    const { collectWorkspaces } = loadHelpers();
    assert.equal(typeof collectWorkspaces, "function", "workspaces.js must export collectWorkspaces");

    await withTempDirectory(async (root) => {
        await fs.mkdir(path.join(root, "nested"));
        await writeWorkspace(root, "sg", []);
        await writeWorkspace(root, "acesso", []);
        await fs.writeFile(path.join(root, "notes.md"), "notes");
        await writeWorkspace(path.join(root, "nested"), "ignored", []);

        assert.deepEqual(await collectWorkspaces(root), [
            path.join(root, "acesso.code-workspace"),
            path.join(root, "sg.code-workspace"),
        ]);
    });
});

test("collectWorkspaces returns an empty list for an empty root", async () => {
    const { collectWorkspaces } = loadHelpers();
    assert.equal(typeof collectWorkspaces, "function", "workspaces.js must export collectWorkspaces");

    await withTempDirectory(async (root) => {
        assert.deepEqual(await collectWorkspaces(root), []);
    });
});

test("collectWorkspaces propagates missing-root and permission errors", async (t) => {
    const { collectWorkspaces } = loadHelpers();
    assert.equal(typeof collectWorkspaces, "function", "workspaces.js must export collectWorkspaces");

    for (const code of ["ENOENT", "EACCES"]) {
        await t.test(code, async () => {
            const io = {
                async readdir() {
                    throw Object.assign(new Error(code), { code });
                },
            };

            await assert.rejects(collectWorkspaces("/workspaces", io), { code });
        });
    }
});

test("buildQuickPickItems labels each workspace by file name and describes its folders", async () => {
    const { buildQuickPickItems } = loadHelpers();
    assert.equal(typeof buildQuickPickItems, "function", "workspaces.js must export buildQuickPickItems");

    await withTempDirectory(async (root) => {
        const vacation = await writeWorkspace(root, "vacation", [
            { name: "pw2", path: "/ahg/pw2" },
            { name: "vacations-client", path: "/ahg/vacations-client" },
        ]);
        const livemaps = await writeWorkspace(root, "livemaps", [
            { name: "livemaps", path: "/ahg/livemaps" },
            { name: "livemaps-client", path: "/ahg/livemaps-client" },
            { name: "livemaps_consumer", path: "/ahg/livemaps_consumer" },
        ]);

        assert.deepEqual(await buildQuickPickItems([vacation, livemaps]), [
            {
                label: "vacation",
                description: "pw2, vacations-client",
                workspacePath: vacation,
            },
            {
                label: "livemaps",
                description: "livemaps, livemaps-client, livemaps_consumer",
                workspacePath: livemaps,
            },
        ]);
    });
});

test("buildQuickPickItems falls back to the folder path basename when a folder has no name", async () => {
    const { buildQuickPickItems } = loadHelpers();
    assert.equal(typeof buildQuickPickItems, "function", "workspaces.js must export buildQuickPickItems");

    await withTempDirectory(async (root) => {
        const filePath = path.join(root, "sg.code-workspace");
        await fs.writeFile(filePath, JSON.stringify({
            folders: [{ path: "/ahg/pw2" }, { path: "/ahg/smartgate-client" }],
        }));

        assert.deepEqual(await buildQuickPickItems([filePath]), [
            {
                label: "sg",
                description: "pw2, smartgate-client",
                workspacePath: filePath,
            },
        ]);
    });
});

test("buildQuickPickItems propagates a corrupt workspace file", async () => {
    const { buildQuickPickItems } = loadHelpers();
    assert.equal(typeof buildQuickPickItems, "function", "workspaces.js must export buildQuickPickItems");

    await withTempDirectory(async (root) => {
        const filePath = path.join(root, "broken.code-workspace");
        await fs.writeFile(filePath, "{ not json");

        await assert.rejects(buildQuickPickItems([filePath]), { name: "SyntaxError" });
    });
});
