import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('מערכת ימי הולדת')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('הגדר את יום ההולדת שלך')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('חודש הלידה (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('יום הלידה (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('צפה במידע על יום הולדת')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('המשתמש לבדיקה')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('הצג את כל ימי ההולדת בשרת')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('מחק את יום ההולדת שלך')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('הצג ימי הולדת קרובים')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('הגדר או בטל ערוץ להכרזות ימי הולדת (דורש ניהול שרת)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('ערוץ הטקסט להכרזות. השאר ריק כדי לבטל.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'set':
                    return await birthdaySet.execute(interaction, config, client);
                case 'info':
                    return await birthdayInfo.execute(interaction, config, client);
                case 'list':
                    return await birthdayList.execute(interaction, config, client);
                case 'remove':
                    return await birthdayRemove.execute(interaction, config, client);
                case 'next':
                    return await nextBirthdays.execute(interaction, config, client);
                case 'setchannel':
                    return await birthdaySetchannel.execute(interaction, config, client);
                default:
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed('Error', 'Unknown subcommand')],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error('Birthday command execution failed', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday',
                subcommand: interaction.options.getSubcommand()
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday',
                source: 'birthday_command'
            });
        }
    }
};
