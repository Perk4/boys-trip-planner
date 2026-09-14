import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { getTelegramClient } from '../channels/telegram-client.ts';
import {
	claimKey,
	inspectKey,
	markSent,
	OUTBOUND_LEDGER_PATH,
	parseLedger,
	serializeLedger,
} from '../lib/outbound-ledger.ts';

export interface BoundTelegramChat {
	chatId: number;
	messageThreadId?: number;
}

export function postToChannel(dest: BoundTelegramChat | undefined) {
	return defineTool({
		name: 'post_to_channel',
		description:
			'Post text to the Telegram group bound to this trip. Always pass a stable idempotencyKey so retries do not double-send.',
		harness: true,
		input: v.object({
			text: v.pipe(v.string(), v.minLength(1)),
			idempotencyKey: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
		}),
		output: v.object({
			ok: v.boolean(),
			reason: v.optional(v.string()),
			deduplicated: v.optional(v.boolean()),
			providerMessageId: v.optional(v.nullable(v.string())),
			messageId: v.optional(v.number()),
		}),
		async run({ data, harness }) {
			if (!dest) {
				return {
					output: {
						ok: false,
						reason: 'No Telegram destination is bound to this conversation.',
					},
				};
			}

			const raw = (await harness.sandbox.exists(OUTBOUND_LEDGER_PATH))
				? await harness.sandbox.readFile(OUTBOUND_LEDGER_PATH)
				: null;
			const current = parseLedger(raw);
			const existing = inspectKey(current, data.idempotencyKey);
			if (existing?.status === 'sent') {
				return {
					output: {
						ok: true,
						deduplicated: true,
						providerMessageId: existing.providerMessageId ?? null,
					},
				};
			}

			const claimed = claimKey(current, data.idempotencyKey, Date.now());
			if (claimed.created) {
				await harness.sandbox.writeFile(OUTBOUND_LEDGER_PATH, serializeLedger(claimed.ledger));
			}

			const client = getTelegramClient();
			if (!client) {
				return { output: { ok: false, reason: 'TELEGRAM_BOT_TOKEN is not set.' } };
			}

			const message = await client.sendMessage(dest.chatId, data.text, {
				...(dest.messageThreadId ? { message_thread_id: dest.messageThreadId } : {}),
			});
			const sent = markSent(claimed.ledger, data.idempotencyKey, String(message.message_id));
			await harness.sandbox.writeFile(OUTBOUND_LEDGER_PATH, serializeLedger(sent));
			return { output: { ok: true, messageId: message.message_id } };
		},
	});
}
