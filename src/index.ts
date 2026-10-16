export {
  SophiaFX,
  Sophia,
  type SophiaFXOptions,
  type JoinVoiceOptions
} from './SophiaFX.js';

export { Node, type NodeEvents } from './Node.js';

export { Player, type ConnectOptions } from './Player.js';

// Connectors
export {
  Connector,
  isVoiceStatePacket,
  isVoiceServerPacket,
  type DiscordGatewayPacket,
  type VoiceStateUpdatePacket,
  type VoiceServerUpdatePacket
} from './connectors/Connector.js';

export {
  DiscordJSConnector,
  type DiscordClientLike
} from './connectors/DiscordJSConnector.js';

export { RawConnector, type RawConnectorOptions } from './connectors/RawConnector.js';

// Types
export * from './types/index.js';
