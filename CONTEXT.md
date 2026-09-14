# Boys trip planner

One durable planner identity per boys trip, spoken to from a group chat, with itinerary and decisions that outlive any UI session.

## Language

**Trip**:
The planning effort that has one durable identity.
_Avoid_: Conversation, session, chat, thread (when you mean the effort, not the messenger thread)

**Trip id**:
The stable name of a Trip, always `trip:<slug>`.
_Avoid_: Conversation id (except when quoting Flue), Durable Object name, chat GUID

**Space**:
The iMessage thread (group or DM) bound to a Trip.
_Avoid_: Channel, conversation, chat, group (when you mean Photon’s thread)

**Test Space**:
A Space used only to prove one Outbound send, not the production boys group.
_Avoid_: Live group, production space

**Section**:
A city or leg of a Trip whose facts are kept together.
_Avoid_: Destination (that word is the Wayfinder end-state), stop, city file

**Open decision**:
A planning choice the group has not locked yet.
_Avoid_: TODO, issue, ticket (those are engineering tracker items)

**Nudge**:
A scheduled prompt that asks the group to move Open decisions.
_Avoid_: Reminder, ping, cron (when you mean the product act)

**Research job**:
A named, repeating fetch of facts for a Section.
_Avoid_: Research tick (that is the clock), search, browse

**Outbound send**:
A message the planner posts back to the Space that must not fire twice.
_Avoid_: Reply (inbound turns also reply), post (too generic)
