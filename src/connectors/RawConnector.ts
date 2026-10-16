import { Connector, type DiscordGatewayPacket } from './Connector.js';

export interface RawConnectorOptions {
  botId: string;
  sendVoiceUpdate: (guildId: string, channelId: string | null, selfMute?: boolean, selfDeaf?: boolean) => void;
}

/**
 * Conector agnóstico para bots con arquitecturas desacopladas o microservicios.
 */
export class RawConnector extends Connector {
  private botId: string;
  private sendVoiceFn: (guildId: string, channelId: string | null, selfMute?: boolean, selfDeaf?: boolean) => void;
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
   * Alimenta un paquete crudo del Gateway (ej: proveniente de Kafka, RabbitMQ o WS directo).
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
