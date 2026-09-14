'use agent';
import { env } from 'cloudflare:workers';
import { dispatch, useInitialData, useModel, useSandbox, useTool } from '@flue/runtime';
import { extend } from '@flue/runtime/cloudflare';
import * as v from 'valibot';
import { agentEnvRecord, envIntervalSeconds } from '../lib/env-interval.ts';
import { boundSpaceFromInitialData } from '../lib/imessage-dest.ts';
import { spaceTypeSchema } from '../lib/trip-schemas.ts';
import {
	openDecisionsIdempotencyKey,
	openDecisionsMessage,
	utcDayIso,
} from '../lib/nudge-signal.ts';
import {
	researchTickClock,
	researchTickIdempotencyKey,
	researchTickMessage,
} from '../lib/research-tick-signal.ts';
import { isTripConversationId } from '../lib/trip-id.ts';
import { tripWorkspaceSandbox } from '../lib/trip-workspace.ts';
import { workspaceHost } from '../sandboxes/cloudflare-computer.ts';
import { browsePage } from '../tools/browse-page.ts';
import { completeScheduledPeriod } from '../tools/complete-scheduled-period.ts';
import { postToChannel } from '../tools/post-to-channel.ts';
import { researchWeb } from '../tools/research-web.ts';
import { upsertScheduledTask } from '../tools/upsert-scheduled-task.ts';

const tripInitialData = v.object({
	channel: v.optional(v.literal('imessage')),
	spaceId: v.optional(v.string()),
	spaceType: v.optional(spaceTypeSchema),
	phone: v.optional(v.string()),
	senderId: v.optional(v.string()),
});

export type TripInitialData = v.InferOutput<typeof tripInitialData>;

const DEFAULT_NUDGE_EVERY_SECONDS = 86_400;
const DEFAULT_TASK_TICK_EVERY_SECONDS = 3_600;
const MIN_SCHEDULE_SECONDS = 60;

export function TripPlanner() {
	useModel('cloudflare/@cf/moonshotai/kimi-k2.6');
	useSandbox(tripWorkspaceSandbox(env.LOADER));

	const data = useInitialData<TripInitialData | undefined>();
	const dest = boundSpaceFromInitialData(data);

	useTool(researchWeb);
	useTool(postToChannel(dest));
	useTool(upsertScheduledTask);
	useTool(completeScheduledPeriod);
	useTool(browsePage);

	const spaceLabel = dest
		? `iMessage ${dest.spaceType} ${dest.spaceId}`
		: 'iMessage space (bind on first inbound webhook)';

	return [
		'You are the durable planner for one boys trip.',
		`Conversation id is stable (trip:<slug>). ${spaceLabel} maps to that id.`,
		'Keep /workspace/itinerary.md as the roll-up. Persist city/leg facts in /workspace/sections/<slug>.md.',
		'When the group names a section (for example Madrid), create or update that section file before researching.',
		'Use upsert_scheduled_task for cadence work such as "this week find a hotel for Madrid": section slug, goal, weekly/daily/hourly.',
		'On schedule.research_tick, only run active tasks whose lastPeriod is not the matching hourly/daily/weekly attribute. Read itinerary + the section file, research_web, write findings, post_to_channel once, then complete_scheduled_period. If nothing is due, do not post.',
		'Research with research_web (fetch). Do not use browse_page unless it is enabled.',
		'When a reply should reach the iMessage group, call post_to_channel with a stable idempotencyKey.',
		'Scheduled open-decision nudges should be short and only cover unchecked items.',
	].join(' ');
}

TripPlanner.initialData = v.optional(tripInitialData);

function agentInstanceName(agent: object): string | undefined {
	if (!('name' in agent)) return undefined;
	return typeof agent.name === 'string' && agent.name.length > 0 ? agent.name : undefined;
}

function nudgeIntervalSeconds(agent: object): number {
	return envIntervalSeconds(
		agentEnvRecord(agent).NUDGE_EVERY_SECONDS,
		DEFAULT_NUDGE_EVERY_SECONDS,
		MIN_SCHEDULE_SECONDS,
	);
}

function taskTickIntervalSeconds(agent: object): number {
	return envIntervalSeconds(
		agentEnvRecord(agent).TASK_TICK_EVERY_SECONDS,
		DEFAULT_TASK_TICK_EVERY_SECONDS,
		MIN_SCHEDULE_SECONDS,
	);
}

const hostedBase = workspaceHost.base;
if (!hostedBase) {
	throw new Error('cloudflare-computer workspaceHost.base is required');
}

export const cloudflare = extend({
	base: (Base) => {
		const Hosted = hostedBase(Base);
		return class extends Hosted {
			async onStart() {
				await this.scheduleEvery(nudgeIntervalSeconds(this), 'nudgeOpenDecisions');
				await this.scheduleEvery(taskTickIntervalSeconds(this), 'tickResearchTasks');
			}

			async nudgeOpenDecisions() {
				const id = agentInstanceName(this);
				if (!id || !isTripConversationId(id)) return;
				const dayIso = utcDayIso();
				await dispatch(TripPlanner, {
					id,
					idempotencyKey: openDecisionsIdempotencyKey(id, dayIso),
					message: openDecisionsMessage(dayIso),
				});
			}

			async tickResearchTasks() {
				const id = agentInstanceName(this);
				if (!id || !isTripConversationId(id)) return;
				const interval = taskTickIntervalSeconds(this);
				const clock = researchTickClock(new Date(), interval);
				await dispatch(TripPlanner, {
					id,
					idempotencyKey: researchTickIdempotencyKey(id, clock.period),
					message: researchTickMessage(clock),
				});
			}
		};
	},
});
