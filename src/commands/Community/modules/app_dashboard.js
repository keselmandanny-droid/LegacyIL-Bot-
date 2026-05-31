import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';

// ─── Embed & Menu Builders ────────────────────────────────────────────────────

function buildDashboardEmbed(settings, roles, guild) {
    const logChannel = settings.logChannelId ? `<#${settings.logChannelId}>` : '`לא הוגדר`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`אף אחד מוגדר`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`לא הוגדרו תפקידי מועמדויות`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`לא הוגדר`';

    return new EmbedBuilder()
        .setTitle('📋 לוח בקרה למועמדויות')
        .setDescription(`ניהול הגדרות המועמדויות עבור **${guild.name}**.\nבחר אפשרות להלן כדי לשנות הגדרה.`)
        .setColor(getColor('info'))
        .addFields(
            { name: '⚙️ סטטוס המערכת', value: settings.enabled ? '✅ מופעלת' : '❌ מבוטלת', inline: true },
            { name: '📢 ערוץ רישום', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🛡️ תפקידי מנהלים', value: managerRoleList, inline: false },
            { name: '📝 שאלות', value: `${questionCount} הוגדרו — ראשונה: ${firstQ}`, inline: false },
            { name: '🎭 תפקידי מועמדויות', value: roleList, inline: false },
            {
                name: '🗑️ שמירת נתונים',
                value: `בהמתנה: **${settings.pendingApplicationRetentionDays ?? 30}י** · בדוקה: **${settings.reviewedApplicationRetentionDays ?? 14}י**`,
                inline: false,
            },
        )
        .setFooter({ text: 'לוח הבקרה ייסגר לאחר 15 דקות של אי-פעילות' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('בחר הגדרה להגדרה...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('ערוץ רישום')
                .setDescription('הגדר את הערוץ שבו יירשמו המועמדויות החדשות')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('תפקידי מנהלים')
                .setDescription('הוסף או הסר תפקיד שיכול לנהל מועמדויות')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('עריכת שאלות')
                .setDescription('התאם אישית את השאלות המוצגות בטופס המועמדות')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הוסף תפקיד מועמדויות')
                .setDescription('הוסף תפקיד שחברים יכולים להגיש בקשה עבורו')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הסר תפקיד מועמדויות')
                .setDescription('הסר תפקיד מרשימת המועמדויות')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('תקופת שמירה')
                .setDescription('הגדר כמה זמן מועמדויות בהמתנה ובדוקות יישמרו')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('מועמדויות')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refreshDashboard(rootInteraction, settings, roles, guildId) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(settings, roles, rootInteraction.guild)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            // Defer immediately to prevent Discord interaction timeout
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            // Check if application system is completely unconfigured
            const isCompletelyUnconfigured = 
                !settings.logChannelId && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    'Applications system not set up',
                    ErrorTypes.CONFIGURATION,
                    'The applications system has not been configured yet. Please run `/app-admin setup` to create your first application.',
                );
            }

            // If no application roles exist, show global settings to add one
            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            // If a specific app was selected via autocomplete, show its dashboard directly
            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
                // If name doesn't match, fall through
            }

            // Default: Show first application if no selection made
            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new TitanBotError(
                `Applications dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the applications dashboard.',
            );
        }
    },
};

// ─── Application Selector (for multiple applications) ──────────────────────────

async function showApplicationSelector(interaction, roles, settings, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('בחר מועמדות להגדרה...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`הגדר את המועמדות ל-${role.name}`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('🎯 בחר מועמדות')
        .setDescription('בחר איזו מועמדות תרצה להגדיר.')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRoleId = selectInteraction.values[0];
        const selectedRole = roles.find(r => r.roleId === selectedRoleId);

        if (selectedRole) {
            await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('פג תוקף', 'לא נבחרה אפשרות. לוח הבקרה סגור.')],
                components: [],
            }).catch(() => {});
        }
    });
}

// ─── Global Dashboard ──────────────────────────────────────────────────────────

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildDashboardEmbed(settings, roles, interaction.guild)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

// ─── Application-Specific Dashboard ────────────────────────────────────────────

async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);
    
    // Get application-specific settings
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = appSettings.logChannelId || settings.logChannelId;
    const isEnabled = selectedRole.enabled !== false; // Default to true if not specified

    // Build comprehensive embed
    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`ירושה מערוץ הרישום הגלובלי`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`ירושה משאלות גלובליות`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
        : '`אף אחד מוגדר`';

    const embed = new EmbedBuilder()
        .setTitle('🎭 לוח בקרה למועמדות')
        .setDescription(`הגדרה עבור **${selectedRole.name}**`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: '🎭 תפקיד', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`, 
                inline: true 
            },
            { 
                name: '⚙️ סטטוס המועמדות', 
                value: isEnabled ? '✅ **מופעלת**' : '❌ **מבוטלת**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: '📝 שאלות', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: '📢 ערוץ רישום', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: '🛡️ תפקידי מנהלים',
                value: managerRolesDisplay,
                inline: true 
            },
            { 
                name: '🗑️ תקופת שמירה',
                value: `בהמתנה: **${settings.pendingApplicationRetentionDays ?? 30}י** · בדוקה: **${settings.reviewedApplicationRetentionDays ?? 14}י**`,
                inline: false 
            },
        )
        .setFooter({ text: 'לוח הבקרה ייסגר לאחר 10 דקות של אי-פעילות' })
        .setTimestamp();

    // Create dropdown button with customization options
    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    // Create control buttons
    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? 'בטל מועמדות' : 'הפעל מועמדות')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('מחק מועמדות')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

