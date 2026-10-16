import { EventEmitter } from 'node:events';
import { Node } from './Node.js';
import { Player } from './Player.js';
import {
  isVoiceServerPacket,
  isVoiceStatePacket,
  type Connector,
  type DiscordGatewayPacket
} from './connectors/Connector.js';
import type {
  NodeOptions,
  Track,
  PlayOptions,
  SearchOptions,
  SearchResponse
} from './types/index.js';

export type SophiaFXOptions = {
  /**
   * Default search provider for track queries.
   * @default 'auto'
   */
  defaultSearchSource?: 'auto' | 'youtube' | 'soundcloud';

  /**
   * Automatically migrate active players to another healthy node when their current node disconnects.
   * @default true
   */
  moveOnDisconnect?: boolean;
};

export type JoinVoiceOptions = {
  guildId: string;
  channelId: string;
  nodeName?: string;
  selfMute?: boolean;
  selfDeaf?: boolean;
  timeoutMs?: number;
};

/**
 * Primary cluster orchestrator for axAudio nodes and voice players.
 */
export class SophiaFX extends EventEmitter {
  public readonly connector: Connector;
  public readonly options: SophiaFXOptions;
  public readonly nodes: Map<string, Node> = new Map();
  public readonly players: Map<string, Player> = new Map();

  constructor(connector: Connector, nodes: NodeOptions[], options: SophiaFXOptions = {}) {
    super();
    this.connector = connector;
    this.options = {
      defaultSearchSource: 'auto',
      moveOnDisconnect: true,
      ...options
    };

    // Listen to Discord Gateway packets forwarded by the connector
    this.connector.listen((packet: DiscordGatewayPacket) => {
      this.handleGatewayPacket(packet);
    });

    // Initialize all configured nodes
    for (const nodeOpt of nodes) {
      this.addNode(nodeOpt);
    }
  }

  /**
   * Registers and connects a new axAudio node to the cluster.
   */
  public addNode(options: NodeOptions): Node {
    if (this.nodes.has(options.name)) {
      throw new Error(`[SophiaFX] A node named '${options.name}' already exists in the cluster`);
    }

    const node = new Node(options);
    this.nodes.set(options.name, node);

    node.on('connect', (n) => {
      this.emit('nodeConnect', n);
      this.emit('ready', n.name);
    });

    node.on('disconnect', (n, code, reason) => {
      this.emit('nodeDisconnect', n, code, reason);

      if (this.options.moveOnDisconnect) {
        this.handleNodeFailover(n);
      }
    });

    node.on('error', (n, err) => {
      this.emit('nodeError', n, err);
    });

    node.on('trackStart', (guildId, track) => {
      const player = this.players.get(guildId);

      if (player) {
        player.emitTrackStart(track);
        this.emit('trackStart', player, track);
      }
    });

    node.on('trackEnd', (guildId, track, reason) => {
      const player = this.players.get(guildId);

      if (player) {
        player.emitTrackEnd(track, reason);
        this.emit('trackEnd', player, track, reason);
      }
    });

    node.on('trackError', (guildId, track, error) => {
      const player = this.players.get(guildId);

      if (player) {
        player.emitTrackError(track, error);
        this.emit('trackError', player, track, error);
      }
    });

    node.connect();

    return node;
  }

  /**
   * Disconnects and unregisters a node from the cluster.
   */
  public removeNode(name: string): void {
    const node = this.nodes.get(name);

    if (node) {
      node.destroy();
      this.nodes.delete(name);
    }
  }

  /**
   * Retrieves a node by name or selects the healthiest least-loaded node.
   */
  public getNode(name?: string): Node {
    if (name) {
      const target = this.nodes.get(name);

      if (!target) {
        throw new Error(`[SophiaFX] axAudio node '${name}' was not found in the cluster`);
      }

      return target;
    }

    const connectedNodes = Array.from(this.nodes.values()).filter((n) => n.connected);

    if (connectedNodes.length === 0) {
      throw new Error('[SophiaFX] No healthy axAudio nodes are currently connected');
    }

    // Least-loaded routing: prioritize nodes with fewest active players
    connectedNodes.sort((a, b) => {
      const countA = a.stats?.active_players ?? 0;
      const countB = b.stats?.active_players ?? 0;

      return countA - countB;
    });

    return connectedNodes[0];
  }

  /**
   * Creates or retrieves an existing player for the given guild ID.
   */
  public createPlayer(guildId: string, nodeName?: string): Player {
    let player = this.players.get(guildId);

    if (player) return player;

    const node = this.getNode(nodeName);
    player = new Player(this, node, guildId);
    this.players.set(guildId, player);
    this.emit('playerCreate', player);

    return player;
  }

  /**
   * Connects to a voice channel and returns a player ready to stream audio.
   */
  public async join(options: JoinVoiceOptions): Promise<Player> {
    const player = this.createPlayer(options.guildId, options.nodeName);
    await player.connect(options.channelId, {
      selfMute: options.selfMute,
      selfDeaf: options.selfDeaf,
      timeoutMs: options.timeoutMs
    });

    return player;
  }

  /**
   * Retrieves the active player for a guild, if one exists.
   */
  public getPlayer(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  /**
   * Destroys and removes a player from the local registry.
   */
  public destroyPlayer(guildId: string): void {
    const player = this.players.get(guildId);

    if (player) {
      this.players.delete(guildId);
      this.emit('playerDestroy', player);
    }
  }

  /**
   * Searches for tracks across YouTube or SoundCloud using the best available node.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const node = this.getNode();

    return node.searchTracks(query, {
      source: options.source ?? this.options.defaultSearchSource ?? 'auto',
      ...options
    });
  }

  /**
   * Resolves a single track URL directly without enqueuing it.
   */
  public async resolve(query: string, options: Partial<PlayOptions> = {}): Promise<Track> {
    const node = this.getNode();

    return node.resolveTrack(query, options);
  }

  private handleGatewayPacket(packet: DiscordGatewayPacket): void {
    if (!packet) return;

    if (isVoiceStatePacket(packet) || isVoiceServerPacket(packet)) {
      const guildId = packet.d.guild_id;
      const player = this.players.get(guildId);

      if (player) {
        player.handleRawVoicePacket(packet);
      }
    }
  }

  private handleNodeFailover(disconnectedNode: Node): void {
    const affectedPlayers = Array.from(this.players.values()).filter(
      (p) => p.node.name === disconnectedNode.name
    );

    if (affectedPlayers.length === 0) return;

    try {
      const backupNode = this.getNode();

      for (const player of affectedPlayers) {
        player.node = backupNode;

        if (player.channelId) {
          player.connect(player.channelId).catch(() => {});
        }
      }
    } catch {
      // If no fallback node is available, await reconnection of the primary node
    }
  }

  /**
   * Destroys all active players and disconnects all nodes.
   */
  public destroy(): void {
    for (const player of this.players.values()) {
      player.disconnect().catch(() => {});
    }

    this.players.clear();

    for (const node of this.nodes.values()) {
      node.destroy();
    }

    this.nodes.clear();

    this.connector.destroy();
    this.removeAllListeners();
  }
}

// Convenient alias
export const Sophia = SophiaFX;
