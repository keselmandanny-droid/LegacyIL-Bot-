import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const MIN_CRIME_AMOUNT = 100;
const MAX_CRIME_AMOUNT = 2000;
const FAILURE_RATE = 0.4;
const JAIL_TIME = 2 * 60 * 60 * 1000;

const CRIME_TYPES = [
    { name: "כיס חיתוך", min: 100, max: 500, risk: 0.3 },
    { name: "פריצה", min: 300, max: 1000, risk: 0.4 },
    { name: "שוד בנק", min: 1000, max: 5000, risk: 0.6 },
    { name: "גניבת אמנות", min: 2000, max: 10000, risk: 0.7 },
    { name: "פשע סייבר", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('🔪 בצע פשע כדי להרוויח כסף (מסוכן)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('סוג פשע לביצוע')
                .setRequired(true)
                .addChoices(
                    { name: 'כיס חיתוך', value: 'pickpocketing' },
                    { name: 'פריצה', value: 'burglary' },
                    { name: 'שוד בנק', value: 'bank-heist' },
                    { name: 'גניבת אמנות', value: 'art-theft' },
                    { name: 'פשע סייבר', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `אתה בכלא לעוד ${timeLeft} דקות!`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה צריך להמתין ${timeLeft} דקות נוספות לפני ביצוע פשע אחר.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
            );

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "אנא בחר סוג פשע חוקי.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "🔪 פשע הצליח!",
                    `בהצלחה ביצעת ${crime.name} והרווחת **${amountEarned}** מטבעות!`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                const fine = Math.floor(amountEarned * 0.2);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = errorEmbed(
                    "🔪 פשע כשל!",
                    `נתפסת בזמן ניסיון ${crime.name} ונשלחת לכלא! ` +
                    `קנסת ${fine} מטבעות והינך בכלא לשעתיים.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};
