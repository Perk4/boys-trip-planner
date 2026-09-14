import type { SandboxFactory } from '@flue/runtime';
import { emptyLedger, OUTBOUND_LEDGER_PATH, serializeLedger } from './outbound-ledger.ts';
import { seedItineraryMarkdown } from './itinerary-seed.ts';
import { SECTIONS_DIR, seedSectionMarkdown, sectionFilePath } from './section-files.ts';
import { emptyTaskIndex, serializeTaskIndex, TASKS_INDEX_PATH } from './scheduled-task.ts';
import { getComputerSandbox } from '../sandboxes/cloudflare-computer.ts';

const ITINERARY_PATH = '/workspace/itinerary.md';
const MADRID_SECTION = 'madrid';

export function tripWorkspaceSandbox(loader: WorkerLoader): SandboxFactory {
	const computer = getComputerSandbox({ loader });
	return {
		async createSandbox(options) {
			const sandbox = await computer.createSandbox(options);
			if (!(await sandbox.exists(ITINERARY_PATH))) {
				await sandbox.writeFile(ITINERARY_PATH, seedItineraryMarkdown(options.id));
			}
			if (!(await sandbox.exists(OUTBOUND_LEDGER_PATH))) {
				await sandbox.writeFile(OUTBOUND_LEDGER_PATH, serializeLedger(emptyLedger()));
			}
			const madridPath = sectionFilePath(MADRID_SECTION);
			if (!(await sandbox.exists(madridPath))) {
				await sandbox.writeFile(madridPath, seedSectionMarkdown(MADRID_SECTION));
			}
			if (!(await sandbox.exists(TASKS_INDEX_PATH))) {
				await sandbox.writeFile(TASKS_INDEX_PATH, serializeTaskIndex(emptyTaskIndex()));
			}
			if (!(await sandbox.exists(`${SECTIONS_DIR}/.keep`))) {
				await sandbox.writeFile(`${SECTIONS_DIR}/.keep`, '');
			}
			return sandbox;
		},
	};
}
