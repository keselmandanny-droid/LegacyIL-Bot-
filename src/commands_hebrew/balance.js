import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("בדוק את הכסף שלך או של מישהו אחר")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('משתמש לבדיקת כסף')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const guildId = interaction.guildId;

            logger.debug(`[כלכלה] בדיקת כסף עבור ${targetUser.id}`, { userId: targetUser.id, guildId });

            if (targetUser.bot) {
                throw createError(
                    "בוט שונה נשאל לכסף",
                    ErrorTypes.VALIDATION,
                    "בוטים לא יכולים להחזיק כסף בכלכלה."
                );
            }

            const userData = await getEconomyData(client, guildId, targetUser.id);
            
            if (!userData) {
                throw createError(
                    "כשל בטעינת נתוני כלכלה",
                    ErrorTypes.DATABASE,
                    "כשל בטעינת נתוני כלכלה. אנא נסה שוב מאוחר יותר.",
                    { userId: targetUser.id, guildId }
                );
            }

            const maxBank = getMaxBankCapacity(userData);

            const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
            const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = createEmbed({
                title: `💰 כסף של ${targetUser.username}`,
                description: `הנה הסטטוס הכלכלי הנוכחי עבור ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 מזומנים",
                        value: `₪${wallet.toLocaleString('he-IL')}`,
                        inline: true,
                    },
                    {
                        name: "🏦 בנק",
                        value: `₪${bank.toLocaleString('he-IL')} / ₪${maxBank.toLocaleString('he-IL')}`,
                        inline: true,
                    },
                    {
                        name: "💎 סך הכל",
                        value: `₪${(wallet + bank).toLocaleString('he-IL')}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `בקשה מ-${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            logger.info(`[כלכלה] כסף אחזר`, { userId: targetUser.id, wallet, bank });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};