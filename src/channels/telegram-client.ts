import { Api } from 'grammy';

let cached: Api | null | undefined;

export function getTelegramClient(): Api | null {
	if (cached !== undefined) return cached;
	const token = process.env.TELEGRAM_BOT_TOKEN;
	cached = token ? new Api(token) : null;
	return cached;
}
