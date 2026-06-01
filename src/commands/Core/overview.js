import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getLoggingStatus } from '../../services/loggingService.js';
import { getLevelingConfig } from '../../services/leveling.js';
import { getConfiguration as getJoinToCreateConfiguration } from '../../services/joinToCreateService.js';
import { getWelcomeConfig, getApplicationSettings } from '../../utils/database.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

function pill(enabled) {
    return enabled ? '✅ פעיל' : '❌ כבוי';
}

async function formatChannelMention(guild, id) {
    if (!id) return '`לא הוגדר`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ חסר (${id})`;
}

function formatRoleMention(guild, id) {
    if (!id) return '`לא הוגדר`';
    const role = guild.roles.cache.get(id);
    return role ? role.toString() : `⚠️ חסר (${id})`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('overview')
        .setDescription('📋 תמונת מצב לקריאה בלבד של כל סטטוסי המערכות של השרת')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const [guildConfig, loggingStatus, levelingConfig, welcomeConfig, applicationConfig, joinToCreateConfig] =
                await Promise.all([
                    getGuildConfig(client, interaction.guildId),
                    getLoggingStatus(client, interaction.guildId),
                    getLevelingConfig(client, interaction.guildId),
                    getWelcomeConfig(client, interaction.guildId),
                    getApplicationSettings(client, interaction.guildId),
                    getJoinToCreateConfiguration(client, interaction.guildId),
                ]);

            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleId = guildConfig.autoRole || welcomeConfig?.roleIds?.[0];

            // ── Channels ──────────────────────────────────────────────────────
            const [auditChannel, lifecycleChannel, transcriptChannel, reportChannel, birthdayChannel] =
                await Promise.all([
                    formatChannelMention(interaction.guild, loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId),
                    formatChannelMention(interaction.guild, guildConfig.reportChannelId),
                    formatChannelMention(interaction.guild, guildConfig.birthdayChannelId),
                ]);

            const embed = new EmbedBuilder()
                .setTitle('🖥️ תמונת מצב המערכת')
                .setDescription(`תמונת מצב לקריאה בלבד עבור **${interaction.guild.name}**. השתמש בלוח הבקרה של הפקודה הרלוונטית כדי לבצע שינויים.`)
                .setColor(getColor('primary'))
                .addFields(
                    // ── Core systems ──
                    {
                        name: '⚙️ מערכות ליבה',
                        value: [
                            `🧾 **ביומן ביקורת** — ${pill(Boolean(loggingStatus.enabled))}`,
                            `📈 **דירוג** — ${pill(Boolean(levelingConfig?.enabled))}`,
                            `👋 **ברכה בכניסה** — ${pill(Boolean(welcomeConfig?.enabled))}`,
                            `👋 **פרידה בעזיבה** — ${pill(Boolean(welcomeConfig?.goodbyeEnabled))}`,
                            `🎂 **יומולדות** — ${pill(Boolean(guildConfig.birthdayChannelId))}`,
                            `📋 **מועמדויות** — ${pill(Boolean(applicationConfig?.enabled))}`,
                            `✅ **אימות** — ${pill(verificationEnabled)}`,
                            `🤖 **אימות אוטומטי** — ${pill(autoVerifyEnabled)}`,
                            `🎧 **הצטרפות כדי ליצור** — ${pill(Boolean(joinToCreateConfig?.enabled))}`,
                            `🛡️ **תפקיד אוטומטי** — ${autoRoleId ? `✅ ${formatRoleMention(interaction.guild, autoRoleId)}` : '❌ כבוי'}`,
                        ].join('\n'),
                        inline: false,
                    },
                    // ── Channels ──
                    {
                        name: '📡 ערוצים שהוגדרו',
                        value: [
                            `**ביומן ביקורת:** ${auditChannel}`,
                            `**מחזור כרטיסים:** ${lifecycleChannel}`,
                            `**עלויות כרטיסים:** ${transcriptChannel}`,
                            `**דיווחים:** ${reportChannel}`,
                            `**יומולדות:** ${birthdayChannel}`,
                        ].join('\n'),
                        inline: false,
                    },
                    // ── Refresh stamp ──
                    {
                        name: '🕒 תמונת מצב צולמה',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true,
                    },
                )
                .setFooter({ text: 'לקריאה בלבד — הרץ /logging dashboard כדי לנהל את הגדרות הביקורת' })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('overview command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('שגיאה בתמונת מצב', 'נכשל בטעינת תמונת המצב של המערכת.')],
            });
        }
    },
};
