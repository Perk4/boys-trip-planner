import type { SandboxFactory } from '@flue/runtime';
import { getComputerSandbox } from '../sandboxes/cloudflare-computer.ts';
import { seedItineraryMarkdown } from './itinerary-seed.ts';
import { emptyLedger, OUTBOUND_LEDGER_PATH, serializeLedger } from './outbound-ledger.ts';

const ITINERARY_PATH = '/workspace/itinerary.md';

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
			return sandbox;
		},
	};
}
