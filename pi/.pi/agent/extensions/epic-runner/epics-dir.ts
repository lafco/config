/**
 * Resolução do diretório de epics, compartilhada pelas tools do epic-runner.
 *
 * Fica separado de `tasks.ts` para que as funções puras (parse, seleção de
 * onda, conflitos) continuem testáveis sem depender do runtime do pi.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface SecretsShape {
	epicsDir?: string;
}

/** `epicsDir` (secrets) → `EPICS_DIR` (env) → `~/epics`. */
export function resolveEpicsDir(agentDir = getAgentDir()): string {
	try {
		const file = path.join(agentDir, "secrets.json");
		if (fs.existsSync(file)) {
			const data = JSON.parse(fs.readFileSync(file, "utf8")) as SecretsShape;
			const configured = data.epicsDir?.trim();
			if (configured) return path.resolve(configured);
		}
	} catch {
		// best effort: cai no padrão
	}
	const envDir = process.env.EPICS_DIR?.trim();
	if (envDir) return path.resolve(envDir);
	return path.join(os.homedir(), "epics");
}
