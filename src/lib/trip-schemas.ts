import * as v from 'valibot';

export const spaceTypeSchema = v.union([v.literal('dm'), v.literal('group')]);
export const taskCadenceSchema = v.union([
	v.literal('hourly'),
	v.literal('daily'),
	v.literal('weekly'),
]);
export const taskStatusSchema = v.union([
	v.literal('active'),
	v.literal('paused'),
	v.literal('done'),
]);
