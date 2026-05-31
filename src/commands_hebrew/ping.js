import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("בודק את הזמן ההפעלה של הבוט ומהירות ה-API"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`בדיקת Ping נכשלה`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            await InteractionHelper.safeEditReply(interaction, {
                content: "🔄 בדיקת זמן ההפעלה...",
            });

            const latency = Date.now() - interaction.createdTimestamp;
            const apiLatency = Math.round(interaction.client.ws.ping);

            const embed = createEmbed({ title: "🏓 פונג!", description: null }).addFields(
                { name: "⏱️ זמן הפעלה של הבוט", value: `${latency}ms`, inline: true },
                { name: "⚡ זמן הפעלה של ה-API", value: `${apiLatency}ms`, inline: true },
            );

            await InteractionHelper.safeEditReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            logger.error('שגיאה בפקודת ping:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: '❌ שגיאה בחיבור', description: 'לא ניתן להעריך זמן הפעלה כרגע.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('כשל בשליחת הודעה:', replyError);
            }
        }
    },
};