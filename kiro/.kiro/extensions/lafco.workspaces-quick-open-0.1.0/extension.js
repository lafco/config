const os = require("node:os");
const path = require("node:path");
const { buildQuickPickItems, collectWorkspaces } = require("./workspaces");

const COMMAND_ID = "lafco.workspacesQuickOpen";

function activate(context, vscodeApi = require("vscode"), root = path.join(os.homedir(), ".kiro", "workspaces")) {
    const command = vscodeApi.commands.registerCommand(COMMAND_ID, async () => {
        let workspacePaths;
        let items;
        try {
            workspacePaths = await collectWorkspaces(root);
            items = await buildQuickPickItems(workspacePaths);
        } catch (error) {
            await vscodeApi.window.showErrorMessage(
                `Não foi possível ler os workspaces em ${root}: ${error.message}`,
            );
            return;
        }

        if (workspacePaths.length === 0) {
            await vscodeApi.window.showInformationMessage(`Nenhum workspace encontrado em ${root}.`);
            return;
        }

        const selected = await vscodeApi.window.showQuickPick(items, {
            placeHolder: `Abrir workspace em ${root}`,
            matchOnDescription: true,
        });
        if (!selected) {
            return;
        }

        try {
            await vscodeApi.commands.executeCommand("workbench.action.files.saveAll");
        } catch (error) {
            await vscodeApi.window.showErrorMessage(
                `Não foi possível salvar os arquivos abertos: ${error.message}`,
            );
            return;
        }

        try {
            await vscodeApi.commands.executeCommand(
                "vscode.openFolder",
                vscodeApi.Uri.file(selected.workspacePath),
                { forceReuseWindow: true },
            );
        } catch (error) {
            await vscodeApi.window.showErrorMessage(
                `Não foi possível abrir ${selected.workspacePath}: ${error.message}`,
            );
        }
    });

    context.subscriptions.push(command);
}

module.exports = { activate };
