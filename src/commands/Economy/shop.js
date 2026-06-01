import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import shopBrowse from './modules/shop_browse.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('🛍️ פקודות חנות כלכלה')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('🏪 עיין בחנות הכלכלה'),
        )
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('⚙️ הגדר הגדרות חנות (נדרשת הרשאת ניהול שרת)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('setrole')
                        .setDescription('⭐ הגדר את תפקיד Discord שניתן בעת קנייה של פריט תפקיד פרימיום')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('התפקיד שיהיה ניתן לקניות תפקיד פרימיום')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'browse') {
                return await shopBrowse.execute(interaction, config, client);
            }

            if (subcommandGroup === 'config' && subcommand === 'setrole') {
                return await shopConfigSetrole.execute(interaction, config, client);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('שגיאה', 'פקודה משנית לא ידועה.')],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('shop command error:', error);
            await InteractionHelper.safeReply(interaction, {
                content: '❌ אירעה שגיאה בעת הפעלת פקודת החנות.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
