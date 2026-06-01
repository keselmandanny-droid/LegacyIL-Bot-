import { PermissionsBitField } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('הרשאה נדחתה', 'אתה צריך הרשאות **ניהול שרת** כדי להגדיר את תפקיד הפרימיום.')],
                ephemeral: true,
            });
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = role.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('✅ תפקיד פרימיום הוגדר', `**תפקיד חנות פרימיום** הוגדר ל-${role.toString()}. חברים שיקנו את פריט תפקיד פרימיום יקבלו את התפקיד הזה.`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('שגיאת מערכת', 'לא היה ניתן לשמור את הגדרות הגילד.')],
                ephemeral: true,
            });
        }
    },
};
