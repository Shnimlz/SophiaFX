import { Connector, type DiscordGatewayPacket } from './Connector.js';

/**
 * Conector oficial para Discord.js v14+
 */
export class DiscordJSConnector extends Connector {
  private client: any;
  private rawListener: ((packet: any) => void) | null = null;

  constructor(client: any) {
    super();
    this.client = client;
  }

  public override getBotId(): string {
    const id = this.client.user?.id;
    if (!id) {
      throw new Error('[SophiaFX/DiscordJSConnector] client.user.id no está disponible. Asegúrate de inicializar tras client.login().');
    }
    return id;
  }

  public override sendVoiceUpdate(
    guildId: string,
    channelId: string | null,
    selfMute = false,
    selfDeaf = false
  ): void {
    const guild = this.client.guilds.cache.get(guildId);
    if (guild && guild.shard) {
      guild.shard.send({
        op: 4,
        d: {
          guild_id: guildId,
          channel_id: channelId,
          self_mute: selfMute,
          self_deaf: selfDeaf
        }
      });
      return;
    }

    // Fallback buscando en la colección de shards del WS
    const shardId = (BigInt(guildId) >> 22n) % BigInt(this.client.ws.shards.size || 1);
    const shard = this.client.ws.shards.get(Number(shardId)) || this.client.ws.shards.first();
    if (shard) {
      shard.send({
        op: 4,
        d: {
          guild_id: guildId,
          channel_id: channelId,
          self_mute: selfMute,
          self_deaf: selfDeaf
        }
      });
    } else {
      throw new Error(`[SophiaFX/DiscordJSConnector] No se encontró un Shard activo para enviar voice update al guild ${guildId}`);
    }
  }

  public override listen(callback: (packet: DiscordGatewayPacket) => void): void {
    this.rawListener = (packet: any) => {
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
