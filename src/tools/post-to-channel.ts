import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import type { BoundIMessageSpace } from '../lib/imessage-dest.ts';
import {
	claimKey,
	inspectKey,
	markSent,
	OUTBOUND_LEDGER_PATH,
	parseLedger,
	serializeLedger,
} from '../lib/outbound-ledger.ts';
import { sendViaSpectrumBridge } from '../lib/spectrum-bridge.ts';

export function postToChannel(dest: BoundIMessageSpace | undefined) {
	return defineTool({
		name: 'post_to_channel',
		description:
			'Post text to the iMessage space bound to this trip (Photon sidecar). Always pass a stable idempotencyKey so retries do not double-send.',
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
		}),
		async run({ data, harness, signal }) {
			if (!dest) {
				return {
					output: {
						ok: false,
						reason: 'No iMessage space is bound to this conversation.',
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

			const sent = await sendViaSpectrumBridge(
				{
					url: process.env.SPECTRUM_BRIDGE_URL,
					token: process.env.SPECTRUM_BRIDGE_TOKEN,
				},
				{
					spaceId: dest.spaceId,
					spaceType: dest.spaceType,
					phone: dest.phone,
					...(dest.senderId === undefined ? {} : { senderId: dest.senderId }),
					text: data.text,
					clientGuid: data.idempotencyKey,
				},
				signal,
			);

			if (!sent.ok) {
				return { output: { ok: false, reason: sent.reason } };
			}

			if (sent.providerMessageId) {
				const marked = markSent(claimed.ledger, data.idempotencyKey, sent.providerMessageId);
				await harness.sandbox.writeFile(OUTBOUND_LEDGER_PATH, serializeLedger(marked));
			} else {
				const marked = markSent(claimed.ledger, data.idempotencyKey, sent.deduplicated ? 'deduplicated' : 'sent');
				await harness.sandbox.writeFile(OUTBOUND_LEDGER_PATH, serializeLedger(marked));
			}

			return {
				output: {
					ok: true,
					deduplicated: sent.deduplicated,
					providerMessageId: sent.providerMessageId ?? null,
				},
			};
		},
	});
}
