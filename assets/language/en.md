<div align="center">

<img alt="SophiaFX" src="../img/logo.svg">

**Ultra-lightweight, high-performance TypeScript client and orchestrator for [axAudio](https://github.com/Shnimlz/axAudio) Discord audio engines.**

[![npm version](https://img.shields.io/npm/v/sophiafx.svg?style=flat&color=3178c6)](https://www.npmjs.com/package/sophiafx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js&logoColor=white)](https://nodejs.org/)

A modern, type-safe alternative to Shoukaku, designed for axAudio's native Rust audio pipeline: sub-millisecond latency, 15-band DSP equalizer, and real-time WebSocket telemetry.

[Español](../../README.md) · [Installation](#installation) · [Quick Start](#quick-start) · [DSP & Equalization](#dsp--equalization) · [Search](#search-and-track-resolution) · [Events](#events) · [Raw Connector](#raw-connector)

</div>

## Features

- **Purpose-Built for axAudio**: Direct native bindings to axAudio's REST control plane and 50 Hz RTP Songbird driver.
- **Studio DSP & 15-Band Equalizer**: Real-time equalization, phase-coherent Mid/Side 3D spatial widening, acoustic crossfeed, and sub-bass harmonic exciter.
- **Multi-Node Clustering & Auto-Failover**: Support for multiple distributed axAudio nodes, least-loaded automatic routing, and seamless player migration upon node drop.
- **Pluggable Connectors**: `DiscordJSConnector` (Discord.js v14+) and `RawConnector` (agnostic, ideal for microservices, RabbitMQ, or Kafka).
- **Real-Time Telemetry**: WebSocket subscriber for `/v1/events` with automated keep-alive, ping/pong, and reconnection backoff.
- **Fast-Start Playlists**: Enqueues in the background while the first track starts playing immediately.
- **Zero Native Dependencies**: Pure TypeScript and standard Node.js libraries—no heavy compilation steps or platform-specific binaries.

## Requirements

- Node.js 18 or higher
- An [axAudio](https://github.com/Shnimlz/axAudio) node accessible via HTTP
- `discord.js` v14+ only if using `DiscordJSConnector`

## Installation

```bash
npm install sophiafx
```

Optional peer dependency for Discord.js bots:

```bash
npm install discord.js
```

## Quick Start

Complete example with Discord.js v14:

```typescript
import { Client, GatewayIntentBits } from "discord.js";
import { SophiaFX, DiscordJSConnector } from "sophiafx";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// Initialize orchestrator
const sophia = new SophiaFX(
  new DiscordJSConnector(client),
  [
    {
      name: "main-vps",
      url: "http://127.0.0.1:2333",
      autoReconnect: true,
    },
  ],
  { defaultSearchSource: "youtube" },
);

// Cluster node lifecycle events
sophia.on("ready", (nodeName) => {
  console.log(`axAudio node '${nodeName}' connected and ready.`);
});

sophia.on("trackStart", (player, track) => {
  console.log(`[Guild ${player.guildId}] Now playing: ${track.title}`);
});

sophia.on("trackEnd", (player, track, reason) => {
  console.log(
    `[Guild ${player.guildId}] Track finished: ${track?.title} (${reason})`,
  );
});

sophia.on("trackError", (player, track, error) => {
  console.error(
    `[Guild ${player.guildId}] Error on ${track?.title}: ${error}`,
  );
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member } = interaction;
  const voiceChannel = (member as any)?.voice?.channel;

  if (commandName === "play") {
    if (!voiceChannel) {
      await interaction.reply({
        content: "You must be in a voice channel!",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    // Join voice channel and retrieve player
    const player = await sophia.join({
      guildId: guildId!,
      channelId: voiceChannel.id,
    });

    // Enqueue track or playlist in axAudio
    const result = await player.play(query);

    await interaction.editReply({
      content: result.is_playlist
        ? `Enqueued playlist: **${result.playlist_title || result.title}** (${result.playlist_tracks_count} tracks)`
        : `Now playing: [${result.title}](${result.source_url})`,
    });
  }

  if (commandName === "pause") {
    await sophia.getPlayer(guildId!)?.pause();
    await interaction.reply("Playback paused.");
  }

  if (commandName === "resume") {
    await sophia.getPlayer(guildId!)?.resume();
    await interaction.reply("Playback resumed.");
  }

  if (commandName === "skip") {
    await sophia.getPlayer(guildId!)?.skip();
    await interaction.reply("Track skipped.");
  }

  if (commandName === "leave") {
    await sophia.getPlayer(guildId!)?.disconnect();
    await interaction.reply("Disconnected from voice channel.");
  }
});

client.login("YOUR_DISCORD_BOT_TOKEN");
```

## DSP & Equalization

axAudio features hardware-grade 48 kHz digital signal processing (DSP). SophiaFX provides programmatic control over all acoustic parameters.

### Calibrated Presets

| Preset | Recommended Use |
| --- | --- |
| `music` | General music listening |
| `cinema-3d` | Movies and immersive cinematic audio |
| `bass-boost-3d` | Bass enhancement with spatial widening |
| `vocal-clarity` | Vocals, podcasts, and spoken streams |
| `gaming-3d` | Positional spatial audio for gaming |
| `concert-hall` | Live concert hall acoustic atmosphere |
| `flat` | Transparent and flat response |

```typescript
await player.setPreset("cinema-3d");
```

### 15-Band Graphic Equalizer

Bands use standard ISO center frequencies:

| Band | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hz | 25 | 40 | 63 | 100 | 160 | 250 | 400 | 630 | 1k | 1.6k | 2.5k | 4k | 6.3k | 10k | 16k |

```typescript
await player.setEqualizer([
  { band: 0, gain: 4.5 }, // 25 Hz sub-bass (+4.5 dB)
  { band: 1, gain: 3.0 }, // 40 Hz punch (+3.0 dB)
  { band: 8, gain: 1.5 }, // 1 kHz vocal presence (+1.5 dB)
]);
```

### 3D Spatial Acoustic Modeling

```typescript
await player.setSpatial({
  stereo_width: 1.35, // Mid/Side stereo expansion (1.0 = normal, 1.35 = 3D immersive)
  binaural_crossfeed: true, // Head-shadow delay at 700 Hz (reduces headphone fatigue)
  crossfeed_level: 0.18, // Acoustic bleed mix level (0.0 to 0.40)
  bass_exciter: true, // Harmonic sub-bass exciter at 85 Hz
  bass_exciter_drive: 0.35, // Saturation harmonic intensity
});
```

### Reset to Flat Response

```typescript
await player.resetDsp();
```

## Search and Track Resolution

Resolve URLs or query tracks without enqueueing them immediately:

```typescript
// Search on YouTube or SoundCloud
const results = await sophia.search("Daft Punk Get Lucky", {
  source: "youtube",
  limit: 5,
});

for (const track of results.tracks) {
  console.log(`${track.title} - ${track.url} (${track.duration_secs}s)`);
}

// Extract URL metadata and resolve direct CDN stream
const resolved = await sophia.resolve(
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
);
console.log(`Direct CDN stream URL: ${resolved.stream_url}`);
```

## Events

SophiaFX emits cluster lifecycle events and axAudio telemetry (`/v1/events`):

| Event | Arguments | Description |
| --- | --- | --- |
| `ready` | `nodeName` | A node connected and is ready |
| `trackStart` | `player, track` | A track started playing |
| `trackEnd` | `player, track, reason` | A track finished playing, along with the completion reason |
| `trackError` | `player, track, error` | An error occurred while streaming a track |

## Raw Connector

For distributed Discord bot architectures where Gateway packets are received through Kafka, RabbitMQ, or NATS:

```typescript
import { SophiaFX, RawConnector } from "sophiafx";

const connector = new RawConnector({
  botId: "123456789012345678",
  sendVoiceUpdate: (guildId, channelId, selfMute, selfDeaf) => {
    // Forward OpCode 4 payload to your message broker or shard cluster
    rabbitChannel.sendToQueue(
      "gateway_outbound",
      Buffer.from(
        JSON.stringify({
          op: 4,
          d: {
            guild_id: guildId,
            channel_id: channelId,
            self_mute: selfMute,
            self_deaf: selfDeaf,
          },
        }),
      ),
    );
  },
});

const sophia = new SophiaFX(connector, [
  { name: "axaudio", url: "http://axaudio:2333" },
]);

// Feed raw gateway packets into the connector when received from broker
brokerConsumer.on("message", (msg) => {
  const packet = JSON.parse(msg.content.toString());
  connector.forwardRawPacket(packet);
});
```

## License

Distributed under the [MIT License](../../LICENSE). Created by **Shnimlz**.
