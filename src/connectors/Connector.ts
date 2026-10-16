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
 * Base abstract connector to link SophiaFX with Discord clients (discord.js, oceanic, eris, or raw gateway connections).
 */
export abstract class Connector extends EventEmitter {
  /**
   * Returns the connected bot client ID.
   */
  abstract getBotId(): string;

  /**
   * Dispatches an OpCode 4 voice state update packet to the Discord Gateway.
   */
  abstract sendVoiceUpdate(
    guildId: string,
    channelId: string | null,
    selfMute?: boolean,
    selfDeaf?: boolean
  ): void;

  /**
   * Subscribes to raw gateway packets forwarded by the Discord client.
   */
  abstract listen(callback: (packet: DiscordGatewayPacket) => void): void;

  /**
   * Cleans up event listeners registered on the Discord client.
   */
  abstract destroy(): void;
}
