export function timingSafeEqualString(left: string, right: string): boolean {
	const encoder = new TextEncoder();
	const a = encoder.encode(left);
	const b = encoder.encode(right);
	if (a.byteLength !== b.byteLength) return false;
	if (typeof crypto.subtle.timingSafeEqual === 'function') {
		return crypto.subtle.timingSafeEqual(a, b);
	}
	let mismatch = 0;
	for (let i = 0; i < a.byteLength; i += 1) {
		mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
	}
	return mismatch === 0;
}
