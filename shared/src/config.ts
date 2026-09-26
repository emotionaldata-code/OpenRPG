export const RULES = {
  tickRate: 30, patchMs: 50, interpolationMs: 100, maxPlayers: 3,
  inputBuffer: 8, maxMessagesPerSecond: 120, reconnectSeconds: 15,
  playerSpeed: 180, playerRadius: 10, playerHealth: 100,
  playerRespawnMs: 3000, protectionMs: 1800, bowCooldownMs: 330,
  arrowSpeed: 480, arrowDamage: 25, projectileRadius: 3, projectileLifeMs: 1600,
  mobSpeed: 48, mobRadius: 11, mobHealth: 75, mobRespawnMs: 8000,
  mobRange: 300, mobStopRange: 170, mobCooldownMs: 1250,
  boltSpeed: 205, boltDamage: 20,
} as const;
