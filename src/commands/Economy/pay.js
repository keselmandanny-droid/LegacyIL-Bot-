import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('💸 שלם למשתמש אחר כמה מהכסף שלך')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('משתמש לתשלום')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('סכום לתשלום')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Pay command initiated`, { 
                senderId, 
                receiverId: receiver.id,
                amount,
                guildId
            });

            if (receiver.bot) {
                throw createError(
                    "Cannot pay bot",
                    ErrorTypes.VALIDATION,
                    "אתה לא יכול לשלם לבוט.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw createError(
                    "Cannot pay self",
                    ErrorTypes.VALIDATION,
                    "אתה לא יכול לשלם לעצמך.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw createError(
                    "Invalid payment amount",
                    ErrorTypes.VALIDATION,
                    "הסכום חייב להיות גדול מאפס.",
                    { amount, senderId }
                );
            }

            const [senderData, receiverData] = await Promise.all([
                getEconomyData(client, guildId, senderId),
                getEconomyData(client, guildId, receiver.id)
            ]);

            if (!senderData) {
                throw createError(
                    "Failed to load sender economy data",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה שלך. אנא נסה שוב מאוחר יותר.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw createError(
                    "Failed to load receiver economy data",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה של המקבל. אנא נסה שוב מאוחר יותר.",
                    { userId: receiver.id, guildId }
                );
            }

            
            
            const result = await EconomyService.transferMoney(
                client, 
                guildId, 
                senderId, 
                receiver.id, 
                amount
            );

            
            const updatedSenderData = await getEconomyData(client, guildId, senderId);
            const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "תשלום",
                `בהצלחה שילמת ל-**${receiver.username}** בסכום של **$${amount.toLocaleString()}**!`
            )
                .addFields(
                    {
                        name: "💳 סכום התשלום",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💵 היתרה החדשה שלך",
                        value: `$${updatedSenderData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `שולם ל-${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] Payment sent successfully`, {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: updatedSenderData.wallet,
                receiverBalance: updatedReceiverData.wallet
            });

            try {
                const receiverEmbed = createEmbed({ 
                    title: "💰 תשלום נכנס!", 
                    description: `${interaction.user.username} שילם לך **$${amount.toLocaleString()}**.` 
                }).addFields({
                    name: "המזומנים החדשים שלך",
                    value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                    logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
            }
    }, { command: 'pay' })
};
