'use agent';
import { env } from 'cloudflare:workers';
import { dispatch, useInitialData, useModel, useSandbox, useTool } from '@flue/runtime';
import { extend } from '@flue/runtime/cloudflare';
import * as v from 'valibot';
import {
	openDecisionsIdempotencyKey,
	openDecisionsMessage,
	utcDayIso,
} from '../lib/nudge-signal.ts';
import { isTripConversationId } from '../lib/trip-id.ts';
import { tripWorkspaceSandbox } from '../lib/trip-workspace.ts';
import { workspaceHost } from '../sandboxes/cloudflare-computer.ts';
import { browsePage } from '../tools/browse-page.ts';
import { postToChannel } from '../tools/post-to-channel.ts';
import { researchWeb } from '../tools/research-web.ts';

const tripInitialData = v.object({
	channel: v.optional(v.literal('telegram')),
	type: v.optional(v.literal('chat')),
	chatId: v.optional(v.number()),
	messageThreadId: v.optional(v.number()),
	chatTitle: v.optional(v.string()),
});

export type TripInitialData = v.InferOutput<typeof tripInitialData>;

const DEFAULT_NUDGE_EVERY_SECONDS = 86_400;
const MIN_NUDGE_EVERY_SECONDS = 60;

export function TripPlanner() {
	useModel('cloudflare/@cf/moonshotai/kimi-k2.6');
	useSandbox(tripWorkspaceSandbox(env.LOADER));

	const data = useInitialData<TripInitialData | undefined>();
	const dest =
		data?.chatId === undefined ? undefined : { chatId: data.chatId, messageThreadId: data.messageThreadId };

	useTool(researchWeb);
	useTool(postToChannel(dest));
	useTool(browsePage);

	const chatTitle = data?.chatTitle ? ` ("${data.chatTitle}")` : '';
	return [
		'You are the durable planner for one boys trip.',
		`Conversation id is stable (trip:<slug>). This group${chatTitle} maps to that id.`,
		'Keep /workspace/itinerary.md current: open decisions, options, and decided items.',
		'Research with research_web (fetch). Do not use browse_page unless it is enabled.',
		'When a reply should reach the group, call post_to_channel with a stable idempotencyKey.',
		'Scheduled open-decision nudges should be short and only cover unchecked items.',
	].join(' ');
}

TripPlanner.initialData = v.optional(tripInitialData);

function agentInstanceName(agent: object): string | undefined {
	if (!('name' in agent)) return undefined;
	return typeof agent.name === 'string' && agent.name.length > 0 ? agent.name : undefined;
}

function nudgeIntervalSeconds(agent: object): number {
	const envRecord =
		'env' in agent && typeof agent.env === 'object' && agent.env !== null
			? (agent.env as Record<string, unknown>)
			: {};
	const raw = envRecord.NUDGE_EVERY_SECONDS;
	const parsed = typeof raw === 'string' ? Number(raw) : DEFAULT_NUDGE_EVERY_SECONDS;
	if (!Number.isFinite(parsed) || parsed < MIN_NUDGE_EVERY_SECONDS) {
		return DEFAULT_NUDGE_EVERY_SECONDS;
	}
	return parsed;
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
		};
	},
});
