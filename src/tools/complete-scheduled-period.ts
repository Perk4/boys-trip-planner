import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import {
	isTaskSlug,
	markTaskPeriod,
	parseScheduledTask,
	serializeScheduledTask,
	taskFilePath,
} from '../lib/scheduled-task.ts';

export const completeScheduledPeriod = defineTool({
	name: 'complete_scheduled_period',
	description:
		'Mark a scheduled research task as finished for one cadence period so the next tick will not redo it.',
	harness: true,
	input: v.object({
		taskId: v.pipe(
			v.string(),
			v.check((value) => isTaskSlug(value), 'Must be a lowercase hyphenated slug'),
		),
		period: v.pipe(v.string(), v.minLength(1), v.maxLength(32)),
	}),
	output: v.object({
		ok: v.boolean(),
		reason: v.optional(v.string()),
		lastPeriod: v.optional(v.string()),
	}),
	async run({ data, harness }) {
		const path = taskFilePath(data.taskId);
		if (!(await harness.sandbox.exists(path))) {
			return { output: { ok: false, reason: `No scheduled task ${data.taskId}` } };
		}
		const current = parseScheduledTask(await harness.sandbox.readFile(path));
		const updated = markTaskPeriod(current, data.period, new Date().toISOString());
		await harness.sandbox.writeFile(path, serializeScheduledTask(updated));
		return { output: { ok: true, lastPeriod: updated.lastPeriod } };
	},
});
