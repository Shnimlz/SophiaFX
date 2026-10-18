import test from 'node:test';
import assert from 'node:assert/strict';
import { SophiaFX, RawConnector, Node, Player } from '../dist/index.js';

test('RawConnector provides Bot ID and sends voice updates', () => {
  let calledWith = null;
  const connector = new RawConnector({
    botId: '123456789012345678',
    sendVoiceUpdate: (guildId, channelId, selfMute, selfDeaf) => {
      calledWith = { guildId, channelId, selfMute, selfDeaf };
    }
  });

  assert.equal(connector.getBotId(), '123456789012345678');

  connector.sendVoiceUpdate('guild_1', 'channel_1', false, true);
  assert.deepEqual(calledWith, {
    guildId: 'guild_1',
    channelId: 'channel_1',
    selfMute: false,
    selfDeaf: true
  });
});

test('Node normalizes HTTP and WebSocket URLs correctly', () => {
  const node = new Node({
    name: 'test-node',
    url: 'http://127.0.0.1:2333/'
  });

  assert.equal(node.url, 'http://127.0.0.1:2333');
  assert.equal(node.wsUrl, 'ws://127.0.0.1:2333/v1/events');
  assert.equal(node.connected, false);
});

test('SophiaFX orchestrates players and nodes cleanly', () => {
  const connector = new RawConnector({
    botId: '987654321',
    sendVoiceUpdate: () => {}
  });

  const sophia = new SophiaFX(
    connector,
    [
      {
        name: 'primary',
        url: 'http://127.0.0.1:2333',
        autoReconnect: false
      }
    ],
    { defaultSearchSource: 'youtube' }
  );

  assert.equal(sophia.nodes.size, 1);
  assert.ok(sophia.nodes.get('primary'));

  const player = sophia.createPlayer('guild_100', 'primary');
  assert.ok(player instanceof Player);
  assert.equal(player.guildId, 'guild_100');
  assert.equal(player.volume, 1.0);
  assert.equal(player.isPlaying, false);
  assert.equal(player.isPaused, false);
  assert.deepEqual(player.queue, []);

  assert.equal(sophia.getPlayer('guild_100'), player);

  sophia.destroyPlayer('guild_100');
  assert.equal(sophia.getPlayer('guild_100'), undefined);

  sophia.destroy();
});

test('Type guards identify Discord voice packets accurately', async () => {
  const { isVoiceStatePacket, isVoiceServerPacket } = await import('../dist/connectors/Connector.js');

  const voiceStatePkt = {
    t: 'VOICE_STATE_UPDATE',
    d: {
      guild_id: 'g1',
      channel_id: 'c1',
      user_id: 'u1',
      session_id: 's1'
    }
  };

  const voiceServerPkt = {
    t: 'VOICE_SERVER_UPDATE',
    d: {
      guild_id: 'g1',
      token: 'tok_abc',
      endpoint: 'voice.discord.gg:443'
    }
  };

  const messagePkt = {
    t: 'MESSAGE_CREATE',
    d: { id: 'm1', content: 'hello' }
  };

  assert.equal(isVoiceStatePacket(voiceStatePkt), true);
  assert.equal(isVoiceStatePacket(voiceServerPkt), false);
  assert.equal(isVoiceStatePacket(messagePkt), false);

  assert.equal(isVoiceServerPacket(voiceServerPkt), true);
  assert.equal(isVoiceServerPacket(voiceStatePkt), false);
  assert.equal(isVoiceServerPacket(messagePkt), false);
});

test('Node configures password authentication in wsUrl and headers', () => {
  const node = new Node({
    name: 'secured-node',
    url: 'http://127.0.0.1:2333',
    password: 'super-secret-password-123'
  });

  assert.equal(node.wsUrl, 'ws://127.0.0.1:2333/v1/events?password=super-secret-password-123');
  assert.equal(node.options.password, 'super-secret-password-123');
});

test('Player executes extended controls and updates state', async () => {
  const connector = new RawConnector({
    botId: '123',
    sendVoiceUpdate: () => {}
  });

  const sophia = new SophiaFX(connector, [
    {
      name: 'test-node',
      url: 'http://127.0.0.1:2333',
      autoReconnect: false
    }
  ]);

  const node = sophia.nodes.get('test-node');
  let lastControl = null;
  node.control = async (guildId, action, options) => {
    lastControl = { guildId, action, options };
    return 'ok';
  };

  const player = sophia.createPlayer('guild_42', 'test-node');

  // Seek
  await player.seek(45.5);
  assert.equal(player.currentPositionSecs, 45.5);
  assert.deepEqual(lastControl, {
    guildId: 'guild_42',
    action: 'seek',
    options: { position_secs: 45.5 }
  });

  // Loop
  await player.setLoop('track');
  assert.equal(player.loopMode, 'track');
  assert.deepEqual(lastControl, {
    guildId: 'guild_42',
    action: 'loop',
    options: { mode: 'track' }
  });

  // Shuffle
  await player.shuffle();
  assert.deepEqual(lastControl, {
    guildId: 'guild_42',
    action: 'shuffle',
    options: undefined
  });

  // Remove
  await player.removeTrack(2);
  assert.deepEqual(lastControl, {
    guildId: 'guild_42',
    action: 'remove',
    options: { index: 2 }
  });

  // Move
  await player.moveTrack(3, 1);
  assert.deepEqual(lastControl, {
    guildId: 'guild_42',
    action: 'move',
    options: { from_index: 3, to_index: 1 }
  });

  sophia.destroy();
});

