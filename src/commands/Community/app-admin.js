import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, LabelBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { 
    getApplicationSettings, 
    saveApplicationSettings, 
    getApplication, 
    getApplications, 
    updateApplication,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplication
} from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import appDashboard from './modules/app_dashboard.js';

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
        .setName("app-admin")
        .setDescription("ניהול מועמדויות לצוות")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("הגדרת מועמדות חדשה")
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("review")
                .setDescription("אישור או דחייה של מועמדות")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("מזהה המועמדות")
                        .setRequired(true),
                ),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("רשימת כל המועמדויות")
                .addStringOption((option) =>
                    option
                        .setName("status")
                        .setDescription("סינון לפי סטטוס")
                        .addChoices(
                            { name: "בהמתנה", value: "pending" },
                            { name: "התקבל", value: "approved" },
                            { name: "נדחה", value: "denied" },
                        ),
                )
                .addStringOption((option) =>
                    option.setName("role").setDescription("סינון לפי מזהה תפקיד"),
                )
                .addUserOption((option) =>
                    option.setName("user").setDescription("סינון לפי משתמש"),
                )
                .addNumberOption((option) =>
                    option
                        .setName("limit")
                        .setDescription("כמות מקסימלית להצגה (ברירת מחדל: 10)")
                        .setMinValue(1)
                        .setMaxValue(25),
                ),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("פתיחת לוח הבקרה של המועמדויות")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("בחירת מועמדות להגדרה")
                        .setRequired(false)
                        .setAutocomplete(true),
                ),
        ),

    category: "קהילה",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed("ניתן להשתמש בפקודה זו רק בשרת.")],
                flags: ["Ephemeral"],
            });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== 'dashboard' && subcommand !== 'setup') {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
        }

        logger.info(`App-admin command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        await ApplicationService.checkManagerPermission(interaction.client, guild.id, member);

        if (subcommand === "setup") {
            await handleSetup(interaction);
        } else if (subcommand === "review") {
            await handleReview(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        } else if (subcommand === "dashboard") {
            const selectedAppName = interaction.options.getString("application");
            await appDashboard.execute(interaction, null, interaction.client, selectedAppName);
        }
    }, { type: 'command', commandName: 'app-admin' })
};

async function handleSetup(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('הגדרת מועמדות חדשה');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('בחר תפקיד למועמדות');

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('לדוגמה: מנהל, מוד, מפתח')
        .setRequired(true);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('למה אתה רוצה את התפקיד הזה?');

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('מה הניסיון שלך?')
        .setRequired(false);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const roleLabel = new LabelBuilder()
        .setLabel('תפקיד למועמדות')
        .setRoleSelectMenuComponent(roleSelect);

    const appNameLabel = new LabelBuilder()
        .setLabel('שם המועמדות')
        .setTextInputComponent(appNameInput);

    const q1Label = new LabelBuilder()
        .setLabel('שאלה 1 (חובה)')
        .setTextInputComponent(q1Input);

    const q2Label = new LabelBuilder()
        .setLabel('שאלה 2 (אופציונלי)')
        .setTextInputComponent(q2Input);

    const q3Label = new LabelBuilder()
        .setLabel('שאלה 3 (אופציונלי)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(roleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        time: 15 * 60 * 1000,
        filter: (i) => i.customId === 'app_setup_modal' && i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) return;

    const appName = submitted.fields.getTextInputValue('app_name').trim();
    const selectedRoles = submitted.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles.first()?.id;

    if (!roleId) {
        return submitted.reply({
            embeds: [errorEmbed('יש לבחור תפקיד.')],
            flags: ['Ephemeral'],
        });
    }

    const questions = [
        submitted.fields.getTextInputValue('app_question_1').trim(),
        submitted.fields.getTextInputValue('app_question_2').trim(),
        submitted.fields.getTextInputValue('app_question_3').trim(),
    ].filter(Boolean);

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        return submitted.reply({
            embeds: [errorEmbed('התפקיד לא נמצא.')],
            flags: ['Ephemeral'],
        });
    }

    const existingRoles = await getApplicationRoles(interaction.client, interaction.guild.id);

    if (existingRoles.some(r => r.roleId === roleId)) {
        return submitted.reply({
            embeds: [errorEmbed('התפקיד כבר מוגדר כמועמדות.')],
            flags: ['Ephemeral'],
        });
    }

    existingRoles.push({ roleId, name: appName, enabled: true });
    await saveApplicationRoles(interaction.client, interaction.guild.id, existingRoles);

    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    if (!settings.enabled) {
        await ApplicationService.updateSettings(interaction.client, interaction.guild.id, { enabled: true });
    }

    await saveApplicationRoleSettings(interaction.client, interaction.guild.id, roleId, { questions });

    return submitted.reply({
        embeds: [successEmbed('נוצר בהצלחה', `המועמדות **${appName}** נוצרה עבור ${role}`)],
        flags: ['Ephemeral'],
    });
}

async function handleReview(interaction) {
    const appId = interaction.options.getString("id");

    const application = await getApplication(interaction.client, interaction.guild.id, appId);

    if (!application) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("המועמדות לא נמצאה.")],
            flags: ["Ephemeral"],
        });
    }

    if (application.status !== "pending") {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("המועמדות כבר טופלה.")],
            flags: ["Ephemeral"],
        });
    }

    const embed = createEmbed({
        title: "סקירת מועמדות",
        description: `**משתמש:** <@${application.userId}>\n**תפקיד:** ${application.roleName}\n**ID:** \`${appId}\``
    });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_review_approve_${appId}`).setLabel('אישור').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app_review_deny_${appId}`).setLabel('דחייה').setStyle(ButtonStyle.Danger)
    );

    return InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [buttons],
        flags: ["Ephemeral"],
    });
}

