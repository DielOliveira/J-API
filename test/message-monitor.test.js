import assert from 'node:assert/strict';
import test from 'node:test';
import { monitoredMessage } from '../src/message-monitor.js';

const monitor = { phone: '5562999999999' };
const socket = { signalRepository: { lidMapping: { getPNForLID: async () => '5562999999999@s.whatsapp.net' } } };

test('captures sent and received text only for the monitored phone', async () => {
  const received = await monitoredMessage(socket, {
    key: { id: 'received-1', remoteJid: '5562999999999@s.whatsapp.net', fromMe: false },
    messageTimestamp: 123,
    message: { conversation: 'Olá' }
  }, monitor, 'default', 999);
  assert.deepEqual(received, {
    session: 'default', messageId: 'received-1', phone: '5562999999999', direction: 'received',
    messageType: 'conversation', text: 'Olá', content: { text: 'Olá' }, messageAt: 123000, storedAt: 999
  });

  const sent = await monitoredMessage(socket, {
    key: { id: 'sent-1', remoteJid: '123456789@lid', fromMe: true },
    messageTimestamp: 124,
    message: { extendedTextMessage: { text: 'Resposta' } }
  }, monitor, 'default', 1000);
  assert.equal(sent.direction, 'sent');
  assert.equal(sent.text, 'Resposta');

  assert.equal(await monitoredMessage(socket, {
    key: { id: 'other', remoteJid: '5511111111111@s.whatsapp.net', fromMe: false },
    message: { conversation: 'ignorar' }
  }, monitor, 'default'), null);
});

test('ignores group messages', async () => {
  assert.equal(await monitoredMessage(socket, {
    key: { id: 'group', remoteJid: '123@g.us', participantAlt: '5562999999999@s.whatsapp.net' },
    message: { conversation: 'grupo' }
  }, monitor, 'default'), null);
});
