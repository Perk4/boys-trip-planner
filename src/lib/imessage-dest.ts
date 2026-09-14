import type { IMessageSpaceType } from './imessage-event.ts';

export interface BoundIMessageSpace {
	spaceId: string;
	spaceType: IMessageSpaceType;
	phone: string;
	senderId?: string;
}

export function boundSpaceFromInitialData(data: {
	spaceId?: string;
	spaceType?: IMessageSpaceType;
	phone?: string;
	senderId?: string;
} | undefined): BoundIMessageSpace | undefined {
	if (data?.spaceId === undefined) return undefined;
	return {
		spaceId: data.spaceId,
		spaceType: data.spaceType ?? 'dm',
		phone: data.phone ?? 'shared',
		...(data.senderId === undefined ? {} : { senderId: data.senderId }),
	};
}