// ─── Collector Setup ──────────────────────────────────────────────────────────

function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            // Catch expired interactions
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'manager_role':
                    await handleManagerRole(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'role_add':
                    await handleRoleAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRoleRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Applications config validation error: ${error.message}`);
            } else {
                logger.error('Unexpected applications dashboard error:', error);
            }

            const errorMessage =
                error instanceof TitanBotError
                    ? error.userMessage || 'אירעה שגיאה בעיבוד הבחירה שלך.'
                    : 'אירעה שגיאה בעדכון ההגדרות.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await selectInteraction
                .followUp({
                    embeds: [errorEmbed('שגיאת הגדרה', errorMessage)],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 לוח בקרה פג תוקף')
                .setDescription('לוח בקרה זה סגור בגלל אי-פעילות. בחר את הפקודה שוב כדי להמשיך.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    // ── Global Toggle Button Collector ──────────────────────────────────────────
    if (!selectedRoleId) {
        const globalToggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = settings.enabled === true;
                settings.enabled = !wasEnabled;

                // Save the updated settings
                await saveApplicationSettings(interaction.client, guildId, settings);

                // Refresh dashboard to show new status
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 מועמדויות בטלו' : '🟢 מועמדויות הופעלו',
                        `מערכת המועמדויות כעת **${wasEnabled ? 'בטלה' : 'מופעלת'}**.\n\n${
                            wasEnabled 
                                ? 'חברים לא יוכלו עוד להגיש בקשות עבור תפקידים.' 
                                : 'חברים כעת יכולים להתחיל להגיש בקשות עבור תפקידים.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling global application status:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('שגיאה', 'אירעה שגיאה בהחלפת סטטוס המועמדויות.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ פג תוקף ההגדרה')
                    .setDescription('סדרת לוח בקרה זו פגה תוקף בגלל אי-פעילות (10 דקות).\n\nכדי להמשיך בהגדרת המועמדויות שלך, בחר את הפקודה שוב.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    // ── Delete Button Collector (for application-specific dashboard) ──────────────
    if (selectedRoleId) {
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            // Show confirmation modal
            const appRoleForDelete = roles.find(r => r.roleId === selectedRoleId);
            const appNameForDelete = appRoleForDelete?.name ?? 'מועמדות זו';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('אישור מחיקת מועמדות');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ אתה עומד למחוק בצורה קבועה את **${appNameForDelete}**. כל המועמדויות המאוחסנות וההגדרות עבור תפקיד זה יוסרו ולא יוכלו להשלם.`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('אני מאשר — זה לא ניתן לביטול')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('Error showing delete confirmation modal:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('שגיאה', 'נכשל בהצגת דיאלוג האישור. אנא נסה שוב.')],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await btnInteraction.followUp({
                        embeds: [errorEmbed('בוטל', 'מחיקת המועמדות בוטלה.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await confirmSubmit.reply({
                        embeds: [errorEmbed('לא אושר', 'עליך לסמן את תיבת האישור כדי למחוק את המועמדות.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                // Delete the application
                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('Error confirming application deletion:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('שגיאה', 'אירעה שגיאה במחיקת המועמדות.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ פג תוקף ההגדרה')
                    .setDescription('סדרת לוח בקרה זו פגה תוקף בגלל אי-פעילות (10 דקות).\n\nכדי להמשיך בהגדרת המועמדויות שלך, בחר את הפקודה שוב.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        // ── Toggle Enable/Disable Button Collector ──────────────────────────────
        const toggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRoleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                // Find and toggle the role
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await toggleInteraction.followUp({
                        embeds: [errorEmbed('לא נמצא', 'תפקיד המועמדויות לא נמצא.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                // Save the updated roles
                await saveApplicationRoles(interaction.client, guildId, roles);

                // Refresh dashboard to show new status
                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 מועמדות בטלה' : '🟢 מועמדות הופעלה',
                        `מועמדות **${updatedRole.name}** כעת **${wasEnabled ? 'בטלה' : 'מופעלת'}**.\n\n${
                            wasEnabled 
                                ? 'מועמדות זו לא תופיע עוד באפשרויות `/apply submit`.' 
                                : 'מועמדות זו תופיע כעת באפשרויות `/apply submit`.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling application status:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('שגיאה', 'אירעה שגיאה בהחלפת סטטוס המועמדויות.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ פג תוקף ההגדרה')
                    .setDescription('סדרת לוח בקרה זו פגה תוקף בגלל אי-פעילות (10 דקות).\n\nכדי להמשיך בהגדרת המועמדויות שלך, בחר את הפקודה שוב.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

// ─── Build Select Menus ────────────────────────────────────────────────────────

function buildApplicationSelectMenu(guildId, roleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('בחר הגדרה להגדרה...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('ערוץ רישום')
                .setDescription('הגדר את הערוץ שבו מועמדויות מועברות')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('תפקידי מנהלים')
                .setDescription('הוסף או הסר תפקיד שיכול לנהל מועמדויות')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('עריכת שאלות')
                .setDescription('התאם אישית את השאלות המוצגות בטופס המועמדות')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('תקופת שמירה')
                .setDescription('הגדר כמה זמן מועמדויות בהמתנה ובדוקות יישמרו')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

// ─── Log Channel ──────────────────────────────────────────────────────────────

async function handleLogChannel(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    const deferred = await safeDeferInteraction(selectInteraction);
    if (!deferred) return;

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('app_cfg_log_channel')
        .setPlaceholder('בחר ערוץ טקסט...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    let currentChannel = settings.logChannelId;
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📢 ערוץ רישום')
                .setDescription(
                    `**נוכחי:** ${currentChannel ? `<#${currentChannel}>` : '`לא הוגדר`'}\n\nבחר את הערוץ שבו הגשות מועמדויות חדשות יירשמו.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'app_cfg_log_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        const deferred = await safeDeferInteraction(chanInteraction);
        if (!deferred) return;
        
        const channel = chanInteraction.channels.first();

        if (!channel.isTextBased()) {
            await chanInteraction.followUp({
                embeds: [errorEmbed('ערוץ לא חוקי', 'בחר ערוץ טקסט.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (selectedRoleId) {
            // Save per-application log channel
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channel.id;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
            // Save global log channel
            settings.logChannelId = channel.id;
            await saveApplicationSettings(client, guildId, settings);
        }

        await chanInteraction.followUp({
            embeds: [successEmbed('✅ ערוץ רישום עודכן', `הגשות מועמדויות יירשמו כעת ב-${channel}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction.followUp({
                embeds: [errorEmbed('פג תוקף', 'לא נבחר ערוץ. ההגדרה לא שונתה.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

// ─── Manager Role ─────────────────────────────────────────────────────────────

async function handleManagerRole(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const deferred = await safeDeferInteraction(selectInteraction);
    if (!deferred) return;

    const currentRoles = settings.managerRoles ?? [];
    const currentList =
        currentRoles.length > 0 ? currentRoles.map(id => `<@&${id}>`).join(', ') : '`אף אחד`';

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('app_cfg_manager_role')
        .setPlaceholder('בחר תפקיד להוספה או הסרה...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🛡️ תפקידי מנהלים')
                .setDescription(
                    `**נוכחי:** ${currentList}\n\nבחר תפקיד ל**החלף** — בחירת תפקיד מנהל קיים תסירו, בחירת חדש תוסיפו.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'app_cfg_manager_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        const deferred = await safeDeferInteraction(roleInteraction);
        if (!deferred) return;
        
        const role = roleInteraction.roles.first();
        const roleSet = new Set(settings.managerRoles ?? []);
        const wasPresent = roleSet.has(role.id);

        if (wasPresent) {
            roleSet.delete(role.id);
        } else {
            roleSet.add(role.id);
        }

        settings.managerRoles = Array.from(roleSet);
        await saveApplicationSettings(client, guildId, settings);

        await roleInteraction.followUp({
            embeds: [
                successEmbed(
                    '✅ תפקיד מנהל עודכן',
                    `${role} **${wasPresent ? 'הוסר מ' : 'נוסף ל'}** רשימת תפקידי המנהלים.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction.followUp({
                embeds: [errorEmbed('פג תוקף', 'לא נבחר תפקיד. ההגדרה לא שונתה.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

// ─── Edit Questions ───────────────────────────────────────────────────────────

async function handleQuestions(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentQuestions = settings.questions ?? [];
    
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentQuestions = roleSettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('עריכת שאלות המועמדות')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('שאלה 1 (חובה)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('שאלה 2 (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('שאלה 3 (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('שאלה 4 (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('שאלה 5 (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await submitted.reply({
            embeds: [errorEmbed('אין שאלות', 'נדרשת לפחות שאלה אחת.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (selectedRoleId) {
        // Save per-application questions
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
        // Save global questions
        settings.questions = newQuestions;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ שאלות עודכנו',
                `${newQuestions.length} שאלה${newQuestions.length !== 1 ? 'ות' : ''} נשמרו.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId);
}

// ─── Add Application Role ─────────────────────────────────────────────────────

async function handleRoleAdd(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const deferred = await safeDeferInteraction(selectInteraction);
    if (!deferred) return;

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('app_cfg_role_add_pick')
        .setPlaceholder('בחר את תפקיד Discord להוספה...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➕ הוסף תפקיד מועמדויות')
                .setDescription(
                    'בחר תפקיד שחברים יכולים להגיש בקשה עבורו. ניתן לקבוע שם תצוגה מותאם אחרי הבחירה.',
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'app_cfg_role_add_pick',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        const role = roleInteraction.roles.first();

        // Check for duplicate
        if (roles.some(r => r.roleId === role.id)) {
            const deferred = await safeDeferInteraction(roleInteraction);
            if (!deferred) return;
            
            await roleInteraction.followUp({
                embeds: [errorEmbed('כבר נוסף', `${role} כבר תפקיד מועמדויות.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Show modal for optional custom name
        const nameModal = new ModalBuilder()
            .setCustomId('app_cfg_role_add_name')
            .setTitle('שם תפקיד המועמדות')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('role_name')
                        .setLabel('שם תצוגה (השאר ריק כדי להשתמש בשם התפקיד)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(role.name)
                        .setMaxLength(50)
                        .setRequired(false),
                ),
            );

        await roleInteraction.showModal(nameModal);

        const nameSubmit = await roleInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'app_cfg_role_add_name' && i.user.id === roleInteraction.user.id,
                time: 60_000,
            })
            .catch(() => null);

        if (!nameSubmit) return;

        const customName = nameSubmit.fields.getTextInputValue('role_name').trim() || role.name;

        roles.push({ roleId: role.id, name: customName });
        await saveApplicationRoles(client, guildId, roles);

        await nameSubmit.reply({
            embeds: [
                successEmbed(
                    '✅ תפקיד נוסף',
                    `${role} נוסף כתפקיד מועמדויות עם שם **${customName}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction.followUp({
                embeds: [errorEmbed('פג תוקף', 'לא נבחר תפקיד. כלום לא נוסף.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

// ─── Remove Application Role ──────────────────────────────────────────────────

async function handleRoleRemove(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const deferred = await safeDeferInteraction(selectInteraction);
    if (!deferred) return;

    if (roles.length === 0) {
        await selectInteraction.followUp({
            embeds: [errorEmbed('אין תפקידים', 'אין תפקידי מועמדויות מוגדרים להסרה.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('app_cfg_role_remove_pick')
        .setPlaceholder('בחר את התפקיד להסרה...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➖ הסר תפקיד מועמדויות')
                .setDescription(
                    `**תפקידים נוכחיים:** ${roles.map(r => `<@&${r.roleId}> (${r.name})`).join(', ')}\n\nבחר את התפקיד להסרה מרשימת המועמדויות.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'app_cfg_role_remove_pick',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        const deferred = await safeDeferInteraction(roleInteraction);
        if (!deferred) return;
        
        const role = roleInteraction.roles.first();
        const index = roles.findIndex(r => r.roleId === role.id);

        if (index === -1) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('לא נמצא', `${role} לא ברשימת תפקידי המועמדויות.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRoles(client, guildId, roles);

        await roleInteraction.followUp({
            embeds: [successEmbed('✅ תפקיד הוסר', `${role} הוסר מתפקידי המועמדויות.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction.followUp({
                embeds: [errorEmbed('פג תוקף', 'לא נבחר תפקיד. כלום לא הוסר.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

// ─── Retention Period ─────────────────────────────────────────────────────────

async function handleRetention(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('תקופות שמירה של מועמדויות');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**בהמתנה** — כמה זמן מועמדויות ללא תשובה/בתהליך נשמרות לפני הסרה אוטומטית.\n' +
            '**בדוקה** — כמה זמן מועמדויות אושרות או נדחות נשמרות.\n' +
            '-# הכנס מספר שלם בין 1 ל-3650 (מקסימום 10 שנים).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('שמירה בהמתנה (ימים)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('שמירה בדוקה (ימים)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await submitted.reply({
            embeds: [errorEmbed('ערך לא חוקי', 'שמירה בהמתנה חייבת להיות מספר שלם בין **1** ל-**3650** ימים.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await submitted.reply({
            embeds: [errorEmbed('ערך לא חוקי', 'שמירה בדוקה חייבת להיות מספר שלם בין **1** ל-**3650** ימים.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    settings.pendingApplicationRetentionDays = pendingDays;
    settings.reviewedApplicationRetentionDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ שמירה עודכנה',
                `מועמדויות בהמתנה יישמרו למשך **${pendingDays} ימים**.\nמועמדויות בדוקות יישמרו למשך **${reviewedDays} ימים**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId);
}

// ─── Delete Application ───────────────────────────────────────────────────────

async function handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client) {
    try {
        // Find the application in the roles array
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await confirmSubmit.reply({
                embeds: [errorEmbed('לא נמצא', 'תפקיד המועמדויות לא נמצא.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deletedRole = roles[roleIndex];

        // Remove from roles array
        roles.splice(roleIndex, 1);

        // Save updated roles list
        await saveApplicationRoles(client, guildId, roles);

        // Delete per-application settings
        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        // Get all applications for this guild and find ones with this roleId
        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        // Delete each application
        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        // Send success message
        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ מועמדות נמחקה',
                    `המועמדות עבור <@&${selectedRoleId}> (**${deletedRole.name}**) נמחקה לחלוטין.\n\n` +
                    `נמחקו: **${applicationsToDelete.length}** מועמדות${applicationsToDelete.length !== 1 ? '' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('Error in handleDeleteApplication:', error);
        await confirmSubmit.reply({
            embeds: [errorEmbed('שגיאה', 'אירעה שגיאה במחיקת המועמדות. אנא נסה שוב.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}
