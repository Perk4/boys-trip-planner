export function seedItineraryMarkdown(tripId: string): string {
	return `# Trip itinerary

Trip id: ${tripId}
Status: planning

## Open decisions

- [ ] Dates
- [ ] Flights
- [ ] Budget per person
- [ ] Madrid hotel — see /workspace/sections/madrid.md

## Legs

- Madrid — /workspace/sections/madrid.md

City and venue facts live in section files. This page stays the roll-up: open decisions, options, and what the group already locked.

## Options

(none yet)

## Decisions

(none yet)
`;
}
