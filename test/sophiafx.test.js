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
