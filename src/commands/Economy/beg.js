import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = 50;
const MAX_WIN = 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('🙏 בקש סכום קטן של כסף'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה שלך. אנא נסה שוב מאוחר יותר.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} דקה(ות)` : `${seconds} שנייה(ות)`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה עייף מבקשת! נסה שוב בעוד **${timeMessage}**.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `זר טוב לב הטיל **$${amountWon.toLocaleString()}** לגביע שלך.`,
                    `ראית ארנק שנשכח! אתה תופס **$${amountWon.toLocaleString()}** ובורח.`,
                    `מישהו התחמל עליך ונתן לך **$${amountWon.toLocaleString()}**!`,
                    `מצאת **$${amountWon.toLocaleString()}** מתחת לספסל בפארק.`,
                ];

                replyEmbed = MessageTemplates.SUCCESS.DATA_UPDATED(
                    "בקשה",
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "המשטרה רדפה אותך. לא קיבלת כלום.",
                    "מישהו צעק, 'קח משרה!' והלך הלאה.",
                    "סנאי גנב את המטבע היחיד שהיה לך.",
                    "ניסית לבקש, אבל הלחץ היה גדול מדי ואתה ויתרת.",
                ];

                replyEmbed = MessageTemplates.ERRORS.INSUFFICIENT_FUNDS(
                    "כלום",
                    "נכשלת בהשגת כסף כלשהו מבקשת."
                );
                replyEmbed.data.description = failMessages[Math.floor(Math.random() * failMessages.length)];
            }

            userData.wallet = newCash;
userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};
