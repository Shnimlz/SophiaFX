import { Connector, type DiscordGatewayPacket } from './Connector.js';

export type RawConnectorOptions = {
  botId: string;
  sendVoiceUpdate: (
    guildId: string,
    channelId: string | null,
    selfMute?: boolean,
    selfDeaf?: boolean
  ) => void;
};

/**
 * Framework-agnostic connector for microservices, message brokers, or standalone gateway clients.
 */
export class RawConnector extends Connector {
  private botId: string;
  private sendVoiceFn: (
    guildId: string,
    channelId: string | null,
    selfMute?: boolean,
    selfDeaf?: boolean
  ) => void;
  private listener: ((packet: DiscordGatewayPacket) => void) | null = null;

  constructor(options: RawConnectorOptions) {
    super();
    this.botId = options.botId;
    this.sendVoiceFn = options.sendVoiceUpdate;
  }

  public override getBotId(): string {
    return this.botId;
  }

  public override sendVoiceUpdate(
    guildId: string,
    channelId: string | null,
    selfMute = false,
    selfDeaf = false
  ): void {
    this.sendVoiceFn(guildId, channelId, selfMute, selfDeaf);
  }

  public override listen(callback: (packet: DiscordGatewayPacket) => void): void {
    this.listener = callback;
  }

  /**
   * Forwards an incoming raw Discord Gateway packet (e.g. from Kafka, RabbitMQ, or custom WebSocket).
   */
  public forwardRawPacket(packet: DiscordGatewayPacket): void {
    if (this.listener) {
      this.listener(packet);
    }
  }

  public override destroy(): void {
    this.listener = null;
  }
}
