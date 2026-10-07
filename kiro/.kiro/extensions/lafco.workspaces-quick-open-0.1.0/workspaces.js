const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_EXTENSION = ".code-workspace";

async function collectWorkspaces(root, io = fs.promises) {
    const entries = await io.readdir(root, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(WORKSPACE_EXTENSION))
        .map((entry) => path.join(root, entry.name))
        .sort();
}

function folderLabels(document) {
    const folders = Array.isArray(document.folders) ? document.folders : [];

    return folders.map((folder) => folder.name || path.basename(folder.path));
}

async function buildQuickPickItems(workspacePaths, io = fs.promises) {
    const items = [];

    for (const workspacePath of workspacePaths) {
        const document = JSON.parse(await io.readFile(workspacePath, "utf8"));

        items.push({
            label: path.basename(workspacePath, WORKSPACE_EXTENSION),
            description: folderLabels(document).join(", "),
            workspacePath,
        });
    }

    return items;
}

module.exports = { collectWorkspaces, buildQuickPickItems };
