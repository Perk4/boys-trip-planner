const DEFAULT_MAX_BYTES = 64_000;

export async function readBoundedText(
	response: Response,
	maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<string> {
	const body = response.body;
	if (!body) return '';
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (total < maxBytes) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			const remaining = maxBytes - total;
			chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
			total += Math.min(value.byteLength, remaining);
		}
	} finally {
		await reader.cancel();
	}
	return new TextDecoder().decode(concatBytes(chunks));
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
	const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}
