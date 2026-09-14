export interface BridgeSendRequest {
	spaceId: string;
	spaceType: 'dm' | 'group';
	phone?: string;
	senderId?: string;
	text: string;
	clientGuid: string;
}

export interface BridgeSendResult {
	ok: boolean;
	deduplicated?: boolean;
	providerMessageId?: string | null;
	reason?: string;
}

export async function sendViaSpectrumBridge(
	env: { url: string | undefined; token: string | undefined },
	request: BridgeSendRequest,
	signal?: AbortSignal,
): Promise<BridgeSendResult> {
	if (!env.url) {
		return { ok: false, reason: 'SPECTRUM_BRIDGE_URL is not set.' };
	}
	if (!env.token) {
		return { ok: false, reason: 'SPECTRUM_BRIDGE_TOKEN is not set.' };
	}

	let target: URL;
	try {
		target = new URL('send', env.url.endsWith('/') ? env.url : `${env.url}/`);
	} catch {
		return { ok: false, reason: 'SPECTRUM_BRIDGE_URL is not a valid URL.' };
	}
	if (target.protocol !== 'http:' && target.protocol !== 'https:') {
		return { ok: false, reason: 'SPECTRUM_BRIDGE_URL must be http(s).' };
	}

	const response = await fetch(target, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${env.token}`,
		},
		body: JSON.stringify(request),
		signal: signal ?? AbortSignal.timeout(20_000),
	});

	const parsed = await readJson(response);
	if (!isBridgeSendResult(parsed)) {
		return {
			ok: false,
			reason: `Spectrum bridge returned ${response.status} without a usable body.`,
		};
	}
	if (!response.ok && parsed.ok) {
		return { ok: false, reason: `Spectrum bridge returned ${response.status}.` };
	}
	return parsed;
}

async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text.trim() === '') return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function isBridgeSendResult(value: unknown): value is BridgeSendResult {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return typeof record.ok === 'boolean';
}
