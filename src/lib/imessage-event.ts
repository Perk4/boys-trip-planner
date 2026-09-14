export type IMessageSpaceType = 'dm' | 'group';

export interface IMessageInbound {
	messageId: string;
	spaceId: string;
	spaceType: IMessageSpaceType;
	phone: string;
	senderId?: string;
	body: string;
}

export function parseIMessageMessagesEvent(rawBody: string): IMessageInbound | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || parsed.event !== 'messages') return null;

	const space = isRecord(parsed.space) ? parsed.space : null;
	const message = isRecord(parsed.message) ? parsed.message : null;
	if (!space || !message) return null;

	const spaceId = requiredString(space.id);
	const messageId = requiredString(message.id);
	if (!spaceId || !messageId) return null;

	const sender = isRecord(message.sender) ? requiredString(message.sender.id) : undefined;

	return {
		messageId,
		spaceId,
		spaceType: space.type === 'group' ? 'group' : 'dm',
		phone: requiredString(space.phone) ?? 'shared',
		...(sender === undefined ? {} : { senderId: sender }),
		body: contentBody(message.content),
	};
}

export function inboundToInitialData(event: IMessageInbound) {
	return {
		channel: 'imessage' as const,
		spaceId: event.spaceId,
		spaceType: event.spaceType,
		phone: event.phone,
		...(event.senderId === undefined ? {} : { senderId: event.senderId }),
	};
}

function contentBody(content: unknown): string {
	if (!isRecord(content)) return '[non-text message]';
	if (content.type === 'text' && typeof content.text === 'string') return content.text;
	if (typeof content.type === 'string') return `[${content.type} message]`;
	return '[non-text message]';
}

function requiredString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
