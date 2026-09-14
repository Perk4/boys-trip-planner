import { createTelegramChannel } from '@flue/telegram';
import { dispatch } from '@flue/runtime';
import type { Message } from 'grammy/types';
import { TripPlanner } from '../agents/trip-planner.ts';
import { resolveTripConversationId } from '../lib/trip-id.ts';

function telegramWebhookSecret(): string {
	const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
	if (secret && /^[A-Za-z0-9_-]+$/.test(secret)) return secret;
	// Local HTTP path only. Production must set TELEGRAM_WEBHOOK_SECRET_TOKEN.
	return 'dev-unset-not-a-secret';
}

export const channel = createTelegramChannel({
	secretToken: telegramWebhookSecret(),
	async webhook({ update }) {
		const incoming = update.message ?? update.channel_post ?? update.business_message;
		if (!incoming) return;

		const tripId = resolveTripConversationId(process.env.TRIP_CONVERSATION_ID);
		await dispatch(TripPlanner, {
			id: tripId,
			idempotencyKey: `telegram.update:${update.update_id}`,
			initialData: conversationData(incoming),
			message: {
				kind: 'signal',
				type: 'telegram.message',
				body: messageBody(incoming),
				attributes: {
					updateId: String(update.update_id),
					chatId: String(incoming.chat.id),
					...(incoming.from?.id === undefined ? {} : { fromId: String(incoming.from.id) }),
				},
			},
		});
	},
});

function messageBody(message: Message): string {
	if (message.text !== undefined) return message.text;
	if (message.caption !== undefined) return message.caption;
	if (message.photo) return '[photo message]';
	if (message.video) return '[video message]';
	if (message.voice) return '[voice message]';
	if (message.document) return '[document message]';
	if (message.sticker) return '[sticker message]';
	return '[non-text message]';
}

function conversationData(message: Message) {
	return {
		channel: 'telegram' as const,
		type: 'chat' as const,
		chatId: message.chat.id,
		...(message.message_thread_id === undefined
			? {}
			: { messageThreadId: message.message_thread_id }),
		...(message.chat.title === undefined ? {} : { chatTitle: message.chat.title }),
	};
}
