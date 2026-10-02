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

function makeVscode({ selection, openError } = {}) {
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
            async executeCommand(commandId, uri) {
                state.opened.push({ commandId, uri });
                if (openError) {
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
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "epics-quick-open-extension-"));
    try {
        await run(root);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

test("registered command opens the selected file inside Kiro", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        const filePath = path.join(root, "DRHJNES-1", "epic.md");
        await fs.mkdir(path.dirname(filePath));
        await fs.writeFile(filePath, "issue");
        const context = { subscriptions: [] };
        const { vscode, state } = makeVscode({ selection: (items) => items[0] });

        activate(context, vscode, root);
        assert.equal(state.commandId, "lafco.epicsQuickOpen");
        assert.equal(context.subscriptions.length, 1);
        await state.handler();

        assert.deepEqual(state.quickPicks[0].items, [{
            label: "epic.md",
            description: path.join("DRHJNES-1", "epic.md"),
            filePath,
        }]);
        assert.equal(state.quickPicks[0].options.matchOnDescription, true);
        assert.deepEqual(state.opened, [{
            commandId: "vscode.open",
            uri: { scheme: "file", fsPath: filePath },
        }]);
    });
});

test("command refreshes the file list each time it is invoked", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        const context = { subscriptions: [] };
        const { vscode, state } = makeVscode();
        activate(context, vscode, root);

        await fs.writeFile(path.join(root, "first.md"), "first");
        await state.handler();
        await fs.writeFile(path.join(root, "second.md"), "second");
        await state.handler();

        assert.deepEqual(state.quickPicks.map(({ items }) => items.map(({ label }) => label)), [
            ["first.md"],
            ["first.md", "second.md"],
        ]);
    });
});

test("empty root produces information and does not open a file", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        const { vscode, state } = makeVscode();
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.information.length, 1);
        assert.match(state.information[0], /Nenhum arquivo/);
        assert.equal(state.quickPicks.length, 0);
        assert.equal(state.opened.length, 0);
    });
});

test("unreadable or missing root produces an error and does not open a file", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    const missingRoot = path.join(os.tmpdir(), `epics-quick-open-missing-${process.pid}`);
    const { vscode, state } = makeVscode();
    activate({ subscriptions: [] }, vscode, missingRoot);
    await state.handler();

    assert.equal(state.errors.length, 1);
    assert.match(state.errors[0], /Não foi possível ler/);
    assert.equal(state.quickPicks.length, 0);
    assert.equal(state.opened.length, 0);
});

test("canceling the Quick Pick does not open a file", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        await fs.writeFile(path.join(root, "issue.md"), "issue");
        const { vscode, state } = makeVscode();
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.quickPicks.length, 1);
        assert.equal(state.opened.length, 0);
    });
});

test("an open failure is reported in Kiro", async () => {
    const { activate } = loadExtension();
    assert.equal(typeof activate, "function", "extension.js must export activate");

    await withTempDirectory(async (root) => {
        await fs.writeFile(path.join(root, "issue.md"), "issue");
        const { vscode, state } = makeVscode({
            selection: (items) => items[0],
            openError: new Error("open failed"),
        });
        activate({ subscriptions: [] }, vscode, root);
        await state.handler();

        assert.equal(state.opened.length, 1);
        assert.equal(state.errors.length, 1);
        assert.match(state.errors[0], /open failed/);
    });
});
