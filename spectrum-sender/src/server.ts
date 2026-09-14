import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { sendToPersistedSpace } from './send.ts';

const PORT = Number(process.env.PORT ?? '8788');
const TOKEN = process.env.SPECTRUM_BRIDGE_TOKEN ?? '';
const sentGuids = new Map<string, string | null>();

type SpectrumApp = Awaited<ReturnType<typeof Spectrum>>;

let spectrumApp: Promise<SpectrumApp> | undefined;

const app = new Hono();

app.get('/health', (c) =>
	c.json({
		ok: true,
		spectrumConfigured: Boolean(
			process.env.SPECTRUM_PROJECT_ID && process.env.SPECTRUM_PROJECT_SECRET,
		),
	}),
);

app.post('/send', async (c) => {
	if (!TOKEN || !bearerMatches(c.req.header('Authorization'), TOKEN)) {
		return c.json({ ok: false, reason: 'Unauthorized' }, 401);
	}

	const body = await c.req.json().catch(() => null);
	const request = parseSendBody(body);
	if (!request.ok) {
		return c.json({ ok: false, reason: request.reason }, 400);
	}

	const prior = sentGuids.get(request.value.clientGuid);
	if (prior !== undefined) {
		return c.json({ ok: true, deduplicated: true, providerMessageId: prior });
	}

	try {
		const im = imessage(await getSpectrum());
		const sent = await sendToPersistedSpace(
			im,
			{
				spaceId: request.value.spaceId,
				spaceType: request.value.spaceType,
				...(request.value.phone === undefined ? {} : { phone: request.value.phone }),
			},
			request.value.text,
		);
		sentGuids.set(request.value.clientGuid, sent.providerMessageId);
		return c.json({ ok: true, providerMessageId: sent.providerMessageId });
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Spectrum send failed';
		return c.json({ ok: false, reason }, 502);
	}
});

function getSpectrum(): Promise<SpectrumApp> {
	const projectId = process.env.SPECTRUM_PROJECT_ID;
	const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
	if (!projectId || !projectSecret) {
		throw new Error('SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET are required to send');
	}
	spectrumApp ??= Spectrum({
		projectId,
		projectSecret,
		providers: [imessage.config()],
	});
	return spectrumApp;
}

function bearerMatches(header: string | undefined, expected: string): boolean {
	if (!header?.startsWith('Bearer ')) return false;
	const provided = header.slice('Bearer '.length);
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

function parseSendBody(body: unknown):
	| {
			ok: true;
			value: {
				spaceId: string;
				spaceType: 'dm' | 'group';
				phone?: string;
				text: string;
				clientGuid: string;
			};
	  }
	| { ok: false; reason: string } {
	if (typeof body !== 'object' || body === null) {
		return { ok: false, reason: 'JSON body required' };
	}
	const record = body as Record<string, unknown>;
	if (typeof record.spaceId !== 'string' || record.spaceId.length === 0) {
		return { ok: false, reason: 'spaceId is required' };
	}
	if (record.spaceType !== 'dm' && record.spaceType !== 'group') {
		return { ok: false, reason: 'spaceType must be dm or group' };
	}
	if (typeof record.text !== 'string' || record.text.length === 0) {
		return { ok: false, reason: 'text is required' };
	}
	if (typeof record.clientGuid !== 'string' || record.clientGuid.length === 0) {
		return { ok: false, reason: 'clientGuid is required' };
	}
	return {
		ok: true,
		value: {
			spaceId: record.spaceId,
			spaceType: record.spaceType,
			...(typeof record.phone === 'string' ? { phone: record.phone } : {}),
			text: record.text,
			clientGuid: record.clientGuid,
		},
	};
}

serve({ fetch: app.fetch, port: PORT });
console.log(`spectrum-sender listening on ${PORT}`);
