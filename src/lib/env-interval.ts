export function envIntervalSeconds(
	raw: unknown,
	fallback: number,
	min: number,
): number {
	const parsed = typeof raw === 'string' ? Number(raw) : fallback;
	if (!Number.isFinite(parsed) || parsed < min) return fallback;
	return parsed;
}

export function agentEnvRecord(agent: object): Record<string, unknown> {
	if (!('env' in agent) || typeof agent.env !== 'object' || agent.env === null) {
		return {};
	}
	return agent.env as Record<string, unknown>;
}
