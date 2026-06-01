import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("🚑 קבל קישור לשרת התמיכה"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("הצטרף לשרת התמיכה")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "🚑 צריך עזרה?", description: "הצטרף לשרת התמיכה הרשמי שלנו כדי לקבל סיוע, לדווח על באגים או להציע תכונות. אם אתה מתאים אישית את הבוט הזה, זכור לשנות את הקישור בקוד!" }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'שגיאת מערכת', description: 'לא ניתן היה להציג את מידע התמיכה.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};
