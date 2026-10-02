const fs = require("node:fs");
const path = require("node:path");

async function collectFiles(root, io = fs.promises) {
    const directories = [root];
    const files = [];

    while (directories.length > 0) {
        const directory = directories.pop();
        const entries = await io.readdir(directory, { withFileTypes: true });

        for (const entry of entries) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                directories.push(filePath);
            } else if (entry.isFile()) {
                files.push(filePath);
            }
        }
    }

    return files.sort();
}

function buildQuickPickItems(files, root) {
    return files.map((filePath) => ({
        label: path.basename(filePath),
        description: path.relative(root, filePath),
        filePath,
    }));
}

module.exports = { collectFiles, buildQuickPickItems };
