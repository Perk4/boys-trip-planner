export function seedItineraryMarkdown(tripId: string): string {
	return `# Trip itinerary

Trip id: ${tripId}
Status: planning

## Open decisions

- [ ] Dates
- [ ] Flights
- [ ] Hotel neighborhood
- [ ] Budget per person

## Options

(none yet)

## Decisions

(none yet)
`;
}