async function handleList(interaction) {
    const status = interaction.options.getString("status") || 'pending';
    const applications = await getApplications(interaction.client, interaction.guild.id, { status });

    if (!applications.length) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("לא נמצאו מועמדויות.")],
            flags: ["Ephemeral"],
        });
    }

    const embed = createEmbed({ title: "מועמדויות", description: `נמצאו ${applications.length} מועמדויות` });

    applications.forEach(app => {
        const statusView = getApplicationStatusPresentation(app.status);
        embed.addFields({
            name: `${statusView.statusEmoji} ${app.roleName}`,
            value: `ID: \`${app.id}\`\nסטטוס: ${statusView.statusLabel}`,
            inline: true
        });
    });

    return InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}

/* =========================
   REVIEW MODAL HANDLER
========================= */

export async function handleApplicationReviewModal(interaction) {
    if (!interaction.isModalSubmit()) return;

    const customId = interaction.customId;
    if (!customId.startsWith('app_review_')) return;

    const [, appId, action] = customId.split('_');
    const reason = interaction.fields.getTextInputValue('reason') || 'לא צויין סיבה.';
    const isApprove = action === 'approve';

    try {
        const application = await getApplication(interaction.client, interaction.guild.id, appId);
        if (!application) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('המועמדות לא נמצאה.')],
                flags: ['Ephemeral']
            });
        }

        const status = isApprove ? 'approved' : 'denied';

        await updateApplication(interaction.client, interaction.guild.id, appId, {
            status,
            reviewer: interaction.user.id,
            reviewMessage: reason,
            reviewedAt: new Date().toISOString()
        });

        try {
            const user = await interaction.client.users.fetch(application.userId);

            const reviewStatus = getApplicationStatusPresentation(status);

            const dmEmbed = createEmbed(
                `${reviewStatus.statusEmoji} מועמדות ${reviewStatus.statusLabel}`,
                `המועמדות שלך עבור **${application.roleName}** הייתה **${status === 'approved' ? 'אושרה' : 'נדחתה'}**.
` +
                `**הערה:** ${reason}

` +
                `ניתן לבדוק סטטוס עם \`/apply status id:${appId}\``
            );

            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            logger.error('שגיאה בשליחת הודעה למשתמש:', error);
        }

        if (application.logMessageId && application.logChannelId) {
            try {
                const logChannel = interaction.guild.channels.cache.get(application.logChannelId);

                if (logChannel) {
                    const logMessage = await logChannel.messages.fetch(application.logMessageId);

                    if (logMessage) {
                        const embed = logMessage.embeds[0];

                        if (embed) {
                            const reviewStatus = getApplicationStatusPresentation(status);

                            const newEmbed = EmbedBuilder.from(embed)
                                .setColor(isApprove ? '#00FF00' : '#FF0000')
                                .spliceFields(0, 1, {
                                    name: 'סטטוס',
                                    value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`
                                });

                            await logMessage.edit({
                                embeds: [newEmbed],
                                components: []
                            });
                        }
                    }
                }
            } catch (error) {
                logger.error('שגיאה בעדכון לוג:', error);
            }
        }

        if (isApprove) {
            try {
                const member = await interaction.guild.members.fetch(application.userId);
                await member.roles.add(application.role);
            } catch (error) {
                logger.error('שגיאה בהוספת תפקיד:', error);
            }
        }

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `${getApplicationStatusPresentation(status).statusEmoji} מועמדות ${getApplicationStatusPresentation(status).statusLabel}`,
                    `המועמדות סומנה כ-${getApplicationStatusPresentation(status).statusLabel}`
                )
            ],
            flags: ['Ephemeral']
        });

    } catch (error) {
        logger.error('שגיאה בטיפול במועמדות:', error);
        await InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('אירעה שגיאה בזמן טיפול במועמדות.')],
            flags: ['Ephemeral']
        });
    }
}


/* =========================
   חלק 2 - EXECUTE (המשך מלא)
========================= */

export default {
    data: new SlashCommandBuilder()
        .setName("app-admin")
        .setDescription("ניהול מועמדויות לצוות")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand.setName("setup").setDescription("הגדרת מועמדות חדשה")
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("review").setDescription("אישור או דחייה של מועמדות")
                .addStringOption(o => o.setName("id").setDescription("מזהה המועמדות").setRequired(true))
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("list").setDescription("רשימת כל המועמדויות")
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("dashboard").setDescription("לוח בקרה למועמדויות")
        ),

    category: "קהילה",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed("ניתן להשתמש בפקודה זו רק בשרת.")],
                flags: ["Ephemeral"],
            });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        // דיפר לטעינה
        if (subcommand !== "dashboard" && subcommand !== "setup") {
            await InteractionHelper.safeDefer(interaction, { flags: ["Ephemeral"] });
        }

        logger.info(`App-admin executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id
        });

        // בדיקת הרשאות מנהל
        await ApplicationService.checkManagerPermission(interaction.client, guild.id, member);

        // ניתוב לפונקציות
        switch (subcommand) {
            case "setup":
                return await handleSetup(interaction);

            case "review":
                return await handleReview(interaction);

            case "list":
                return await handleList(interaction);

            case "dashboard":
                const app = interaction.options.getString("application");
                return await appDashboard.execute(interaction, null, interaction.client, app);
        }
    }, { type: 'command', commandName: 'app-admin' })
};


/* =========================
   חלק 3 - HANDLE SETUP (מודל יצירת מועמדות)
========================= */

async function handleSetup(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('הגדרת מועמדות חדשה');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('בחר תפקיד למועמדות');

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('לדוגמה: מנהל / מוד / מפתח')
        .setRequired(true);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('למה אתה רוצה את התפקיד הזה?')
        .setRequired(true);

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('מה הניסיון שלך?')
        .setRequired(false);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const roleLabel = new LabelBuilder()
        .setLabel('תפקיד למועמדות')
        .setRoleSelectMenuComponent(roleSelect);

    const appNameLabel = new LabelBuilder()
        .setLabel('שם המועמדות')
        .setTextInputComponent(appNameInput);

    const q1Label = new LabelBuilder()
        .setLabel('שאלה 1 (חובה)')
        .setTextInputComponent(q1Input);

    const q2Label = new LabelBuilder()
        .setLabel('שאלה 2 (אופציונלי)')
        .setTextInputComponent(q2Input);

    const q3Label = new LabelBuilder()
        .setLabel('שאלה 3 (אופציונלי)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(roleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        time: 15 * 60 * 1000,
        filter: (i) => i.customId === 'app_setup_modal' && i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) return;

    const appName = submitted.fields.getTextInputValue('app_name').trim();
    const selectedRoles = submitted.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles.first()?.id;

    if (!roleId) {
        return submitted.reply({
            embeds: [errorEmbed('יש לבחור תפקיד.')],
            flags: ['Ephemeral'],
        });
    }

    const questions = [
        submitted.fields.getTextInputValue('app_question_1').trim(),
        submitted.fields.getTextInputValue('app_question_2').trim(),
        submitted.fields.getTextInputValue('app_question_3').trim(),
    ].filter(Boolean);

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
        return submitted.reply({
            embeds: [errorEmbed('התפקיד לא נמצא.')],
            flags: ['Ephemeral'],
        });
    }

    const existingRoles = await getApplicationRoles(interaction.client, interaction.guild.id);

    if (existingRoles.some(r => r.roleId === roleId)) {
        return submitted.reply({
            embeds: [errorEmbed('התפקיד כבר מוגדר כמועמדות.')],
            flags: ['Ephemeral'],
        });
    }

    existingRoles.push({
        roleId,
        name: appName,
        enabled: true
    });

    await saveApplicationRoles(interaction.client, interaction.guild.id, existingRoles);

    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);

    if (!settings.enabled) {
        await ApplicationService.updateSettings(interaction.client, interaction.guild.id, {
            enabled: true
        });
    }

    await saveApplicationRoleSettings(interaction.client, interaction.guild.id, roleId, {
        questions
    });

    return submitted.reply({
        embeds: [successEmbed('נוצר בהצלחה', `המועמדות **${appName}** נוצרה עבור ${role}`)],
        flags: ['Ephemeral'],
    });
}


