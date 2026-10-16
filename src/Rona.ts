import { EventEmitter } from 'node:events';
import { Node } from './Node.js';
import { Player } from './Player.js';
import type { Connector, DiscordGatewayPacket } from './connectors/Connector.js';
import type {
  NodeOptions,
  Track,
  PlayOptions,
  SearchOptions,
  SearchResponse
} from './types/index.js';

export interface RonaOptions {
  /**
   * Proveedor de búsqueda por defecto.
   * @default 'auto'
   */
  defaultSearchSource?: 'auto' | 'youtube' | 'soundcloud';

  /**
   * Mueve automáticamente los reproductores a otro nodo saludable si el nodo actual se desconecta.
   * @default true
   */
  moveOnDisconnect?: boolean;
}

export interface JoinVoiceOptions {
  guildId: string;
  channelId: string;
  nodeName?: string;
  selfMute?: boolean;
  selfDeaf?: boolean;
  timeoutMs?: number;
}

/**
 * Orquestador principal de nodos axAudio y reproductores de voz.
 */
export class Rona extends EventEmitter {
  public readonly connector: Connector;
  public readonly options: RonaOptions;
  public readonly nodes: Map<string, Node> = new Map();
  public readonly players: Map<string, Player> = new Map();

  constructor(connector: Connector, nodes: NodeOptions[], options: RonaOptions = {}) {
    super();
    this.connector = connector;
    this.options = {
      defaultSearchSource: 'auto',
      moveOnDisconnect: true,
      ...options
    };

    // Registrar escucha de eventos del Gateway
    this.connector.listen((packet: DiscordGatewayPacket) => {
      this.handleGatewayPacket(packet);
    });

    // Inicializar nodos configurados
    for (const nodeOpt of nodes) {
      this.addNode(nodeOpt);
    }
  }

  /**
   * Registra y conecta un nuevo nodo axAudio al cluster.
   */
  public addNode(options: NodeOptions): Node {
    if (this.nodes.has(options.name)) {
      throw new Error(`[Rona] Ya existe un nodo con el nombre '${options.name}'`);
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
   * Desconecta y elimina un nodo del cluster.
   */
  public removeNode(name: string): void {
    const node = this.nodes.get(name);
    if (node) {
      node.destroy();
      this.nodes.delete(name);
    }
  }

  /**
   * Obtiene un nodo por nombre o selecciona el nodo saludable con menor carga de reproductores.
   */
  public getNode(name?: string): Node {
    if (name) {
      const target = this.nodes.get(name);
      if (!target) {
        throw new Error(`[Rona] Nodo axAudio '${name}' no encontrado en el cluster`);
      }
      return target;
    }

    const connectedNodes = Array.from(this.nodes.values()).filter((n) => n.connected);
    if (connectedNodes.length === 0) {
      throw new Error('[Rona] No hay nodos axAudio conectados y saludables en este momento');
    }

    // Algoritmo de menor carga: menor cantidad de active_players o players locales
    connectedNodes.sort((a, b) => {
      const countA = a.stats?.active_players ?? 0;
      const countB = b.stats?.active_players ?? 0;
      return countA - countB;
    });

    return connectedNodes[0];
  }

  /**
   * Crea o recupera un reproductor existente para el guild indicado.
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
   * Conecta a un canal de voz y retorna el reproductor listo para usar.
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
   * Obtiene el reproductor activo de un guild si existe.
   */
  public getPlayer(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  /**
   * Elimina un reproductor del registro local.
   */
  public destroyPlayer(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      this.players.delete(guildId);
      this.emit('playerDestroy', player);
    }
  }

  /**
   * Busca pistas en YouTube o SoundCloud a través del mejor nodo disponible.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const node = this.getNode();
    return node.searchTracks(query, {
      source: options.source ?? this.options.defaultSearchSource ?? 'auto',
      ...options
    });
  }

  /**
   * Resuelve una URL individual sin encolarla.
   */
  public async resolve(query: string, options: Partial<PlayOptions> = {}): Promise<Track> {
    const node = this.getNode();
    return node.resolveTrack(query, options);
  }

  private handleGatewayPacket(packet: DiscordGatewayPacket): void {
    if (!packet || !packet.d) return;

    if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
      const guildId = packet.d.guild_id;
      if (guildId) {
        const player = this.players.get(guildId);
        if (player) {
          player.handleRawVoicePacket(packet);
        }
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
      // Si no hay nodos de respaldo disponibles, esperar reconexión del propio nodo
    }
  }

  /**
   * Destruye todos los reproductores y desconecta todos los nodos.
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
