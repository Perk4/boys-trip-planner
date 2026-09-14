export interface SpaceRoute {
	spaceId: string;
	spaceType: 'dm' | 'group';
	phone?: string;
}

export interface IMessageSpaceApi {
	space: {
		get(
			id: string,
			params?: { phone?: string },
		): Promise<{
			send: (text: string) => Promise<unknown>;
		}>;
	};
}

export async function sendToPersistedSpace(
	im: IMessageSpaceApi,
	route: SpaceRoute,
	text: string,
): Promise<{ providerMessageId: string | null }> {
	const params = routePhoneParams(route.phone);
	const space =
		params === undefined
			? await im.space.get(route.spaceId)
			: await im.space.get(route.spaceId, params);
	const sent = await space.send(text);
	return { providerMessageId: messageIdFromSend(sent) };
}

export function routePhoneParams(phone: string | undefined): { phone: string } | undefined {
	if (!phone || phone === 'shared') return undefined;
	return { phone };
}

function messageIdFromSend(sent: unknown): string | null {
	if (typeof sent !== 'object' || sent === null || !('id' in sent)) return null;
	return typeof sent.id === 'string' ? sent.id : null;
}
