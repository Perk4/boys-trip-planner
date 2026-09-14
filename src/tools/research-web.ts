import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { extractReadableText } from '../lib/extract-text.ts';
import { readBoundedText } from '../lib/read-bounded.ts';

export const researchWeb = defineTool({
	name: 'research_web',
	description:
		'Fetch one public http(s) URL and return extracted text. No browser. Use for venue hours, flight pages, and similar research.',
	input: v.object({
		url: v.pipe(v.string(), v.url()),
	}),
	output: v.object({
		url: v.string(),
		status: v.number(),
		contentType: v.optional(v.string()),
		text: v.string(),
		truncated: v.boolean(),
	}),
	async run({ data, signal }) {
		const url = new URL(data.url);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new Error('research_web only accepts http(s) URLs');
		}
		const response = await fetch(url, {
			method: 'GET',
			redirect: 'follow',
			signal: signal ?? AbortSignal.timeout(10_000),
			headers: { Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1' },
		});
		const raw = await readBoundedText(response);
		const text = extractReadableText(raw);
		return {
			output: {
				url: response.url,
				status: response.status,
				contentType: response.headers.get('content-type') ?? undefined,
				text,
				truncated: raw.length >= 64_000 || text.length >= 20_000,
			},
		};
	},
});
