import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import {
    parseDuration,
    validatePrize,
    validateWinnerCount,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("יוצר הגרלה חדשה בערוץ שנבחר.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription("משך הזמן של ההגרלה (לדוגמה: 1h, 30m, 5d).")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("מספר הזוכים בהגרלה.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("הפרס שיוגרל.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("הערוץ שבו תישלח ההגרלה (ברירת מחדל: הערוץ הנוכחי).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {

            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'ניתן להשתמש בפקודה זו רק בתוך שרת.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "נדרשת הרשאת 'ניהול שרת' כדי ליצור הגרלה.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const durationString = interaction.options.getString("duration");
            const winnerCount = interaction.options.getInteger("winners");
            const prize = interaction.options.getString("prize");
            const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

            const durationMs = parseDuration(durationString);
            validateWinnerCount(winnerCount);
            const prizeName = validatePrize(prize);

            if (!targetChannel.isTextBased()) {
                throw new TitanBotError(
                    'Target channel is not text-based',
                    ErrorTypes.VALIDATION,
                    'הערוץ חייב להיות ערוץ טקסט.',
                    { channelId: targetChannel.id, channelType: targetChannel.type }
                );
            }

            const endTime = Date.now() + durationMs;

            const initialGiveawayData = {
                messageId: "placeholder",
                channelId: targetChannel.id,
                guildId: interaction.guildId,
                prize: prizeName,
                hostId: interaction.user.id,
                endTime: endTime,
                endsAt: endTime,
                winnerCount: winnerCount,
                participants: [],
                isEnded: false,
                ended: false,
                createdAt: new Date().toISOString()
            };

            const embed = createGiveawayEmbed(initialGiveawayData, "active");
            const row = createGiveawayButtons(false);

            const giveawayMessage = await targetChannel.send({
                content: "🎉 **הגרלה חדשה** 🎉",
                embeds: [embed],
                components: [row],
            });

            initialGiveawayData.messageId = giveawayMessage.id;
            const saved = await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

            if (!saved) {
                logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
            }

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                    data: {
                        description: `נוצרה הגרלה: ${prizeName}`,
                        channelId: targetChannel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 פרס',
                                value: prizeName,
                                inline: true
                            },
                            {
                                name: '🏆 זוכים',
                                value: winnerCount.toString(),
                                inline: true
                            },
                            {
                                name: '⏰ משך זמן',
                                value: durationString,
                                inline: true
                            },
                            {
                                name: '📍 ערוץ',
                                value: targetChannel.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway creation event:', logError);
            }

            logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        `ההגרלה התחילה! 🎉`,
                        `הגרלה חדשה על **${prizeName}** נוצרה ב-${targetChannel} ותסתיים בעוד **${durationString}**.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gcreate',
                context: 'giveaway_creation'
            });
        }
    },
};
