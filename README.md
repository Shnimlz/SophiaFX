<div align="center">

<img alt="SophiaFX" src="assets/img/logo.svg">

**Cliente y orquestador TypeScript, ultraligero y de alto rendimiento, para los motores de audio de Discord [axAudio](https://github.com/Shnimlz/axAudio).**

[![npm version](https://img.shields.io/npm/v/sophiafx.svg?style=flat&color=3178c6)](https://www.npmjs.com/package/sophiafx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js&logoColor=white)](https://nodejs.org/)

Una alternativa moderna y con tipado seguro a Shoukaku, diseñada para el pipeline de audio nativo en Rust de axAudio: latencia submilisegundo, ecualizador DSP de 15 bandas y telemetría en tiempo real por WebSocket.

[English](assets/language/en.md) · [Instalación](#instalación) · [Inicio rápido](#inicio-rápido) · [DSP y ecualización](#dsp-y-ecualización) · [Búsqueda](#búsqueda-y-resolución-de-pistas) · [Eventos](#eventos) · [Raw Connector](#raw-connector)

</div>

## Características

- **Hecho a medida para axAudio**: bindings directos al plano de control REST y al driver Songbird RTP a 50 Hz.
- **DSP de estudio y ecualizador de 15 bandas**: ecualización en tiempo real, ensanchamiento espacial Mid/Side con coherencia de fase, crossfeed acústico y exciter de sub-graves.
- **Clustering multinodo con failover automático**: varios nodos axAudio distribuidos, ruteo al nodo con menor carga y migración transparente de reproductores cuando un nodo cae.
- **Conectores intercambiables**: `DiscordJSConnector` (Discord.js v14+) y `RawConnector` (agnóstico, ideal para microservicios, RabbitMQ o Kafka).
- **Telemetría en tiempo real**: suscripción WebSocket a `/v1/events` con keep-alive, ping/pong y reconexión con backoff.
- **Playlists de arranque rápido**: la cola se carga en segundo plano mientras la primera pista ya está sonando.
- **Cero dependencias nativas**: TypeScript puro y librerías estándar de Node.js, sin compilación ni binarios por plataforma.

## Requisitos

- Node.js 18 o superior
- Un nodo [axAudio](https://github.com/Shnimlz/axAudio) accesible por HTTP
- `discord.js` v14+ solo si usas `DiscordJSConnector`

## Instalación

```bash
npm install sophiafx
```

Dependencia opcional para bots con Discord.js:

```bash
npm install discord.js
```

## Inicio rápido

Ejemplo completo con Discord.js v14:

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

// Inicializa el orquestador
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

// Eventos del ciclo de vida del cluster
sophia.on("ready", (nodeName) => {
  console.log(`Nodo axAudio '${nodeName}' conectado y listo.`);
});

sophia.on("trackStart", (player, track) => {
  console.log(`[Guild ${player.guildId}] Reproduciendo: ${track.title}`);
});

sophia.on("trackEnd", (player, track, reason) => {
  console.log(
    `[Guild ${player.guildId}] Pista terminada: ${track?.title} (${reason})`,
  );
});

sophia.on("trackError", (player, track, error) => {
  console.error(`[Guild ${player.guildId}] Error en ${track?.title}: ${error}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member } = interaction;
  const voiceChannel = (member as any)?.voice?.channel;

  if (commandName === "play") {
    if (!voiceChannel) {
      await interaction.reply({
        content: "¡Debes estar en un canal de voz!",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    // Entra al canal de voz y obtiene el reproductor
    const player = await sophia.join({
      guildId: guildId!,
      channelId: voiceChannel.id,
    });

    // Encola una pista o playlist en axAudio
    const result = await player.play(query);

    await interaction.editReply({
      content: result.is_playlist
        ? `Playlist en cola: **${result.playlist_title || result.title}** (${result.playlist_tracks_count} pistas)`
        : `Reproduciendo: [${result.title}](${result.source_url})`,
    });
  }

  if (commandName === "pause") {
    await sophia.getPlayer(guildId!)?.pause();
    await interaction.reply("Reproducción pausada.");
  }

  if (commandName === "resume") {
    await sophia.getPlayer(guildId!)?.resume();
    await interaction.reply("Reproducción reanudada.");
  }

  if (commandName === "skip") {
    await sophia.getPlayer(guildId!)?.skip();
    await interaction.reply("Pista omitida.");
  }

  if (commandName === "leave") {
    await sophia.getPlayer(guildId!)?.disconnect();
    await interaction.reply("Desconectado del canal de voz.");
  }
});

client.login("YOUR_DISCORD_BOT_TOKEN");
```

## DSP y ecualización

axAudio incluye procesamiento digital de señal (DSP) de grado profesional a 48 kHz. SophiaFX expone control programático sobre todos los parámetros acústicos.

### Presets calibrados

| Preset          | Uso recomendado                                |
| --------------- | ---------------------------------------------- |
| `music`         | Escucha general de música                      |
| `cinema-3d`     | Películas y contenido con sensación envolvente |
| `bass-boost-3d` | Énfasis en graves con ensanchamiento espacial  |
| `vocal-clarity` | Voces, podcasts y streams hablados             |
| `gaming-3d`     | Posicionamiento espacial para juegos           |
| `concert-hall`  | Ambiente de sala de conciertos                 |
| `nightcore`     | Aceleración de tempo y tono (+25%) y EQ V-Shape|
| `vaporwave`     | Desaceleración analógica (-18%) y campo amplio |
| `8d`            | Rotación orbital 3D continua a 0.15 Hz         |
| `tremolo`       | Modulación de amplitud cálida a 4.5 Hz         |
| `vibrato`       | Modulación de frecuencia de tono a 5.0 Hz      |
| `broadcast`     | Sonoridad normalizada a -14 LUFS (EBU R128)    |
| `flat`          | Respuesta plana y transparente                 |

```typescript
await player.setPreset("cinema-3d");
await player.setPreset("nightcore");
```

### Controles avanzados de reproducción

```typescript
// Salto a posición específica (seek en segundos)
await player.seek(90); // Salta al minuto 1:30

// Modo de repetición ('off' | 'track' | 'queue')
await player.setLoop('track');

// Mezcla aleatoria de la cola
await player.shuffle();

// Eliminar pista de la cola por índice
await player.removeTrack(2);

// Reordenar pista dentro de la cola
await player.moveTrack(3, 1);
```

### Timescale (Velocidad y Pitch independientes)

```typescript
// Aceleración/desaceleración y tono con remuestreador Hermite y WSOLA
await player.setTimescale({
  speed: 1.25, // Tempo más rápido sin alterar el tono
  pitch: 1.0,  // Tono neutro
});

// O directamente mediante helpers
await player.setSpeed(1.20);
await player.setPitch(1.10);
```

### Normalización de volumen perceptual (EBU R128)

```typescript
// Control automático de ganancia y limitador True-Peak
await player.setLoudness({
  enabled: true,
  target_lufs: -14.0, // Nivel objetivo broadcast
  max_gain_db: 9.0,
  min_gain_db: -12.0,
});
```

### Modulación dinámica y 8D Audio

```typescript
// Rotación orbital espacial 8D continua
await player.setRotation(true, 0.15); // 0.15 Hz

// Modulación Tremolo / Vibrato
await player.setTremolo(true, 4.5, 0.55);
await player.setVibrato(true, 5.0, 0.35);
```

### Ecualizador gráfico de 15 bandas

Las bandas usan las frecuencias centrales estándar ISO:

| Banda | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9    | 10   | 11  | 12   | 13  | 14  |
| ----- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---- | ---- | --- | ---- | --- | --- |
| Hz    | 25  | 40  | 63  | 100 | 160 | 250 | 400 | 630 | 1k  | 1.6k | 2.5k | 4k  | 6.3k | 10k | 16k |

```typescript
await player.setEqualizer([
  { band: 0, gain: 4.5 }, // 25 Hz, sub-graves (+4.5 dB)
  { band: 1, gain: 3.0 }, // 40 Hz, punch (+3.0 dB)
  { band: 8, gain: 1.5 }, // 1 kHz, presencia vocal (+1.5 dB)
]);
```

### Modelado acústico espacial 3D

```typescript
await player.setSpatial({
  stereo_width: 1.35, // Expansión estéreo Mid/Side (1.0 = normal, 1.35 = inmersivo 3D)
  binaural_crossfeed: true, // Retardo de sombra de cabeza a 700 Hz (reduce la fatiga con audífonos)
  crossfeed_level: 0.18, // Nivel de mezcla del sangrado acústico (0.0 a 0.40)
  bass_exciter: true, // Exciter armónico de sub-graves a 85 Hz
  bass_exciter_drive: 0.35, // Intensidad de la saturación armónica
});
```

### Restablecer a respuesta plana

```typescript
await player.resetDsp();
```

## Búsqueda y resolución de pistas

Resuelve URLs o consulta pistas sin encolarlas de inmediato:

```typescript
// Búsqueda en YouTube o SoundCloud
const results = await sophia.search("Daft Punk Get Lucky", {
  source: "youtube",
  limit: 5,
});

for (const track of results.tracks) {
  console.log(`${track.title} - ${track.url} (${track.duration_secs}s)`);
}

// Metadatos de una URL y resolución del stream directo del CDN
const resolved = await sophia.resolve(
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
);
console.log(`URL directa del CDN: ${resolved.stream_url}`);
```

## Eventos

SophiaFX emite los eventos del cluster y de la telemetría de axAudio (`/v1/events`):

| Evento       | Argumentos              | Descripción                        |
| ------------ | ----------------------- | ---------------------------------- |
| `ready`      | `nodeName`              | Un nodo se conectó y está listo    |
| `trackStart` | `player, track`         | Empezó una pista                   |
| `trackEnd`   | `player, track, reason` | Terminó una pista, con el motivo   |
| `trackError` | `player, track, error`  | Falló la reproducción de una pista |

## Raw Connector

Para bots de Discord desacoplados en servicios, donde los paquetes del Gateway llegan por Kafka, RabbitMQ o NATS:

```typescript
import { SophiaFX, RawConnector } from "sophiafx";

const connector = new RawConnector({
  botId: "123456789012345678",
  sendVoiceUpdate: (guildId, channelId, selfMute, selfDeaf) => {
    // Reenvía el payload OpCode 4 a tu broker de mensajes o cluster de shards
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

// Entrega al conector los paquetes crudos del gateway que llegan del broker
brokerConsumer.on("message", (msg) => {
  const packet = JSON.parse(msg.content.toString());
  connector.forwardRawPacket(packet);
});
```

## Licencia

Distribuido bajo la [Licencia MIT](LICENSE). Creado por **Shnimlz**.
