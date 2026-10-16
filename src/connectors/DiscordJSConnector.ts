import { Connector, type DiscordGatewayPacket } from './Connector.js';

type DiscordShard = {
  send: (payload: { op: number; d: unknown }) => void;
};

export type DiscordClientLike = {
  user?: { id?: string } | null;
  guilds?: {
    cache: {
      get: (id: string) => { shard?: DiscordShard } | undefined;
    };
  };
  ws?: {
    shards?: {
      size?: number;
      get: (id: number) => DiscordShard | undefined;
      first: () => DiscordShard | undefined;
    };
  };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

/**
 * Conector oficial para Discord.js v14+
 */
export class DiscordJSConnector extends Connector {
  private client: DiscordClientLike;
  private rawListener: ((...args: unknown[]) => void) | null = null;

  constructor(client: DiscordClientLike) {
    super();
    this.client = client;
  }

  public override getBotId(): string {
    const id = this.client.user?.id;

    if (!id) {
      throw new Error(
        '[SophiaFX/DiscordJSConnector] client.user.id no está disponible. Asegúrate de inicializar tras client.login().'
      );
    }

    return id;
  }

  public override sendVoiceUpdate(
    guildId: string,
    channelId: string | null,
    selfMute = false,
    selfDeaf = false
  ): void {
    const payload = {
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: channelId,
        self_mute: selfMute,
        self_deaf: selfDeaf
      }
    };

    const guild = this.client.guilds?.cache.get(guildId);

    if (guild?.shard) {
      guild.shard.send(payload);

      return;
    }

    // Fallback buscando en la colección de shards del WS
    const shardSize = BigInt(this.client.ws?.shards?.size || 1);
    const shardId = Number((BigInt(guildId) >> 22n) % shardSize);

    const shard =
      this.client.ws?.shards?.get(shardId) ?? this.client.ws?.shards?.first();

    if (shard) {
      shard.send(payload);
    } else {
      throw new Error(
        `[SophiaFX/DiscordJSConnector] No se encontró un Shard activo para enviar voice update al guild ${guildId}`
      );
    }
  }

  public override listen(callback: (packet: DiscordGatewayPacket) => void): void {
    this.rawListener = (...args: unknown[]) => {
      // SAFETY: Discord.js emits the raw gateway packet as the first argument in the 'raw' event
      const packet = args[0] as DiscordGatewayPacket;
      callback(packet);
    };

    this.client.on('raw', this.rawListener);
  }

  public override destroy(): void {
    if (this.rawListener) {
      this.client.removeListener('raw', this.rawListener);
      this.rawListener = null;
    }
  }
}
