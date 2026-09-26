import { Room, ServerError, type Client, type StepContext } from 'colyseus';
import { WorldState, MoveInput, RULES, parseName, parseRoomOptions, sanitizeInput } from '@openrpg/shared';
import { Simulation } from '../simulation/world.js';
export class Expedition extends Room<{ state: WorldState; input: MoveInput; metadata: { title: string } }> {
  maxClients = RULES.maxPlayers;
  maxMessagesPerSecond = RULES.maxMessagesPerSecond;
  patchRate = RULES.patchMs;
  autoDispose = true;
  state = new WorldState();
  readonly simulation = new Simulation(this.state);
  inputs = this.defineInput(MoveInput, { bufferMaxSize: RULES.inputBuffer, sanitize: sanitizeInput });
  async onCreate(raw: unknown): Promise<void> {
    try {
      const options = parseRoomOptions(raw);
      this.state.visibility = options.visibility;
      await this.setPrivate(options.visibility === 'invite');
      await this.setMetadata({ title: `${options.name}'s expedition` });
    } catch (error) { throw new ServerError(400, error instanceof Error ? error.message : 'Invalid options.'); }
    this.setFixedTimestep((ctx) => this.step(ctx), RULES.tickRate);
  }
  onJoin(client: Client, raw: unknown): void {
    try {
      const name = parseName(typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).name : undefined);
      this.simulation.addPlayer(client.sessionId, name);
    } catch (error) { throw new ServerError(400, error instanceof Error ? error.message : 'Invalid name.'); }
  }
  onDrop(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    this.allowReconnection(client, RULES.reconnectSeconds).catch(() => { /* onLeave owns cleanup */ });
  }
  onReconnect(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
  }
  onLeave(client: Client): void { this.simulation.removePlayer(client.sessionId); }
  private step(ctx: StepContext): void {
    for (const [id, player] of this.state.players) {
      if (!player.connected) continue;
      const input = this.inputs.get(id).next();
      if (input) this.simulation.applyInput(id, input, ctx.dt);
    }
    this.simulation.advance(ctx.dt);
  }
}
