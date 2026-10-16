import { EventEmitter } from 'node:events';

export type VoiceServerUpdatePacket = {
  token: string;
  guild_id: string;
  endpoint: string;
};

export type VoiceStateUpdatePacket = {
  guild_id: string;
  channel_id: string | null;
  user_id: string;
  session_id: string;
};

export type DiscordGatewayPacket = {
  op?: number;
  t?: string;
  d?: unknown;
};

export function isVoiceStatePacket(
  packet: DiscordGatewayPacket
): packet is DiscordGatewayPacket & { t: 'VOICE_STATE_UPDATE'; d: VoiceStateUpdatePacket } {
  if (packet.t !== 'VOICE_STATE_UPDATE' || !(packet.d instanceof Object)) {
    return false;
  }

  return 'guild_id' in packet.d && 'session_id' in packet.d && 'user_id' in packet.d;
}

export function isVoiceServerPacket(
  packet: DiscordGatewayPacket
): packet is DiscordGatewayPacket & { t: 'VOICE_SERVER_UPDATE'; d: VoiceServerUpdatePacket } {
  if (packet.t !== 'VOICE_SERVER_UPDATE' || !(packet.d instanceof Object)) {
    return false;
  }

  return 'guild_id' in packet.d && 'token' in packet.d && 'endpoint' in packet.d;
}

/**
 * Interfaz base para conectar SophiaFX con cualquier cliente de Discord (discord.js, oceanic, eris o websocket raw).
 */
export abstract class Connector extends EventEmitter {
  /**
   * Obtiene el ID del bot conectado.
   */
  abstract getBotId(): string;

  /**
   * Envía un paquete OpCode 4 a Discord Gateway para solicitar unirse o salir de voz.
   */
  abstract sendVoiceUpdate(
    guildId: string,
    channelId: string | null,
    selfMute?: boolean,
    selfDeaf?: boolean
  ): void;

  /**
   * Inicializa la escucha de eventos raw del gateway.
   */
  abstract listen(callback: (packet: DiscordGatewayPacket) => void): void;

  /**
   * Limpia los listeners asignados al cliente.
   */
  abstract destroy(): void;
}
