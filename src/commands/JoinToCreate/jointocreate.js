import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';


export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("ניהול מערכת ערוצי הקול 'הצטרף כדי ליצור'.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("הגדרת ערוץ קול חדש של 'הצטרף כדי ליצור'.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("הקטגוריה שבה ייווצר הערוץ.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("בחר תבנית לשמות ערוצי הקול הזמניים.")
                        .addChoices(
                            { name: "החדר של {username} (ברירת מחדל)", value: "{username}'s Room" },
                            { name: "הערוץ של {username}", value: "{username}'s Channel" },
                            { name: "הטרקלין של {username}", value: "{username}'s Lounge" },
                            { name: "המרחב של {username}", value: "{username}'s Space" },
                            { name: "החדר של {displayName}", value: "{displayName}'s Room" },
                            { name: "ערוץ הקול של {username}", value: "{username}'s VC" },
                            { name: "🎵 חדר המוזיקה של {username}", value: "🎵 {username}'s Music Room" },
                            { name: "🎮 חדר הגיימינג של {username}", value: "🎮 {username}'s Gaming Room" },
                            { name: "💬 חדר הצ'אט של {username}", value: "💬 {username}'s Chat Room" },
                            { name: "החדר הפרטי של {username}", value: "{username}'s Private Room" }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("מספר המשתמשים המרבי בערוצים זמניים. (0 = ללא הגבלה)")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("קצב סיביות לערוצים זמניים ב-kbps (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("הגדרת מערכת 'הצטרף כדי ליצור' קיימת.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("ערוץ ההפעלה של 'הצטרף כדי ליצור' שברצונך להגדיר.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'נדרשת לך הרשאת **ניהול שרת** כדי להשתמש בפקודה זו.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'אירעה שגיאה בעת ביצוע הפקודה.';
                
                if (error instanceof TitanBotError) {
                    errorMessage = error.userMessage || 'אירעה שגיאה. נסה שוב.';
                    logger.debug(`TitanBotError [${error.type}]: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in jointocreate command:', error);
                    errorMessage = 'אירעה שגיאה בלתי צפויה. נסה שוב או פנה לתמיכה.';
                }

                const errorEmbedObj = errorEmbed("⚠️ שגיאה", errorMessage);

                if (interaction.deferred) {
                    return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbedObj] });
                } else {
                    return await InteractionHelper.safeReply(interaction, { embeds: [errorEmbedObj], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        logger.debug(`Setting up Join to Create in guild ${guildId} with template: ${nameTemplate}`);

        // Check if guild already has a Join to Create channel configured
        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Cleaning up stale JTC trigger ${staleChannelId} from guild ${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `בשרת זה כבר מוגדר ערוץ 'הצטרף כדי ליצור': ${primaryTrigger}\n\nהשתמש ב-\`/jointocreate dashboard\` כדי לשנות אותו, או הסר אותו תחילה לפני יצירת ערוץ חדש.`;

                throw new TitanBotError(
                    'Guild already has a Join to Create channel',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        // Create the trigger channel
        logger.debug('Creating Join to Create trigger channel...');
        let triggerChannel = await interaction.guild.channels.create({
            name: 'Join to Create',
            type: ChannelType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Created trigger channel ${triggerChannel.id}, initializing config...`);

        // Initialize the Join to Create configuration
        const config = await initializeJoinToCreate(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Initialized Join to Create', {
            channelId: triggerChannel.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.info(`Successfully created Join to Create system in guild ${guildId}`);

        const responseEmbed = successEmbed(
            '✅ ההגדרה הושלמה',
            `נוצר ערוץ 'הצטרף כדי ליצור': ${triggerChannel}\n\n` +
            `**הגדרות:**\n` +
            `• תבנית: \`${nameTemplate}\`\n` +
            `• מגבלת משתמשים: ${userLimit === 0 ? 'ללא הגבלה' : userLimit + ' משתמשים'}\n` +
            `• קצב סיביות: ${bitrate} kbps\n` +
            `${category ? `• קטגוריה: ${category.name}` : '• קטגוריה: רמת השורש'}`
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [responseEmbed] });

    } catch (error) {
        logger.error('Error in handleSetupSubcommand:', error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Setup failed: ${error.message}`,
            ErrorTypes.DISCORD_API,
            "הגדרת מערכת 'הצטרף כדי ליצור' נכשלה. אנא בדוק את הרשאות הבוט."
        );
    }
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        // Validate that the channel is actually a Join to Create trigger
        const currentConfig = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        
        const configEmbed = new EmbedBuilder()
            .setTitle("⚙️ הגדרות 'הצטרף כדי ליצור'")
            .setDescription(`הגדרות עבור ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: '📝 תבנית שם הערוץ',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },
                {
                    name: '👥 מגבלת משתמשים',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'ללא הגבלה' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' משתמשים'}`,
                    inline: true
                },
                {
                    name: '🎵 קצב סיביות',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'השתמש בכפתורים שלמטה כדי לשנות הגדרות • נתמך ערוץ הפעלה אחד בלבד לכל שרת' })
            .setTimestamp();

        
        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 תבנית שם')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 מגבלת משתמשים')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 קצב סיביות')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
            .setLabel('🗑️ הסרת ערוץ')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(nameButton, limitButton, bitrateButton, deleteButton);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.createMessageComponentCollector !== 'function') {
            throw new TitanBotError(
                'Failed to fetch interaction reply for collector setup',
                ErrorTypes.DISCORD_API,
                'פתיחת לוח הבקרה נכשלה. אנא הפעל שוב את `/jointocreate dashboard`.'
            );
        }

        
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ נדרשת לך הרשאת **ניהול שרת** כדי להשתמש בבקרות אלו.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_delete_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof TitanBotError
                    ? error.userMessage || 'אירעה שגיאה.'
                    : 'אירעה שגיאה בעת עיבוד הבקשה שלך.';

                if (error instanceof TitanBotError) {
                    logger.debug(`Button interaction validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in config button interaction:', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                deleteButton.setDisabled(true)
            );

            message.edit({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'תוקף מפגש ההגדרה פג. הפעל את הפקודה שוב כדי לבצע שינויים.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Config failed: ${error.message}`,
            ErrorTypes.DATABASE,
            'טעינת ההגדרות נכשלה.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "החדר של {username} (ברירת מחדל)", value: "{username}'s Room" },
            { label: "הערוץ של {username}",        value: "{username}'s Channel" },
            { label: "הטרקלין של {username}",         value: "{username}'s Lounge" },
            { label: "המרחב של {username}",          value: "{username}'s Space" },
            { label: "החדר של {displayName}",        value: "{displayName}'s Room" },
            { label: "ערוץ הקול של {username}",             value: "{username}'s VC" },
            { label: "🎵 חדר המוזיקה של {username}",  value: "🎵 {username}'s Music Room" },
            { label: "🎮 חדר הגיימינג של {username}", value: "🎮 {username}'s Gaming Room" },
            { label: "💬 חדר הצ'אט של {username}",   value: "💬 {username}'s Chat Room" },
            { label: "החדר הפרטי של {username}",   value: "{username}'s Private Room" },
        ];

        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "{username}'s Room";

        const templateSelect = new StringSelectMenuBuilder()
            .setCustomId('template')
            .setPlaceholder('בחר תבנית שם...')
            .setOptions(
                TEMPLATE_OPTIONS.map(o => ({
                    label: o.label,
                    value: o.value,
                    default: o.value === currentTemplate,
                })),
            );

        const templateLabel = new LabelBuilder()
            .setLabel('תבנית שם הערוץ')
            .setStringSelectMenuComponent(templateSelect);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
            .setTitle('תבנית שם הערוץ')
            .addLabelComponents(templateLabel);

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_name_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        // Recheck permissions
        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ נדרשת לך הרשאת **ניהול שרת** כדי לשנות הגדרות אלו.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            nameTemplate: newTemplate
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated channel name template', {
            channelId: triggerChannel.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [successEmbed('✅ עודכן', `תבנית שם הערוץ שונתה ל-\`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in name template modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'אירעה שגיאה בעת עדכון התבנית.'
        );
    }
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentLimit = currentConfig.channelConfig.userLimit ?? currentConfig.userLimit ?? 0;

        const modal = new ModalBuilder()
            .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
            .setTitle('הגדרת מגבלת משתמשים')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('user_limit')
                        .setLabel('הזן מגבלת משתמשים (0-99, 0 = ללא הגבלה)')
                        .setPlaceholder('הזן מספר בין 0 ל-99')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(2)
                        .setValue(currentLimit.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_limit_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        // Recheck permissions
        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ נדרשת לך הרשאת **ניהול שרת** כדי לשנות הגדרות אלו.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            userLimit: parseInt(userInput)
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated user limit', {
            channelId: triggerChannel.id,
            userLimit: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('✅ עודכן', `מגבלת המשתמשים שונתה ל-${parseInt(userInput) === 0 ? 'ללא הגבלה' : parseInt(userInput) + ' משתמשים'}`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in user limit modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'אירעה שגיאה בעת עדכון מגבלת המשתמשים.'
        );
    }
}

async function handleBitrateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentBitrate = ((currentConfig.channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_bitrate_modal_${triggerChannel.id}`)
            .setTitle('הגדרת קצב סיביות')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bitrate')
                        .setLabel('הזן קצב סיביות ב-kbps (8-384)')
                        .setPlaceholder('הזן מספר בין 8 ל-384')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(3)
                        .setValue(currentBitrate.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_bitrate_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        // Recheck permissions
        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ נדרשת לך הרשאת **ניהול שרת** כדי לשנות הגדרות אלו.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            bitrate: parseInt(userInput) * 1000
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated bitrate', {
            channelId: triggerChannel.id,
            bitrate: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('✅ עודכן', `קצב הסיביות שונה ל-${parseInt(userInput)} kbps`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in bitrate modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'אירעה שגיאה בעת עדכון קצב הסיביות.'
        );
    }
}


async function handleChannelDeletion(interaction, triggerChannel, currentConfig, client) {
    try {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_delete_confirm_${triggerChannel.id}`)
                .setLabel('🗑️ כן, הסר')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_delete_cancel_${triggerChannel.id}`)
                .setLabel('❌ ביטול')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('⚠️ אישור הסרה', `האם אתה בטוח שברצונך להסיר את **${triggerChannel.name}** ממערכת 'הצטרף כדי ליצור'?\n\nלא ניתן לבטל פעולה זו.`)],
            components: [confirmRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const deleteCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && 
                          (i.customId === `jtc_delete_confirm_${triggerChannel.id}` || 
                           i.customId === `jtc_delete_cancel_${triggerChannel.id}`),
            time: 600_000,
            max: 1
        });

        deleteCollector.on('collect', async (buttonInteraction) => {
            try {
                // Recheck permissions
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ נדרשת לך הרשאת **ניהול שרת** כדי להסיר ערוצים.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_delete_confirm_${triggerChannel.id}`) {
                    
                    await removeTriggerChannel(client, interaction.guild.id, triggerChannel.id);

                    
                    await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Removed Join to Create trigger', {
                        channelId: triggerChannel.id,
                        channelName: triggerChannel.name
                    });

                    
                    try {
                        if (triggerChannel.members.size === 0) {
                            await triggerChannel.delete('Join to Create trigger removed by administrator');
                        }
                    } catch (deleteError) {
                        logger.warn(`Could not delete channel ${triggerChannel.id}: ${deleteError.message}`);
                        
                    }

                    await buttonInteraction.update({
                        embeds: [successEmbed('✅ הוסר', `**${triggerChannel.name}** הוסר ממערכת 'הצטרף כדי ליצור'.`)],
                        components: []
                    });

                } else {
                    await buttonInteraction.update({
                        embeds: [successEmbed('✅ בוטל', 'הסרת הערוץ בוטלה.')],
                        components: []
                    });
                }
            } catch (collectError) {
                logger.error('Error handling delete confirmation:', collectError);
                await buttonInteraction.reply({
                    content: '❌ אירעה שגיאה בעת עיבוד הבקשה שלך.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        deleteCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                message.edit({ components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in handleChannelDeletion:', error);
        throw new TitanBotError(
            `Deletion error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'אירעה שגיאה בעת הסרת הערוץ.'
        );
    }
}
