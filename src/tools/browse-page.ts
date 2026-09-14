import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

function isBrowserEnabled(value: string | undefined): boolean {
	return value === 'true';
}

export const browsePage = defineTool({
	name: 'browse_page',
	description:
		'Cloudflare Browser Rendering stub. Disabled unless ENABLE_BROWSER=true. Prefer research_web.',
	input: v.object({
		url: v.pipe(v.string(), v.url()),
	}),
	async run({ data }) {
		if (!isBrowserEnabled(process.env.ENABLE_BROWSER as string | undefined)) {
			return {
				output: {
					disabled: true,
					url: data.url,
					reason: 'ENABLE_BROWSER is false. Use research_web (fetch) instead.',
				},
			};
		}
		return {
			output: {
				disabled: true,
				url: data.url,
				reason: 'Browser Rendering is not wired in this slice.',
			},
		};
	},
});
