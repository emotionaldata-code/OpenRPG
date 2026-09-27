# Future boundaries

[Documentation index](README.md)

Every story is an independent instance of the same authored world. Each will save its own progression and allow up to three players. An ephemeral Colyseus room is a live connection/simulation container, not a story record, character, account, or ownership grant.

Persisted accounts currently own their username, credentials, skins, collected equipment, potion storage, coins, and sequential map unlocks. Future character-specific inventories can reference the same account identity. Story ownership and guest access require durable identity and separate authorization. Joining with a room ID currently grants only temporary entry; it does not establish that future ownership model.

Future game content includes persistent levels, richer boss encounters, and deeper equipment/progression. Add durable story/character models and explicit save/load boundaries when that work begins. PostgreSQL currently persists accounts, sessions, skins, account equipment, supplies, map unlocks and reward receipts. UUID foreign keys provide the extension point; combat and room state remain in memory.

Skin publishing, marketplace discovery, import/export, moderation, chat and player trading are not implemented. Add their own persistence and authorization boundaries when needed; do not extend room IDs into ownership tokens.
