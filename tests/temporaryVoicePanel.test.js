const { PermissionFlagsBits } = require('discord.js');
const { createPanel } = require('../src/utils/temporaryVoicePanel');

describe('temporary voice room panel', () => {
  test('shows persistent room controls and reflects current lock and visibility', () => {
    const channel = {
      id: 'voice-channel-123',
      name: 'Sala de prueba',
      userLimit: 4,
      guild: { roles: { everyone: { id: 'everyone' } } },
      permissionOverwrites: {
        cache: new Map([['everyone', {
          deny: {
            has: permission => permission === PermissionFlagsBits.Connect
          }
        }]])
      }
    };

    const panel = createPanel(channel, 'owner-user');

    expect(panel.embeds[0].data.description).toContain('Propietario:** <@owner-user>');
    expect(panel.embeds[0].data.description).toContain('Límite:** 4');
    expect(panel.embeds[0].data.description).toContain('Acceso:** Cerrada');
    expect(panel.components.flatMap(row => row.components).map(component => component.data.custom_id))
      .toEqual([
        'tempvoice:rename:voice-channel-123',
        'tempvoice:limit:voice-channel-123',
        'tempvoice:unlock:voice-channel-123',
        'tempvoice:hide:voice-channel-123',
        'tempvoice:transfer:voice-channel-123',
        'tempvoice:delete:voice-channel-123'
      ]);
  });
});
