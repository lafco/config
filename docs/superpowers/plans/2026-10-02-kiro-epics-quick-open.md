# Kiro Epics Quick Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Kiro shortcut that searches and opens files under `~/epics` from any workspace, and switch Kiro's file/folder dialogs to its internal UI.

**Architecture:** Add a small local Kiro extension to the existing Stow package. It enumerates files on each invocation, presents a searchable Quick Pick, and opens the selected resource in Kiro. The extension runs in the local UI host and uses a pure filesystem module that can be tested with Node's built-in test runner.

**Tech Stack:** Kiro/VS Code Extension API, CommonJS JavaScript, Node.js 22 built-in `node:test`, GNU Stow.

**Spec:** `docs/superpowers/specs/2026-10-02-kiro-epics-quick-open-design.md`

## Global Constraints

- Resolve the search root as `path.join(os.homedir(), "epics")`.
- Enumerate recursively without filtering by file extension or consulting workspace folders.
- Open selected files in the Kiro editor without changing the workspace.
- Run the extension in the local UI host, including when the active workspace is remote.
- Set global user setting `files.simpleDialog.enable` to `true`.
- Keep `Ctrl+Shift+F` and `Ctrl+Shift+O` unchanged; assign `Ctrl+Shift+E` only to `lafco.epicsQuickOpen` and unbind its default Explorer action.
- Refresh the file list for every command invocation; do not add a cache or external dependency.
- Keep implementation changes unstaged and uncommitted for user review.

## Review Focus

- Nested files and repeated basenames: verify every path appears and the relative path distinguishes equal names.
- Hidden, extensionless, Markdown, and diff files: verify enumeration does not filter them by name or extension.
- Missing or unreadable root: verify enumeration reports an error and the command gives feedback without changing the workspace.
- Empty `~/epics`: verify enumeration returns an empty list and the command gives useful feedback.
- A non-`~/epics` or remote workspace: manually verify the extension reads the local home directory and opens the result without changing workspace roots.

---

### Task 1: Add the Kiro Epics Quick Open extension and global bindings

**Files:**
- Create: `kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/package.json`
- Create: `kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/extension.js`
- Create: `kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/files.js`
- Test: `kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/files.test.js`
- Test: `kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/extension.test.js`
- Modify: `kiro/.config/Kiro/User/settings.json`
- Modify: `kiro/.config/Kiro/User/keybindings.json`

**Interfaces:**
- Consumes: Node.js `fs.promises`, `node:path`, `node:os`, and Kiro's `vscode` extension API.
- Produces: `collectFiles(root, io = fs.promises) -> Promise<string[]>`, returning sorted absolute paths; `buildQuickPickItems(files, root) -> Array<{ label: string, description: string, filePath: string }>`; `activate(context, vscodeApi = require("vscode"), root = path.join(os.homedir(), "epics"))`; extension command `lafco.epicsQuickOpen`.

- [ ] **Step 1: Write failing tests for file enumeration and Quick Pick items**

  Cover recursive nested paths and deterministic ordering; hidden and extensionless files; `.md` and `.diff` files; duplicate basenames with distinct relative paths; an empty root; and missing/unreadable roots. Inject an `io.readdir` fake that rejects with `ENOENT` or `EACCES` to test error propagation without depending on host permissions.

- [ ] **Step 2: Run the tests and verify RED**

  Run: `node --test kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/files.test.js`
  Expected: FAIL because `files.js` and its exported functions do not exist yet.

- [ ] **Step 3: Implement the pure filesystem helpers in `files.js`**

  Implement `collectFiles(root, io = fs.promises)` using `readdir(..., { withFileTypes: true })`. Recursively enumerate regular files under the supplied root, preserve all filenames without extension filters, sort absolute paths, and propagate errors. Implement `buildQuickPickItems(files, root)` with basename `label`, root-relative `description`, and absolute `filePath`.

- [ ] **Step 4: Run the tests and verify GREEN**

  Run: `node --test kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/files.test.js`
  Expected: all enumeration and item-building tests pass.

- [ ] **Step 5: Write failing tests for the extension command**

  Add `extension.test.js` using real temporary files and a fake Kiro API at the extension boundary. Cover command registration under `lafco.epicsQuickOpen`, opening the selected URI with `vscode.open`, no opening on cancellation, user feedback for empty/unreadable roots, and feedback if opening a selected file fails.

- [ ] **Step 6: Run the extension tests and verify RED**

  Run: `node --test kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/extension.test.js`
  Expected: FAIL because `extension.js` does not export `activate` yet.

- [ ] **Step 7: Add the extension manifest and command handler**

  Set `publisher: "lafco"`, `name: "epics-quick-open"`, `version: "0.1.0"`, `main: "./extension.js"`, `engines.vscode: "^1.75.1"`, `extensionKind: ["ui"]`, activation on `lafco.epicsQuickOpen`, and the contributed command title. Add no runtime dependencies. Implement `activate(context, vscodeApi = require("vscode"), root = path.join(os.homedir(), "epics"))`; register the command, enumerate files, display a searchable Quick Pick matching name and relative path, and open the selected file with Kiro's `vscode.open` command. Show useful feedback for scan/open errors and an empty directory; rescan on each invocation.

- [ ] **Step 8: Run both unit test files and verify GREEN**

  Run: `node --test kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/files.test.js kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/test/extension.test.js`
  Expected: all filesystem and command-orchestration tests pass.

- [ ] **Step 9: Update global settings and keybindings**

  Add `"files.simpleDialog.enable": true` to `settings.json`. In `keybindings.json`, unbind `workbench.view.explorer` from `ctrl+shift+e`, then bind that key to `lafco.epicsQuickOpen`. Preserve the existing `ctrl+shift+f` and `ctrl+shift+o` entries and the custom `ctrl+e` Explorer binding.

- [ ] **Step 10: Validate syntax and the Stow target**

  Run: `node --check kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/extension.js`
  Run: `node --check kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/files.js`
  Run: `node -e 'JSON.parse(require("node:fs").readFileSync("kiro/.kiro/extensions/lafco.epics-quick-open-0.1.0/package.json", "utf8")); JSON.parse(require("node:fs").readFileSync("kiro/.config/Kiro/User/settings.json", "utf8"))'`
  Run: `./dot stow -n kiro`
  Expected: JavaScript and JSON parse successfully; Stow's dry run proposes the extension path under `~/.kiro/extensions/` without conflicts. It may show unlink/relink operations for the same existing Kiro settings/keybindings symlinks because the CLI uses `stow -R`; confirm it proposes no changes to unrelated packages. Confirm the JSONC keybindings in Kiro during the manual check.

- [ ] **Step 11: Apply Stow and run Kiro validation**

  Run: `./dot stow kiro`, then restart/reload Kiro. If the extension is not recognized from the Stow link, use the documented local VSIX installation route `kiro --install-extension <arquivo.vsix>` and record that result.

  In a workspace other than `~/epics`, verify `Ctrl+Shift+E` lists and filters files from `~/epics`, selecting a result opens it inside Kiro, and the workspace roots do not change. Verify `Ctrl+E` still focuses Explorer and `Ctrl+Shift+F`/`Ctrl+Shift+O` use the internal Kiro dialogs rather than the system file picker.

- [ ] **Step 12: Leave implementation changes unstaged**

  Run: `git status --short` and `git diff --cached --exit-code`.
  Expected: implementation files are modified/untracked but none are staged; do not create an implementation commit.
