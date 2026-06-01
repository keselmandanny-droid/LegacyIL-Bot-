import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("💥 צור כרזת WANTED למשתמש")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("המשתמש שנחפש")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("crime")
        .setDescription("הפשע שביצעו")
        .setRequired(false)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const targetUser = interaction.options.getUser("user");
      const crimeRaw = interaction.options.getString("crime");

      
      let crime = "יפה מדי עבור השרת הזה";
      if (crimeRaw) {
        const sanitizedCrime = sanitizeInput(crimeRaw.trim(), 100);
        if (sanitizedCrime.length > 0) {
          crime = sanitizedCrime;
        }
      }

      
      if (!targetUser) {
        throw new TitanBotError(
          'Target user not found for wanted command',
          ErrorTypes.USER_INPUT,
          'לא הצלחתי למצוא את המשתמש שצוין'
        );
      }

      const bountyAmount = Math.floor(
        Math.random() * (100000000 - 1000000) + 1000000,
      );
      const bounty = `$${bountyAmount.toLocaleString()} שקלים`;

      const embed = createEmbed({
        color: 'primary',
        title: '💥 פרס גדול: מחפושים! 💥',
        description: `**פושע:** ${targetUser.tag}\n**פשע:** ${crime}`,
        fields: [
          {
            name: "חי או מת",
            value: `**פרס:** ${bounty}`,
            inline: false,
          },
        ],
        image: {
          url: targetUser.displayAvatarURL({ size: 1024, extension: 'png' }),
        },
        footer: {
          text: `נראה לאחרונה ב-${interaction.guild.name}`,
        },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Wanted command executed by user ${interaction.user.id} for ${targetUser.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Wanted command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'wanted',
        source: 'wanted_command'
      });
    }
  },
};