/* =========================
   חלק 4 - HANDLE REVIEW (אישור / דחייה)
========================= */

async function handleReview(interaction) {
    const appId = interaction.options.getString("id");

    const application = await getApplication(interaction.client, interaction.guild.id, appId);

    if (!application) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("המועמדות לא נמצאה.")],
            flags: ["Ephemeral"],
        });
    }

    if (application.status !== "pending") {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("המועמדות כבר טופלה.")],
            flags: ["Ephemeral"],
        });
    }

    const embed = createEmbed({
        title: "סקירת מועמדות",
        description:
            `**משתמש:** <@${application.userId}>
` +
            `**תפקיד:** ${application.roleName}
` +
            `**ID:** \`${appId}\``
    });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_review_approve_${appId}`)
            .setLabel('אישור')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`app_review_deny_${appId}`)
            .setLabel('דחייה')
            .setStyle(ButtonStyle.Danger)
    );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [buttons],
        flags: ["Ephemeral"],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000,
        max: 1,
        filter: (i) => i.user.id === interaction.user.id
    });

    collector.on("collect", async (btn) => {
        const isApprove = btn.customId.includes("approve");

        const modal = new ModalBuilder()
            .setCustomId(`app_review_reason_${appId}_${isApprove ? "approve" : "deny"}`)
            .setTitle(isApprove ? "אישור מועמדות" : "דחיית מועמדות");

        const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("סיבה (אופציונלי)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(reasonInput)
        );

        await btn.showModal(modal);

        const submitted = await btn.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: (i) => i.customId.includes(`app_review_reason_${appId}`) && i.user.id === btn.user.id,
        }).catch(() => null);

        if (!submitted) return;

        const reason = submitted.fields.getTextInputValue("reason") || "לא צויין סיבה";
        const status = isApprove ? "approved" : "denied";

        await updateApplication(interaction.client, interaction.guild.id, appId, {
            status,
            reviewer: submitted.user.id,
            reviewMessage: reason,
            reviewedAt: new Date().toISOString()
        });

        try {
            const user = await interaction.client.users.fetch(application.userId);

            const reviewStatus = getApplicationStatusPresentation(status);

            await user.send({
                embeds: [
                    createEmbed(
                        `${reviewStatus.statusEmoji} מועמדות ${reviewStatus.statusLabel}`,
                        `המועמדות שלך עבור **${application.roleName}** ${status === "approved" ? "אושרה" : "נדחתה"}.

