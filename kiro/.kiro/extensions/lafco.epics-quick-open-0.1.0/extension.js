const os = require("node:os");
const path = require("node:path");
const { buildQuickPickItems, collectFiles } = require("./files");

const COMMAND_ID = "lafco.epicsQuickOpen";

function activate(context, vscodeApi = require("vscode"), root = path.join(os.homedir(), "epics")) {
    const command = vscodeApi.commands.registerCommand(COMMAND_ID, async () => {
        let files;
        try {
            files = await collectFiles(root);
        } catch (error) {
            await vscodeApi.window.showErrorMessage(
                `Não foi possível ler os arquivos em ${root}: ${error.message}`,
            );
            return;
        }

        if (files.length === 0) {
            await vscodeApi.window.showInformationMessage(`Nenhum arquivo encontrado em ${root}.`);
            return;
        }

        const selected = await vscodeApi.window.showQuickPick(buildQuickPickItems(files, root), {
            placeHolder: `Abrir arquivo em ${root}`,
            matchOnDescription: true,
        });
        if (!selected) {
            return;
        }

        try {
            await vscodeApi.commands.executeCommand("vscode.open", vscodeApi.Uri.file(selected.filePath));
        } catch (error) {
            await vscodeApi.window.showErrorMessage(
                `Não foi possível abrir ${selected.filePath}: ${error.message}`,
            );
        }
    });

    context.subscriptions.push(command);
}

module.exports = { activate };
