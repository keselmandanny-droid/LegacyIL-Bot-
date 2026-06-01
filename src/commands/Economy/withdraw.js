import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('💸 משוך כסף מהבנק שלך לארנקך')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('כמות למשיכה')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getInteger("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה שלך. אנא נסה שוב מאוחר יותר.",
                    { userId, guildId }
                );
            }

            let withdrawAmount = amountInput;

            if (withdrawAmount <= 0) {
                throw createError(
                    "Invalid withdrawal amount",
                    ErrorTypes.VALIDATION,
                    "עליך למשוך סכום חיובי.",
                    { amount: withdrawAmount, userId }
                );
            }

            if (withdrawAmount > userData.bank) {
                withdrawAmount = userData.bank;
            }

            if (withdrawAmount === 0) {
                throw createError(
                    "Empty bank account",
                    ErrorTypes.VALIDATION,
                    "חשבון הבנק שלך ריק.",
                    { userId, bankBalance: userData.bank }
                );
            }

            userData.wallet += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "משיכה",
                `ביצעת בהצלחה משיכה של **$${withdrawAmount.toLocaleString()}** מהבנק שלך.`
            )
                .addFields(
                    {
                        name: "💵 יתרת מזומנים חדשה",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 יתרת בנק חדשה",
                        value: `$${userData.bank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
