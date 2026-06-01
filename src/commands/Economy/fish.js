import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'בס', emoji: '🐟', rarity: 'common' },
    { name: 'סלמון', emoji: '🐟', rarity: 'common' },
    { name: 'פורל', emoji: '🐟', rarity: 'common' },
    { name: 'טונה', emoji: '🐟', rarity: 'uncommon' },
    { name: 'דג חרב', emoji: '🐟', rarity: 'uncommon' },
    { name: 'תמנון', emoji: '🐙', rarity: 'rare' },
    { name: 'לוביסטר', emoji: '🦞', rarity: 'rare' },
    { name: 'כריש', emoji: '🦈', rarity: 'epic' },
    { name: 'לווייתן', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "אתה משליך את חכת דיגך למים הבהירים...",
    "אתה מחכה בסבלנות כשהשוקע שלך צף...",
    "אחרי כמה דקות של המתנה, אתה מרגיש משיכה...",
    "המים רוטטים כי משהו לוקח את הזימה שלך...",
    "אתה משתוך את הדיג שלך בדיוק מומחה...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('🎣 לך דיג כדי ללכוד דגים והרוויח כסף'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה עייף מדי לדוג כרגע. תנוח למשך **${hours}h ${minutes}m** לפני דיג שוב.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            
            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            
            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **בונוס מוט דיג: +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const embed = createEmbed({
                title: '🎣 הצלחת דיג!',
                description: `${catchMessage}\n\nתפסת **${fishCaught.emoji} ${fishCaught.name}**! מכרת אותו ב-**$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "💵 יתרת מזומנים חדשה",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🐟 נדירות",
                        value: fishCaught.rarity === 'common' ? 'נפוץ' : 
                               fishCaught.rarity === 'uncommon' ? 'נדיר' :
                               fishCaught.rarity === 'rare' ? 'ממש נדיר' :
                               fishCaught.rarity === 'epic' ? 'אפי' :
                               'אגדה',
                        inline: true,
                    }
                )
                .setFooter({ text: `טיול דיג הבא זמין בעוד 45 דקות.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
