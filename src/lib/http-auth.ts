import { timingSafeEqualString } from './timing-safe.ts';

export function bearerMatches(header: string | undefined, expected: string): boolean {
	if (!header) return false;
	const prefix = 'Bearer ';
	if (!header.startsWith(prefix)) return false;
	return timingSafeEqualString(header.slice(prefix.length), expected);
}
