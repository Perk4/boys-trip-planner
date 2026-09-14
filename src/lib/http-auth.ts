export function bearerMatches(header: string | undefined, expected: string): boolean {
	if (!header) return false;
	const prefix = 'Bearer ';
	if (!header.startsWith(prefix)) return false;
	const provided = header.slice(prefix.length);
	return timingSafeEqualString(provided, expected);
}

function timingSafeEqualString(left: string, right: string): boolean {
	const encoder = new TextEncoder();
	const a = encoder.encode(left);
	const b = encoder.encode(right);
	if (a.byteLength !== b.byteLength) return false;
	return crypto.subtle.timingSafeEqual(a, b);
}
