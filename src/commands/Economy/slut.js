import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "שידור מצלמה", min: 120, max: 450, risk: 0.2 },
    { name: "הופעה פרטית", min: 220, max: 700, risk: 0.25 },
    { name: "מנהל מועדון לאחר השעות", min: 320, max: 900, risk: 0.3 },
    { name: "הזמנת מלווה VIP", min: 550, max: 1400, risk: 0.35 },
    { name: "שידור בלעדי", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "השידור שלך התפוצץ והטיפים זרמו.",
    "הזמנת VIP שילמה הרבה מעל הממוצע.",
    "המשמרת שלך לאחר השעות הייתה מלאה ורווחית.",
    "בקשות פרימיום עברו דרכך וההכנסה שלך קפצה.",
];

const FINE_OUTCOMES = [
    "אבטחת המקום הוציאה קנס על ציות.",
    "שביתה בהנחיות הטריגרה בעמלה של הפלטפורמה.",
    "נדגמת וצריך היה לשלם קנס.",
];

const ROBBED_OUTCOMES = [
    "טעויות על ידי קונה מזויף מחקו חלק מההכנסה שלך.",
    "הזמנה מזויפת נקיחה מחלק מהמזומנים שלך.",
    "קיבלת פיתיון על ידי חשבון הונאה והפסדת כסף.",
];

const LOSS_OUTCOMES = [
    "המופע קרס והצטרכת לכסות עלויות תפעול.",
    "שרפת תקציב על ההכנה ולא יצרת תשואה.",
    "המשמרת הלכה לצד והשאירה אותך במינוס.",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `💰 ${activity.name} - הכנסה`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `🚨 ${activity.name} - קנס`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `🕵️ ${activity.name} - נשדד`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `❌ ${activity.name} - הפסד`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('💸 קבל עבודה מסוכנת עם הכנסה או הפסד אקראי'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for slut command",
                    ErrorTypes.DATABASE,
                    "נכשל בטעינת נתוני הכלכלה שלך. אנא נסה שוב מאוחר יותר.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה צריך להמתין לפני שתוכל לעבוד שוב! נסה שוב בעוד **${Math.ceil(remainingTime / 60000)}** דקות.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);

            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.failedSluts = (userData.failedSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
                userId,
                guildId,
                activity: activity.name,
                outcomeType: outcome.type,
                amountDelta: outcome.delta,
                newWallet: userData.wallet,
                timestamp: new Date().toISOString()
            });

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **תוצאה נטו:** ${amountLabel}`,
                `💳 **יתרה נוכחית:** $${userData.wallet.toLocaleString()}`,
                `📊 **סך הכול הופעות:** ${userData.totalSluts}`,
                `💵 **סך הכול הרווח:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **סך הכול הפסד:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = createEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'success' : 'error',
                timestamp: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};
