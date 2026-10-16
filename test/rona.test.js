import test from 'node:test';
import assert from 'node:assert/strict';
import { Rona, RawConnector, Node, Player } from '../dist/index.js';

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

test('Rona orchestrates players and nodes cleanly', () => {
  const connector = new RawConnector({
    botId: '987654321',
    sendVoiceUpdate: () => {}
  });

  const rona = new Rona(
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

  assert.equal(rona.nodes.size, 1);
  assert.ok(rona.nodes.get('primary'));

  const player = rona.createPlayer('guild_100', 'primary');
  assert.ok(player instanceof Player);
  assert.equal(player.guildId, 'guild_100');
  assert.equal(player.volume, 1.0);
  assert.equal(player.isPlaying, false);
  assert.equal(player.isPaused, false);
  assert.deepEqual(player.queue, []);

  assert.equal(rona.getPlayer('guild_100'), player);

  rona.destroyPlayer('guild_100');
  assert.equal(rona.getPlayer('guild_100'), undefined);

  rona.destroy();
});
