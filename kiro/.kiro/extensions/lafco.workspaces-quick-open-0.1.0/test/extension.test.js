const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function loadExtension() {
    try {
        return require("../extension");
    } catch (error) {
        if (error.code === "MODULE_NOT_FOUND" && error.message.includes("'../extension'")) {
            return {};
        }
        throw error;
    }
}

function makeVscode({ selection, saveError, openError } = {}) {
    const state = {
        commandId: undefined,
        handler: undefined,
        quickPicks: [],
        opened: [],
        errors: [],
        information: [],
    };

    const vscode = {
        Uri: {
            file(filePath) {
                return { scheme: "file", fsPath: filePath };
            },
        },
        commands: {
            registerCommand(commandId, handler) {
                state.commandId = commandId;
                state.handler = handler;
                return { dispose() {} };
            },
            async executeCommand(commandId, uri, options) {
                state.opened.push({ commandId, uri, options });
                if (commandId === "workbench.action.files.saveAll" && saveError) {
                    throw saveError;
                }
                if (commandId === "vscode.openFolder" && openError) {
                    throw openError;
                }
            },
        },
        window: {
            async showQuickPick(items, options) {
                state.quickPicks.push({ items, options });
                return selection ? selection(items) : undefined;
            },
            async showErrorMessage(message) {
                state.errors.push(message);
            },
            async showInformationMessage(message) {
                state.information.push(message);
            },
        },
    };

    return { vscode, state };
}

async function withTempDirectory(run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspaces-quick-open-extension-"));
    try {
        await run(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

async function writeWorkspace(root, name, folders) {
    const filePath = path.join(root, `${name}.code-workspace`);
    await fs.writeFile(filePath, JSON.stringify({
        folders: folders.map((folder) => ({ name: folder, path: `/ahg/${folder}` })),
    }));
    return filePath;
}

test("registered command saves the current window and reuses it for the selected workspace", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        const filePath = await writeWorkspace(root, "folgas", ["folgas-api", "folgas-ui"]);
        const context = { subscriptions: [] };
        const { vscode, state } = makeVscode({ selection: (items) => items[0] });

        activate(context, vscode, root);
        assert.equal(state.commandId, "lafco.workspacesQuickOpen");
        assert.equal(context.subscriptions.length, 1);
        await state.handler();

        assert.deepEqual(state.quickPicks[0].items, [{
            label: "folgas",
            description: "folgas-api, folgas-ui",
            workspacePath: filePath,
        }]);
        assert.equal(state.quickPicks[0].options.matchOnDescription, true);
        assert.deepEqual(state.opened, [
            {
                commandId: "workbench.action.files.saveAll",
                uri: undefined,
                options: undefined,
            },
            {
                commandId: "vscode.openFolder",
                uri: { scheme: "file", fsPath: filePath },
                options: { forceReuseWindow: true },
            },
        ]);
    });
});

test("command refreshes the workspace list each time it is invoked", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        const context = { subscriptions: [] };
        const { vscode, state } = makeVscode();
        activate(context, vscode, root);

        await writeWorkspace(root, "acesso", ["pw2", "aw-client"]);
        await state.handler();
        await writeWorkspace(root, "sg", ["pw2", "smartgate-client"]);
        await state.handler();

        assert.deepEqual(state.quickPicks.map(({ items }) => items.map(({ label }) => label)), [
            ["acesso"],
            ["acesso", "sg"],
        ]);
    });
});

test("empty root produces information and does not open a workspace", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        const { vscode, state } = makeVscode();
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.information.length, 1);
        assert.match(state.information[0], /Nenhum workspace/);
        assert.equal(state.quickPicks.length, 0);
        assert.equal(state.opened.length, 0);
    });
});

test("unreadable or missing root produces an error and does not open a workspace", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    const missingRoot = path.join(os.tmpdir(), `workspaces-quick-open-missing-${process.pid}`);
    const { vscode, state } = makeVscode();
    activate({ subscriptions: [] }, vscode, missingRoot);
    await state.handler();

    assert.equal(state.errors.length, 1);
    assert.match(state.errors[0], /Não foi possível ler/);
    assert.equal(state.quickPicks.length, 0);
    assert.equal(state.opened.length, 0);
});

test("a corrupt workspace file produces an error and does not open a workspace", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        await fs.writeFile(path.join(root, "broken.code-workspace"), "{ not json");
        const { vscode, state } = makeVscode();
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.errors.length, 1);
        assert.match(state.errors[0], /Não foi possível ler/);
        assert.equal(state.opened.length, 0);
    });
});

test("canceling the Quick Pick saves nothing and opens no workspace", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        await writeWorkspace(root, "rostering", ["rostering-api", "rostering-ui"]);
        const { vscode, state } = makeVscode();
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.quickPicks.length, 1);
        assert.equal(state.opened.length, 0);
    });
});

test("a save failure is reported and the workspace is not opened", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        await writeWorkspace(root, "sg", ["pw2", "smartgate-client"]);
        const { vscode, state } = makeVscode({
            selection: (items) => items[0],
            saveError: new Error("save failed"),
        });
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.opened.length, 1);
        assert.equal(state.opened[0].commandId, "workbench.action.files.saveAll");
        assert.equal(state.errors.length, 1);
        assert.match(state.errors[0], /Não foi possível salvar/);
        assert.match(state.errors[0], /save failed/);
    });
});

test("an open failure is reported in Kiro", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        await writeWorkspace(root, "vacation", ["pw2", "vacations-client"]);
        const { vscode, state } = makeVscode({
            selection: (items) => items[0],
            openError: new Error("open failed"),
        });
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.deepEqual(state.opened.map(({ commandId }) => commandId), [
            "workbench.action.files.saveAll",
            "vscode.openFolder",
        ]);
        assert.equal(state.errors.length, 1);
        assert.match(state.errors[0], /open failed/);
    });
});
