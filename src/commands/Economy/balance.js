import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("💰 בדוק את היתרה שלך או של מישהו אחר")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('משתמש לבדיקת יתרה')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

            if (targetUser.bot) {
                throw createError(
                    "Bot user queried for balance",
                    ErrorTypes.VALIDATION,
                    "לבוטים אין יתרה כלכלה."
                );
            }

            const userData = await getEconomyData(client, guildId, targetUser.id);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה. אנא נסה שוב מאוחר יותר.",
                    { userId: targetUser.id, guildId }
                );
            }

            const maxBank = getMaxBankCapacity(userData);

            const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
            const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = createEmbed({
                title: `💰 היתרה של ${targetUser.username}`,
                description: `כאן המצב הכלכלי הנוכחי ל-${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 מזומנים",
                        value: `$${wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 בנק",
                        value: `$${bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💎 סה״כ",
                        value: `$${(wallet + bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `בקשה מ-${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};
