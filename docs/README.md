# Developer documentation

Start with [local setup](../README.local.md), then [architecture](architecture.md). These guides describe the current implementation; [future boundaries](future.md) separates planned features.

| Guide                             | Read when you need to…                                         |
| --------------------------------- | -------------------------------------------------------------- |
| [Architecture](architecture.md)   | Understand package boundaries, entry points and data ownership |
| [Development](development.md)     | Find folders and follow TypeScript/modularity conventions      |
| [Networking](networking.md)       | Change input, prediction, synchronized state or reconnection   |
| [Gameplay](gameplay.md)           | Change combat, AI, collisions, modes or loot                   |
| [Village](village.md)             | Add stations or understand social-room matchmaking             |
| [Presentation](presentation.md)   | Change generated art, skins, equipment visuals, UI or audio    |
| [Persistence](persistence.md)     | Change accounts, inventory, migrations or reward saving        |
| [Extension recipes](extending.md) | Find the files and checks needed for a new feature             |
| [Testing](testing.md)             | Choose unit, integration and browser checks                    |
| [Future boundaries](future.md)    | Understand what needs a new durable model later                |

[Verification history](verification.md) records past runs; it is not the current specification. Numeric tuning belongs in source catalogs. Update the relevant guide when changing a contract or ownership boundary; avoid copying implementation details across documents.
