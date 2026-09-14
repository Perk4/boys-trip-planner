const MAX_EXTRACT_CHARS = 20_000;

export function extractReadableText(
	htmlOrText: string,
	maxChars: number = MAX_EXTRACT_CHARS,
): string {
	const withoutChrome = htmlOrText
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
	const text = withoutChrome
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length <= maxChars ? text : text.slice(0, maxChars);
}
