# Verification record

Verified on 2026-09-26 using Node 24.18.0, npm 11.16.0, and Playwright 1.63.0 / Chromium 153 on Linux. Versions in the root lockfile include Phaser 4.2.1, Colyseus 0.18.8, SDK 0.18.4, and schema 5.0.34.

## Completed checks

| Command | Result |
| --- | --- |
| `npm ci` | Clean install from the workspace lockfile succeeded |
| `npm run typecheck` | All three packages and test sources passed strict TypeScript checks |
| `npm run build` | Shared JavaScript/declarations, Node server, and browser production bundle built |
| `npm test` | 19 passed: 10 deterministic unit tests and 9 real-server integration tests |
| `npm run test:browser` | 4 Chromium acceptance scenarios passed in one final run |
| `git diff --check` | Passed |

Unit tests cover normalized movement, all boundaries, wall sliding and corners, authored spawn clearance, swept projectile hits, malformed inputs/options, fire cooldowns, friendly-fire exclusion, terrain occlusion, mage line of sight, and player/mob respawn timing.

Real-server tests cover public discovery and invite privacy using the built-in lobby, joining private rooms by ID, room isolation, three-player capacity, leave/disposal, invalid names/options, bounded input queues, flooding disconnects, synchronized authoritative combat, automatic reconnection and input epoch reset, expiration of the 15-second reservation, and SDK reconciliation with pending input replay against a wall and an authoritative respawn.

Browser tests open three independent sessions and use keyboard and mouse input. They cover public-list and invite-link joins, shared movement/combat, camera-relative aiming after scrolling, remote interpolation samples, blur clearing held movement/fire, copying invites, room errors/capacity, successful recovery, offline timeout cleanup, creating a new room after timeout, and a natural mage kill of a player followed by a protected respawn with a snapped local render position. Screenshots were inspected for layout and rendering; no JavaScript page errors occurred in either combat scenario.

![Three players after shared combat](screenshots/three-player-combat.png)

## Latency and jitter

The browser harness wraps native WebSockets and delays both outgoing and incoming messages by 75 ± 20 ms, preserving message order and copying mutable outbound buffers. This adds approximately 150 ms round-trip transport delay with deterministic jitter. It does not delay HTTP matchmaking or Vite's development connection.

The delayed scenario verifies that the local predicted position advances before authoritative state, that the correction converges to within one world unit after movement stops, that remote render samples remain monotonic and bounded by speed/frame duration, and that the same combat kill reaches all three players. Both normal and delayed runs sampled more than 30 remote frames during movement.

Final-run SDK telemetry after movement:

| Scenario | SDK send-to-ack estimate | SDK drift EMA | Local/server position difference after stopping |
| --- | --- | --- | --- |
| Normal local connection | 133 ms | 0 | < 1 world unit |
| Added 150 ms transport RTT + jitter | 374 ms | 0 | < 1 world unit |

The SDK's estimate measures input send-to-authoritative-ack time, including simulation queueing, patch cadence, and browser scheduling; it is not a raw network ping. After combat, drift EMA remained below 0.01 in both runs. SDK scalar drift can include authoritative health/timer changes, so transient combat corrections should not be interpreted as movement nondeterminism.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run build
npm test
npm run test:browser
```

The browser suite starts `npm run dev` when needed. Ports 5173 and 2567 must be free (or already running this checkout); integration tests use port 2568. Avoid editing shared code or running another build during a live browser test: the compiler/server watchers and Vite reload the session. Test reports, screenshots, and failure traces are written to ignored `test-results/`. Use `npx playwright show-trace <trace.zip>` for a failure trace. Add `?debug=1` in development to inspect the Colyseus panel.

For a manual play session, run `npm run dev`, create an expedition, and open its copied invite link in two more browser windows. Explore the paths, hold fire at a mage, move along the stone walls, blur the window while holding a key, and use the development panel's Drop control to test recovery.

## Known limitations

- Verification is automated Chromium interaction plus screenshot inspection, not a three-person usability session. Firefox, Safari, mobile, and real wide-area packet loss have not been tested.
- The production Phaser chunk is about 1.37 MB before gzip (358 KB gzipped); Vite reports its standard large-chunk warning.
- `npm ci` reports 16 upstream dependency advisories (13 low, 3 moderate). The moderate chain includes the Colyseus umbrella package's optional OAuth dependencies (`grant`, `request-oauth`, `uuid`). No authentication/OAuth routes are implemented here. npm's suggested forced downgrade conflicts with the requested Colyseus 0.18 API and was not applied.
- No historical hit rewinding or projectile prediction. Remote projectiles are deliberately authoritative and delayed by interpolation.
- Rooms and characters are ephemeral. The long-term RPG features in the architecture notes are not implemented.
