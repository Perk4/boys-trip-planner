export const OUTBOUND_LEDGER_PATH = '/workspace/ledger/outbound.json';

export type OutboundStatus = 'claimed' | 'sent';

export interface OutboundEntry {
	key: string;
	claimedAt: number;
	status: OutboundStatus;
	providerMessageId?: string;
}

export interface OutboundLedger {
	entries: Record<string, OutboundEntry>;
}

export function emptyLedger(): OutboundLedger {
	return { entries: {} };
}

export function parseLedger(raw: string | null): OutboundLedger {
	if (raw === null || raw.trim() === '') return emptyLedger();
	const parsed: unknown = JSON.parse(raw);
	if (!isLedger(parsed)) {
		throw new Error('Outbound ledger file is malformed');
	}
	return parsed;
}

export function serializeLedger(ledger: OutboundLedger): string {
	return `${JSON.stringify(ledger, null, 2)}\n`;
}

export function inspectKey(
	ledger: OutboundLedger,
	key: string,
): OutboundEntry | undefined {
	return Object.prototype.hasOwnProperty.call(ledger.entries, key)
		? ledger.entries[key]
		: undefined;
}

export function claimKey(
	ledger: OutboundLedger,
	key: string,
	now: number,
): { ledger: OutboundLedger; entry: OutboundEntry; created: boolean } {
	const existing = inspectKey(ledger, key);
	if (existing) {
		return { ledger, entry: existing, created: false };
	}
	const entry: OutboundEntry = { key, claimedAt: now, status: 'claimed' };
	return {
		ledger: { entries: { ...ledger.entries, [key]: entry } },
		entry,
		created: true,
	};
}

export function markSent(
	ledger: OutboundLedger,
	key: string,
	providerMessageId: string,
): OutboundLedger {
	const existing = inspectKey(ledger, key);
	if (!existing) {
		throw new Error(`Cannot mark unknown ledger key sent: ${key}`);
	}
	return {
		entries: {
			...ledger.entries,
			[key]: { ...existing, status: 'sent', providerMessageId },
		},
	};
}

function isLedger(value: unknown): value is OutboundLedger {
	if (typeof value !== 'object' || value === null || !('entries' in value)) {
		return false;
	}
	const entries = value.entries;
	if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
		return false;
	}
	return Object.values(entries).every(isEntry);
}

function isEntry(value: unknown): value is OutboundEntry {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.key === 'string' &&
		typeof record.claimedAt === 'number' &&
		(record.status === 'claimed' || record.status === 'sent') &&
		(record.providerMessageId === undefined || typeof record.providerMessageId === 'string')
	);
}
