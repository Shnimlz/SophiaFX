<div align="center">

# ⚡ SophiaFX

**Ultra-lightweight, high-performance TypeScript client and orchestrator for [axAudio](https://github.com/Shnimlz/axAudio) Discord audio engines.**

[![npm version](https://img.shields.io/npm/v/sophiafx.svg?style=flat&color=3178c6)](https://www.npmjs.com/package/sophiafx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js&logoColor=white)](https://nodejs.org/)

A modern, type-safe alternative to Shoukaku designed specifically for axAudio's sub-millisecond native Rust audio pipeline, 15-band studio DSP equalizer, and real-time WebSocket telemetry.

</div>

---

## ✨ Features

- 🦀 **Purpose-Built for axAudio**: Direct native bindings to axAudio's REST control plane and 50 Hz RTP Songbird driver.
- 🎛️ **Studio DSP & 15-Band Equalizer**: Built-in methods for real-time 15-band equalization, Mid/Side phase-coherent 3D spatial widening, acoustic crossfeed, and sub-bass exciter manipulation.
- 🌐 **Multi-Node Clustering & Auto-Failover**: Support for multiple distributed axAudio nodes with least-loaded automatic routing and seamless player migration upon node drop.
- 🔌 **Pluggable Framework Connectors**:
  - `DiscordJSConnector` (Discord.js v14+)
  - `RawConnector` (Agnostic / Microservices / RabbitMQ / Kafka)
- 📡 **Real-Time Telemetry Stream**: WebSocket subscriber for `/v1/events` (`trackStart`, `trackEnd`, `trackError`) with automated keep-alive, ping/pong, and reconnection backoff.
- 🚀 **Fast-Start Playlist Support**: Handles asynchronous background playlist queues while track 1 begins streaming immediately.
- 📦 **Zero Native Dependencies**: Pure TypeScript and standard Node.js libraries—no heavy compilation steps or platform-specific binaries.

---

## 📦 Installation

```bash
npm install sophiafx
```

*(Optional peer dependency for Discord.js bots)*:
```bash
npm install discord.js
```

---

## 🚀 Quick Start (Discord.js v14)

```typescript
import { Client, GatewayIntentBits } from 'discord.js';
import { SophiaFX, DiscordJSConnector } from 'sophiafx';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// Inicializar el orquestador SophiaFX
const sophia = new SophiaFX(
  new DiscordJSConnector(client),
  [
    {
      name: 'main-vps',
      url: 'http://127.0.0.1:2333',
      autoReconnect: true
    }
  ],
  { defaultSearchSource: 'youtube' }
);

// Eventos del cluster de nodos
sophia.on('ready', (nodeName) => {
  console.log(`🔌 Nodo axAudio '${nodeName}' conectado y listo.`);
});

sophia.on('trackStart', (player, track) => {
  console.log(`🎶 [Guild ${player.guildId}] Reproduciendo: ${track.title}`);
});

sophia.on('trackEnd', (player, track, reason) => {
  console.log(`⏹️ [Guild ${player.guildId}] Pista finalizada: ${track?.title} (${reason})`);
});

sophia.on('trackError', (player, track, error) => {
  console.error(`❌ [Guild ${player.guildId}] Error en pista ${track?.title}: ${error}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member } = interaction;
  const voiceChannel = (member as any)?.voice?.channel;

  if (commandName === 'play') {
    if (!voiceChannel) {
      await interaction.reply({ content: 'Debes estar en un canal de voz.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const query = interaction.options.getString('query', true);

    // Conectar a voz y obtener el reproductor
    const player = await sophia.join({
      guildId: guildId!,
      channelId: voiceChannel.id
    });

    // Encolar pista o playlist en axAudio
    const result = await player.play(query);

    await interaction.editReply({
      content: result.is_playlist
        ? `📜 **Playlist encolada**: ${result.playlist_title || result.title} (${result.playlist_tracks_count} canciones)`
        : `▶️ **Reproduciendo**: [${result.title}](${result.source_url})`
    });
  }

  if (commandName === 'pause') {
    const player = sophia.getPlayer(guildId!);
    await player?.pause();
    await interaction.reply('⏸️ Reproducción pausada.');
  }

  if (commandName === 'resume') {
    const player = sophia.getPlayer(guildId!);
    await player?.resume();
    await interaction.reply('▶️ Reproducción reanudada.');
  }

  if (commandName === 'skip') {
    const player = sophia.getPlayer(guildId!);
    await player?.skip();
    await interaction.reply('⏭️ Pista saltada.');
  }

  if (commandName === 'leave') {
    const player = sophia.getPlayer(guildId!);
    await player?.disconnect();
    await interaction.reply('🚪 Desconectado del canal de voz.');
  }
});

client.login('TU_DISCORD_BOT_TOKEN');
```

---

## 🎛️ DSP & Ecualización de Estudio

axAudio incorpora procesamiento de señales digitales (DSP) en tiempo real a 48 kHz. SophiaFX permite controlar todos los aspectos del motor desde el código:

### 1. Aplicar Presets Acústicos

```typescript
// Presets calibrados: 'music', 'cinema-3d', 'bass-boost-3d', 'vocal-clarity', 'gaming-3d', 'concert-hall', 'flat'
await player.setPreset('cinema-3d');
```

### 2. Modificar Bandas del Ecualizador Gráfico de 15 Bandas

Frecuencias ISO estándar: `25Hz, 40Hz, 63Hz, 100Hz, 160Hz, 250Hz, 400Hz, 630Hz, 1kHz, 1.6kHz, 2.5kHz, 4kHz, 6.3kHz, 10kHz, 16kHz`.

```typescript
await player.setEqualizer([
  { band: 0, gain: 4.5 }, // 25 Hz sub-bass (+4.5 dB)
  { band: 1, gain: 3.0 }, // 40 Hz punch (+3.0 dB)
  { band: 8, gain: 1.5 }  // 1 kHz vocal presence (+1.5 dB)
]);
```

### 3. Modelado Acústico Espacial 3D

```typescript
await player.setSpatial({
  stereo_width: 1.35,        // Expansión Mid/Side estéreo (1.0 = normal, 1.35 = 3D inmersivo)
  binaural_crossfeed: true,  // Sombra craneal a 700 Hz (reduce fatiga en audífonos)
  crossfeed_level: 0.18,     // Nivel de mezcla de fuga acústica
  bass_exciter: true,        // Excitador armónico a 85 Hz (graves profundos)
  bass_exciter_drive: 0.35   // Intensidad de armónicos generados
});
```

### 4. Restaurar a Neutro (Flat)

```typescript
await player.resetDsp();
```

---

## 🔍 Búsqueda y Resolución de Pistas

Puedes resolver enlaces o buscar contenido sin encolarlo de inmediato:

```typescript
// Búsqueda en YouTube o SoundCloud
const results = await sophia.search('Daft Punk Get Lucky', {
  source: 'youtube',
  limit: 5
});

for (const track of results.tracks) {
  console.log(`${track.title} - ${track.url} (${track.duration_secs}s)`);
}

// Resolución directa de metadatos y CDN stream
const resolved = await sophia.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
console.log(`Stream CDN directo: ${resolved.stream_url}`);
```

---

## 🏗️ Conector Raw (Microservicios / Sharding Independiente)

Si tu bot corre en contenedores separados donde los eventos del Gateway de Discord viajan a través de Kafka o RabbitMQ:

```typescript
import { SophiaFX, RawConnector } from 'sophiafx';

const connector = new RawConnector({
  botId: '123456789012345678',
  sendVoiceUpdate: (guildId, channelId, selfMute, selfDeaf) => {
    // Enviar el paquete OpCode 4 a tu broker o shard manager
    rabbitChannel.sendToQueue('gateway_outbound', Buffer.from(JSON.stringify({
      op: 4,
      d: { guild_id: guildId, channel_id: channelId, self_mute: selfMute, self_deaf: selfDeaf }
    })));
  }
});

const sophia = new SophiaFX(connector, [{ name: 'axaudio', url: 'http://axaudio:2333' }]);

// Alimentar paquetes cuando lleguen del broker
brokerConsumer.on('message', (msg) => {
  const packet = JSON.parse(msg.content.toString());
  connector.forwardRawPacket(packet);
});
```

---

## 📄 Licencia

Licenciado bajo la [Licencia MIT](LICENSE). Creado por **Shnimlz**.