` +
                        `**הערה:** ${reason}`
                    )
                ]
            });
        } catch (err) {}

        if (isApprove) {
            try {
                const member = await interaction.guild.members.fetch(application.userId);
                await member.roles.add(application.role);
            } catch (err) {}
        }

        await submitted.reply({
            embeds: [
                successEmbed(
                    `המועמדות ${isApprove ? "אושרה" : "נדחתה"}`,
                    "הפעולה בוצעה בהצלחה"
                )
            ],
            flags: ["Ephemeral"]
        });
    });

    collector.on("end", async () => {
        await InteractionHelper.safeEditReply(interaction, {
            components: []
        }).catch(() => {});
    });
}



/* =========================
   חלק 5 - HANDLE LIST (רשימת מועמדויות)
========================= */

async function handleList(interaction) {
    const status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters = {};

    if (status) {
        filters.status = status;
    } else {
        filters.status = 'pending';
    }

    let applications = await getApplications(interaction.client, interaction.guild.id, filters);

    if (user) {
        applications = applications.filter(app => app.userId === user.id);
    }

    if (applications.length === 0) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("לא נמצאו מועמדויות.")],
            flags: ["Ephemeral"],
        });
    }

    applications = applications
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    const embed = createEmbed({
        title: "רשימת מועמדויות",
        description: `נמצאו ${applications.length} מועמדויות`
    });

    applications.forEach(app => {
        const statusView = getApplicationStatusPresentation(app.status);
        const date = app.createdAt ? new Date(app.createdAt).toLocaleString() : "לא ידוע";

        embed.addFields({
            name: `${statusView.statusEmoji} ${app.roleName || "לא ידוע"}`,
            value:
                `**ID:** \`${app.id}\`\n` +
                `**סטטוס:** ${statusView.statusLabel}\n` +
                `**תאריך:** ${date}`,
            inline: true
        });
    });

    return InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}

