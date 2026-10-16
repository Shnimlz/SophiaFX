export {
  SophiaFX,
  Sophia,
  type SophiaFXOptions,
  type JoinVoiceOptions
} from './SophiaFX.js';

export { Node, type NodeEvents } from './Node.js';
export { Player, type ConnectOptions } from './Player.js';

// Conectores
export { Connector, type DiscordGatewayPacket } from './connectors/Connector.js';
export { DiscordJSConnector } from './connectors/DiscordJSConnector.js';
export { RawConnector, type RawConnectorOptions } from './connectors/RawConnector.js';

// Tipos
export * from './types/index.js';