test('Player executes modulation, loudness and timescale DSP controls', async () => {
  const connector = new RawConnector({
    botId: '123',
    sendVoiceUpdate: () => {}
  });

  const sophia = new SophiaFX(connector, [
    {
      name: 'test-node',
      url: 'http://127.0.0.1:2333',
      autoReconnect: false
    }
  ]);

  const node = sophia.nodes.get('test-node');
  let lastDsp = null;
  node.setDsp = async (guildId, options) => {
    lastDsp = { guildId, options };
    return {
      guild_id: guildId,
      status: {
        active_preset: null,
        stereo_width: 1.0,
        binaural_crossfeed: false,
        bass_exciter: false,
        eq_bands: [],
        rotation: true,
        rotation_speed_hz: 0.15,
        tremolo: false,
        vibrato: false,
        loudness: true,
        target_lufs: -14.0,
        speed: 1.25,
        pitch: 1.25,
        rate: 1.0
      },
      message: 'DSP updated'
    };
  };

  const player = sophia.createPlayer('guild_dsp', 'test-node');

  // Rotation (8D)
  await player.setRotation(true, 0.2);
  assert.deepEqual(lastDsp.options.modulation, {
    rotation: true,
    rotation_speed_hz: 0.2
  });

  // Tremolo
  await player.setTremolo(true, 5.0, 0.6);
  assert.deepEqual(lastDsp.options.modulation, {
    tremolo: true,
    tremolo_freq_hz: 5.0,
    tremolo_depth: 0.6
  });

  // Vibrato
  await player.setVibrato(true, 4.0, 0.4);
  assert.deepEqual(lastDsp.options.modulation, {
    vibrato: true,
    vibrato_freq_hz: 4.0,
    vibrato_depth: 0.4
  });

  // Loudness (EBU R128)
  await player.setLoudness({ enabled: true, target_lufs: -16.0 });
  assert.deepEqual(lastDsp.options.loudness, {
    enabled: true,
    target_lufs: -16.0
  });

  // Timescale
  await player.setTimescale({ speed: 1.25, pitch: 1.25, rate: 1.0 });
  assert.deepEqual(lastDsp.options.timescale, {
    speed: 1.25,
    pitch: 1.25,
    rate: 1.0
  });

  // Speed and Pitch helpers
  await player.setSpeed(1.5);
  assert.deepEqual(lastDsp.options.timescale, { speed: 1.5 });

  await player.setPitch(0.85);
  assert.deepEqual(lastDsp.options.timescale, { pitch: 0.85 });

  sophia.destroy();
});

test('Node.request attaches HTTP status code to error on non-ok response', async () => {
  const node = new Node({
    name: 'err-node',
    url: 'http://127.0.0.1:2333'
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({
      success: false,
      data: null,
      message: 'No hay reproductor de voz activo para este servidor'
    })
  });

  try {
    await assert.rejects(
      async () => {
        await node.request('/v1/player/queue', { method: 'POST' });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, 'No hay reproductor de voz activo para este servidor');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    node.destroy();
  }
});

test('Player.getQueue returns empty queue gracefully on 404 / inactive player from axAudio Idle GC', async () => {
  const connector = new RawConnector({
    botId: '123',
    sendVoiceUpdate: () => {}
  });

  const sophia = new SophiaFX(connector, [
    {
      name: 'test-node',
      url: 'http://127.0.0.1:2333',
      autoReconnect: false
    }
  ]);

  const node = sophia.nodes.get('test-node');
  node.getQueue = async () => {
    const err = new Error('No hay reproductor de voz activo para este servidor');
    err.status = 404;
    throw err;
  };

  const player = sophia.createPlayer('guild_gc', 'test-node');
  player.isPlaying = true;
  player.current = {
    title: 'Old Track',
    source_url: 'https://youtube.com/watch?v=123',
    stream_url: 'http://stream',
    duration_secs: 180,
    author: 'Artist',
    thumbnail: null
  };
  player.queue = [player.current];

  const q = await player.getQueue();
  assert.equal(q.is_playing, false);
  assert.equal(q.current, null);
  assert.deepEqual(q.queue, []);
  assert.equal(q.total_tracks, 0);
  assert.equal(player.isPlaying, false);
  assert.equal(player.current, null);
  assert.deepEqual(player.queue, []);

  sophia.destroy();
});

test('Player.play immediately sets current track when was_empty is true', async () => {
  const connector = new RawConnector({
    botId: '123',
    sendVoiceUpdate: () => {}
  });

  const sophia = new SophiaFX(connector, [
    {
      name: 'test-node',
      url: 'http://127.0.0.1:2333',
      autoReconnect: false
    }
  ]);

  const node = sophia.nodes.get('test-node');
  const trackResponse = {
    title: 'Test Song',
    source_url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
    stream_url: 'http://cdn/stream',
    duration_secs: 210,
    author: 'Spotify Artist',
    thumbnail: 'https://i.scdn.co/image/abc',
    is_playlist: false,
    playlist_title: null,
    playlist_tracks_count: 1,
    queue_length: 1,
    was_empty: true
  };

  node.play = async () => trackResponse;

  const player = sophia.createPlayer('guild_play', 'test-node');
  assert.equal(player.current, null);

  const res = await player.play('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(res.was_empty, true);
  assert.equal(player.isPlaying, true);
  assert.equal(player.current?.title, 'Test Song');
  assert.equal(player.current?.source_url, 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');

  sophia.destroy();
});

