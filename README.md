<div align="center">

<p align="center">
  <picture>
    <img alt="AxAudio" src="assets/img/logo.svg" width="300">
  </picture>
</p>

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

_(Optional peer dependency for Discord.js bots)_:

```bash
npm install discord.js
```

---

## 🚀 Quick Start (Discord.js v14)

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

// Initialize SophiaFX orchestrator
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
  console.log(`🔌 axAudio node '${nodeName}' connected and ready.`);
});

sophia.on("trackStart", (player, track) => {
  console.log(`🎶 [Guild ${player.guildId}] Now playing: ${track.title}`);
});

sophia.on("trackEnd", (player, track, reason) => {
  console.log(
    `⏹️ [Guild ${player.guildId}] Track finished: ${track?.title} (${reason})`,
  );
});

sophia.on("trackError", (player, track, error) => {
  console.error(
    `❌ [Guild ${player.guildId}] Error playing ${track?.title}: ${error}`,
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

    // Join voice and retrieve player
    const player = await sophia.join({
      guildId: guildId!,
      channelId: voiceChannel.id,
    });

    // Enqueue track or playlist in axAudio
    const result = await player.play(query);

    await interaction.editReply({
      content: result.is_playlist
        ? `📜 **Enqueued playlist**: ${result.playlist_title || result.title} (${result.playlist_tracks_count} tracks)`
        : `▶️ **Now playing**: [${result.title}](${result.source_url})`,
    });
  }

  if (commandName === "pause") {
    const player = sophia.getPlayer(guildId!);
    await player?.pause();
    await interaction.reply("⏸️ Playback paused.");
  }

  if (commandName === "resume") {
    const player = sophia.getPlayer(guildId!);
    await player?.resume();
    await interaction.reply("▶️ Playback resumed.");
  }

  if (commandName === "skip") {
    const player = sophia.getPlayer(guildId!);
    await player?.skip();
    await interaction.reply("⏭️ Track skipped.");
  }

  if (commandName === "leave") {
    const player = sophia.getPlayer(guildId!);
    await player?.disconnect();
    await interaction.reply("🚪 Disconnected from voice channel.");
  }
});

client.login("YOUR_DISCORD_BOT_TOKEN");
```

---

## 🎛️ DSP & Studio Equalization

axAudio features hardware-grade 48 kHz digital signal processing (DSP). SophiaFX gives you programmatic control over all acoustic parameters:

### 1. Apply Calibrated Acoustic Presets

```typescript
// Calibrated presets: 'music', 'cinema-3d', 'bass-boost-3d', 'vocal-clarity', 'gaming-3d', 'concert-hall', 'flat'
await player.setPreset("cinema-3d");
```

### 2. Configure 15-Band Graphic Equalizer

Standard ISO center frequencies: `25Hz, 40Hz, 63Hz, 100Hz, 160Hz, 250Hz, 400Hz, 630Hz, 1kHz, 1.6kHz, 2.5kHz, 4kHz, 6.3kHz, 10kHz, 16kHz`.

```typescript
await player.setEqualizer([
  { band: 0, gain: 4.5 }, // 25 Hz sub-bass (+4.5 dB)
  { band: 1, gain: 3.0 }, // 40 Hz punch (+3.0 dB)
  { band: 8, gain: 1.5 }, // 1 kHz vocal presence (+1.5 dB)
]);
```

### 3. Real-Time 3D Spatial Acoustic Modeling

```typescript
await player.setSpatial({
  stereo_width: 1.35, // Mid/Side stereo expansion (1.0 = normal, 1.35 = 3D immersive)
  binaural_crossfeed: true, // Head-shadow delay at 700 Hz (reduces headphone fatigue)
  crossfeed_level: 0.18, // Acoustic bleed mix level (0.0 to 0.40)
  bass_exciter: true, // Harmonic sub-bass exciter at 85 Hz
  bass_exciter_drive: 0.35, // Saturation harmonic intensity
});
```

### 4. Reset to Flat Transparent Response

```typescript
await player.resetDsp();
```

---

## 🔍 Search and Track Resolution

Resolve URLs or query tracks without enqueueing them immediately:

```typescript
// Search YouTube or SoundCloud
const results = await sophia.search("Daft Punk Get Lucky", {
  source: "youtube",
  limit: 5,
});

for (const track of results.tracks) {
  console.log(`${track.title} - ${track.url} (${track.duration_secs}s)`);
}

// Direct URL metadata and CDN stream resolution
const resolved = await sophia.resolve(
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
);
console.log(`Direct CDN stream URL: ${resolved.stream_url}`);
```

---

## 🏗️ Raw Connector (Microservices / Distributed Architecture)

If your Discord bot runs in decoupled services where Discord Gateway packets arrive via Kafka, RabbitMQ, or NATS:

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

---

## 📄 License

Licensed under the [MIT License](LICENSE). Created by **Shnimlz**.
