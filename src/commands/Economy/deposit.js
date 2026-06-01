import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('💳 הפקד כסף מהארנק שלך לבנק שלך')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('סכום להפקדה (מספר או "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getString("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה שלך. אנא נסה שוב מאוחר יותר.",
                    { userId, guildId }
                );
            }
            
            const maxBank = getMaxBankCapacity(userData);
            let depositAmount;

            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
            } else {
                depositAmount = parseInt(amountInput);

                if (isNaN(depositAmount) || depositAmount <= 0) {
                    throw createError(
                        "Invalid deposit amount",
                        ErrorTypes.VALIDATION,
                        `אנא הכנס מספר חוקי או 'all'. הכנסת: \`${amountInput}\``,
                        { amountInput, userId }
                    );
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "Zero deposit amount",
                    ErrorTypes.VALIDATION,
                    "אין לך מזומנים להפקדה.",
                    { userId, walletBalance: userData.wallet }
                );
            }

            if (depositAmount > userData.wallet) {
                depositAmount = userData.wallet;
                await interaction.followUp({
                    embeds: [
                        MessageTemplates.ERRORS.INVALID_INPUT(
                            "סכום הפקדה",
                            `ניסיון להפקיד יותר ממה שיש לך. הפקדת את המזומנים הנותרים שלך: **$${depositAmount.toLocaleString()}**`
                        )
                    ],
                    flags: ["Ephemeral"],
                });
            }

            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                throw createError(
                    "Bank is full",
                    ErrorTypes.VALIDATION,
                    `הבנק שלך מלא כרגע (כושר מקסימלי: $${maxBank.toLocaleString()}). קנה **שדרוג בנק** כדי להגביל את המגבלה שלך.`,
                    { maxBank, currentBank: userData.bank, userId }
                );
            }

            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            MessageTemplates.ERRORS.INVALID_INPUT(
                                "סכום הפקדה",
                                `היה לך רק מקום ל-**$${depositAmount.toLocaleString()}** בחשבון הבנק שלך (מקסימום: $${maxBank.toLocaleString()}). השאר נשאר במזומנים שלך.`
                            )
                        ],
                        flags: ["Ephemeral"],
                    });
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "No space or cash for deposit",
                    ErrorTypes.VALIDATION,
                    "הסכום שניסיון להפקיד היה 0 או חרג מכושר הבנק שלך לאחר בדיקת יתרת המזומנים שלך.",
                    { depositAmount, availableSpace, walletBalance: userData.wallet }
                );
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "הפקדה",
                `בהצלחה הפקדת **$${depositAmount.toLocaleString()}** לבנק שלך.`
            )
                .addFields(
                    {
                        name: "💵 יתרת מזומנים חדשה",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 יתרת בנק חדשה",
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};
