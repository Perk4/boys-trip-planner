import { timingSafeEqualString } from './timing-safe.ts';

export const SPECTRUM_REPLAY_WINDOW_SECONDS = 5 * 60;

export type SpectrumVerifyFailure = {
	ok: false;
	status: 400 | 401;
	reason: string;
};

export type SpectrumVerifySuccess = { ok: true };

export type SpectrumVerifyResult = SpectrumVerifySuccess | SpectrumVerifyFailure;

export async function verifySpectrumWebhook(input: {
	rawBody: string;
	secret: string;
	timestamp: string | undefined;
	signature: string | undefined;
	nowSeconds: number;
}): Promise<SpectrumVerifyResult> {
	if (!input.timestamp || !input.signature) {
		return { ok: false, status: 400, reason: 'missing headers' };
	}

	const timestamp = Number(input.timestamp);
	const age = Math.abs(input.nowSeconds - timestamp);
	if (!Number.isFinite(age) || age > SPECTRUM_REPLAY_WINDOW_SECONDS) {
		return { ok: false, status: 400, reason: 'stale timestamp' };
	}

	const expected = `v0=${await hmacSha256Hex(input.secret, `v0:${input.timestamp}:${input.rawBody}`)}`;
	if (!timingSafeEqualString(expected, input.signature)) {
		return { ok: false, status: 401, reason: 'bad signature' };
	}

	return { ok: true };
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	return bytesToHex(signature);
}

function bytesToHex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
