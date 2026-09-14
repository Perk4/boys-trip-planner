const TRIP_CONVERSATION_ID = /^trip:[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_TRIP_CONVERSATION_ID = 'trip:boys-vegas-2026';

export function isTripConversationId(id: string): boolean {
	return TRIP_CONVERSATION_ID.test(id);
}

export function tripConversationId(raw: string): string {
	const normalized = raw.trim().toLowerCase();
	const id = normalized.startsWith('trip:') ? normalized : `trip:${normalized}`;
	if (!isTripConversationId(id)) {
		throw new Error(`Invalid trip conversation id: ${raw}`);
	}
	return id;
}

export function resolveTripConversationId(envValue: string | undefined): string {
	if (envValue && isTripConversationId(envValue)) return envValue;
	return DEFAULT_TRIP_CONVERSATION_ID;
}
