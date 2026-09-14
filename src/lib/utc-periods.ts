export function utcDayIso(at: Date = new Date()): string {
	return at.toISOString().slice(0, 10);
}

export function utcHourIso(at: Date): string {
	return at.toISOString().slice(0, 13);
}

/** ISO week id, e.g. `2026-W37`. */
export function utcIsoWeek(at: Date): string {
	const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
	const dayNum = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function intervalBucket(at: Date, intervalSeconds: number): number {
	return Math.floor(at.getTime() / 1000 / intervalSeconds);
}

export function dateFromIntervalBucket(bucket: number, intervalSeconds: number): Date {
	return new Date(bucket * intervalSeconds * 1000);
}
