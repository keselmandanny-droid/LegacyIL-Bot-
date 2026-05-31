import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';

    const statusLabel =
        normalized === 'pending' ? 'בתהליך' :
        normalized === 'approved' ? 'התקבל' :
        normalized === 'denied' ? 'נדחה' :
        'לא ידוע';

    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("🎯 הגשת מועמדויות, בדיקת סטטוס וצפייה בתפקידים זמינים")

        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("📝 הגש מועמדות לתפקיד בשרת")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("בחר את המועמדות שברצונך להגיש")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("📊 בדוק את סטטוס המועמדויות שלך")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("מזהה מועמדות (השאר ריק כדי לראות את כל המועמדויות)")
                        .setRequired(false),
                ),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("📋 הצג את כל המועמדויות הזמינות בשרת"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed("ניתן להשתמש בפקודה זו רק בשרת.")],
                flags: ["Ephemeral"],
            });
        }

        const { options, guild } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "submit") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const settings = await getApplicationSettings(interaction.client, guild.id);

        if (!settings.enabled) {
            throw createError(
                'מערכת מועמדויות כבויה',
                ErrorTypes.CONFIGURATION,
                'מערכת המועמדויות כבויה בשרת זה כרגע.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
};
export async function handleApplicationModal(interaction) {
    if (!interaction.isModalSubmit()) return;

    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;

    const roleId = customId.split('_')[2];

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);

    if (!applicationRole) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('הגדרות המועמדות לא נמצאו.')],
            flags: ["Ephemeral"]
        });
    }

    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('התפקיד לא נמצא.')],
            flags: ["Ephemeral"]
        });
    }

    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);

    let questions = settings.questions || ["למה אתה רוצה את התפקיד הזה?", "מה הניסיון שלך?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }

    try {
        const application = await ApplicationService.submitApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });

        const embed = successEmbed(
            'המועמדות נשלחה בהצלחה',
            `המועמדות שלך עבור **${applicationRole.name}** נשלחה בהצלחה!\n\n` +
            `מזהה מועמדות: \`${application.id}\`\n` +
            `ניתן לבדוק סטטוס עם \`/apply status id:${application.id}\``
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });

        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);

        const logChannelId = roleSettings.logChannelId || settings.logChannelId;

        if (logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(logChannelId);

            if (logChannel) {
                const logEmbed = createEmbed({
                    title: '📝 מועמדות חדשה',
                    description:
                        `**משתמש:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                        `**מועמדות:** ${applicationRole.name}\n` +
                        `**תפקיד:** ${role.name}\n` +
                        `**מזהה מועמדות:** \`${application.id}\`\n` +
                        `**סטטוס:** 🟡 בתהליך`
                }).setColor(getColor('warning'));

                const logMessage = await logChannel.send({ embeds: [logEmbed] });

                await updateApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId: logChannelId
                });
            }
        }

    } catch (error) {
        logger.error('Error creating application:', {
            error: error.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            roleId,
            stack: error.stack
        });

        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}
async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);

        if (applicationRoles.length === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("אין מועמדויות זמינות כרגע.")],
            });
        }

        const embed = createEmbed({
            title: "מועמדויות זמינות",
            description: "הנה התפקידים שניתן להגיש אליהם מועמדות:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);

            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value:
                    `**תפקיד:** ${role ? `<@&${appRole.roleId}>` : 'תפקיד לא נמצא'}\n` +
                    `**להגשה:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "השתמש ב־/apply submit כדי להגיש מועמדות."
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

    } catch (error) {
        logger.error('Error listing applications:', {
            error: error.message,
            guildId: interaction.guild.id,
            stack: error.stack
        });

        throw createError(
            'טעינת מועמדויות נכשלה',
            ErrorTypes.DATABASE,
            'לא הצלחנו לטעון את המועמדויות. נסה שוב מאוחר יותר.',
            { guildId: interaction.guild.id }
        );
    }
}
async function handleSubmit(interaction, settings) {
    const applicationName = interaction.options.getString("application");

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);

    const applicationRole = applicationRoles.find(appRole =>
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    "המועמדות לא נמצאה.",
                    "השתמש ב־/apply list כדי לראות מועמדויות זמינות."
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );

    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    "כבר יש לך מועמדות בתהליך. המתן לבדיקה."
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);

    if (!role) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('התפקיד של המועמדות כבר לא קיים.')],
            flags: ["Ephemeral"]
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`מועמדות עבור ${applicationRole.name}`);

    let questions = settings.questions || ["למה אתה רוצה את התפקיד הזה?", "מה הניסיון שלך?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, applicationRole.roleId);

    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}
async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "המועמדות לא נמצאה או שאין לך הרשאה לצפות בה."
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleString()
            : 'תאריך לא ידוע';

        const statusView = getApplicationStatusPresentation(application.status);

        const embed = createEmbed({
            title: `מועמדות #${application.id} - ${application.roleName || 'תפקיד לא ידוע'}`,
            description:
                `**מזהה מועמדות:** \`${application.id}\`\n` +
                `**סטטוס:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**נשלח בתאריך:** ${submittedAtDisplay}`
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }

    const applications = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );

    if (applications.length === 0) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed("עוד לא הגשת מועמדויות.")
            ],
            flags: ["Ephemeral"],
        });
    }

    const recentApplications = applications
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 10);

    const embed = createEmbed({
        title: "המועמדויות שלך",
        description: `מציג ${recentApplications.length} מועמדויות אחרונות.`
    });

    recentApplications.forEach((application) => {
        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;

        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleDateString()
            : 'תאריך לא ידוע';

        const statusView = getApplicationStatusPresentation(application.status);

        embed.addFields({
            name: `${statusView.statusEmoji} ${application.roleName || 'תפקיד לא ידוע'} (${statusView.statusLabel})`,
            value:
                `**מזהה:** \`${application.id}\`\n` +
                `**סטטוס:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**נשלח:** ${submittedAtDisplay}`,
            inline: true,
        });
    });

    if (applications.length > recentApplications.length) {
        embed.setFooter({
            text: `מציג ${recentApplications.length} מתוך ${applications.length} מועמדויות.`
        });
    }

    return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
}
