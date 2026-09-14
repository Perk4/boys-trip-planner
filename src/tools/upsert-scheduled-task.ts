import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { seedSectionMarkdown, sectionFilePath } from '../lib/section-files.ts';
import {
	isTaskSlug,
	parseScheduledTask,
	parseTaskIndex,
	serializeScheduledTask,
	serializeTaskIndex,
	taskFilePath,
	TASKS_INDEX_PATH,
	upsertTaskIndex,
	type ScheduledTask,
} from '../lib/scheduled-task.ts';
import { taskCadenceSchema, taskStatusSchema } from '../lib/trip-schemas.ts';

const slug = v.pipe(
	v.string(),
	v.check((value) => isTaskSlug(value), 'Must be a lowercase hyphenated slug'),
);

export const upsertScheduledTask = defineTool({
	name: 'upsert_scheduled_task',
	description:
		'Create or update a persisted research job (e.g. weekly Madrid hotel search). Writes /workspace/tasks and ensures /workspace/sections/<section>.md exists.',
	harness: true,
	input: v.object({
		id: slug,
		section: slug,
		goal: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
		cadence: taskCadenceSchema,
		status: v.optional(taskStatusSchema),
	}),
	output: v.object({
		ok: v.literal(true),
		task: v.object({
			id: v.string(),
			section: v.string(),
			goal: v.string(),
			cadence: taskCadenceSchema,
			status: taskStatusSchema,
			createdAt: v.string(),
			lastPeriod: v.optional(v.string()),
			lastRanAt: v.optional(v.string()),
		}),
		sectionCreated: v.boolean(),
	}),
	async run({ data, harness }) {
		const indexRaw = (await harness.sandbox.exists(TASKS_INDEX_PATH))
			? await harness.sandbox.readFile(TASKS_INDEX_PATH)
			: null;
		const index = parseTaskIndex(indexRaw);

		const path = taskFilePath(data.id);
		const existing = (await harness.sandbox.exists(path))
			? parseScheduledTask(await harness.sandbox.readFile(path))
			: undefined;

		const task: ScheduledTask = {
			id: data.id,
			section: data.section,
			goal: data.goal,
			cadence: data.cadence,
			status: data.status ?? existing?.status ?? 'active',
			createdAt: existing?.createdAt ?? new Date().toISOString(),
			...(existing?.lastPeriod === undefined ? {} : { lastPeriod: existing.lastPeriod }),
			...(existing?.lastRanAt === undefined ? {} : { lastRanAt: existing.lastRanAt }),
		};

		await harness.sandbox.writeFile(path, serializeScheduledTask(task));
		await harness.sandbox.writeFile(TASKS_INDEX_PATH, serializeTaskIndex(upsertTaskIndex(index, task.id)));

		const sectionPath = sectionFilePath(task.section);
		const sectionCreated = !(await harness.sandbox.exists(sectionPath));
		if (sectionCreated) {
			await harness.sandbox.writeFile(sectionPath, seedSectionMarkdown(task.section));
		}

		return { output: { ok: true, task, sectionCreated } };
	},
});
