export const TASKS_DIR = '/workspace/tasks';
export const TASKS_INDEX_PATH = `${TASKS_DIR}/index.json`;

export type TaskCadence = 'hourly' | 'daily' | 'weekly';
export type TaskStatus = 'active' | 'paused' | 'done';

export interface ScheduledTask {
	id: string;
	section: string;
	goal: string;
	cadence: TaskCadence;
	status: TaskStatus;
	createdAt: string;
	lastPeriod?: string;
	lastRanAt?: string;
}

export interface TaskIndex {
	version: 1;
	ids: string[];
}

export interface CadencePeriods {
	hourly: string;
	daily: string;
	weekly: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isTaskSlug(value: string): boolean {
	return SLUG.test(value);
}

export function taskFilePath(id: string): string {
	return `${TASKS_DIR}/${id}.json`;
}

export function emptyTaskIndex(): TaskIndex {
	return { version: 1, ids: [] };
}

export function parseTaskIndex(raw: string | null): TaskIndex {
	if (raw === null || raw.trim() === '') return emptyTaskIndex();
	const parsed: unknown = JSON.parse(raw);
	if (!isTaskIndex(parsed)) {
		throw new Error('Scheduled task index is malformed');
	}
	return parsed;
}

export function parseScheduledTask(raw: string): ScheduledTask {
	const parsed: unknown = JSON.parse(raw);
	if (!isScheduledTask(parsed)) {
		throw new Error('Scheduled task file is malformed');
	}
	return parsed;
}

export function serializeTaskIndex(index: TaskIndex): string {
	return `${JSON.stringify(index, null, 2)}\n`;
}

export function serializeScheduledTask(task: ScheduledTask): string {
	return `${JSON.stringify(task, null, 2)}\n`;
}

export function upsertTaskIndex(index: TaskIndex, id: string): TaskIndex {
	if (index.ids.includes(id)) return index;
	return { version: 1, ids: [...index.ids, id] };
}

export function periodForCadence(cadence: TaskCadence, periods: CadencePeriods): string {
	switch (cadence) {
		case 'hourly':
			return periods.hourly;
		case 'daily':
			return periods.daily;
		case 'weekly':
			return periods.weekly;
		default: {
			const _never: never = cadence;
			throw new Error(`Unhandled cadence: ${_never}`);
		}
	}
}

export function isTaskDue(task: ScheduledTask, periods: CadencePeriods): boolean {
	if (task.status !== 'active') return false;
	return task.lastPeriod !== periodForCadence(task.cadence, periods);
}

export function markTaskPeriod(task: ScheduledTask, period: string, ranAt: string): ScheduledTask {
	return { ...task, lastPeriod: period, lastRanAt: ranAt };
}

function isTaskIndex(value: unknown): value is TaskIndex {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.ids)) return false;
	return value.ids.every((id) => typeof id === 'string' && isTaskSlug(id));
}

function isScheduledTask(value: unknown): value is ScheduledTask {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === 'string' &&
		isTaskSlug(value.id) &&
		typeof value.section === 'string' &&
		isTaskSlug(value.section) &&
		typeof value.goal === 'string' &&
		value.goal.length > 0 &&
		isCadence(value.cadence) &&
		isStatus(value.status) &&
		typeof value.createdAt === 'string' &&
		(value.lastPeriod === undefined || typeof value.lastPeriod === 'string') &&
		(value.lastRanAt === undefined || typeof value.lastRanAt === 'string')
	);
}

function isCadence(value: unknown): value is TaskCadence {
	return value === 'hourly' || value === 'daily' || value === 'weekly';
}

function isStatus(value: unknown): value is TaskStatus {
	return value === 'active' || value === 'paused' || value === 'done';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
