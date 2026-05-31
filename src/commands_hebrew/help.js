import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 כל הפקודות",
            description: "צפה בכל הפקודות הזמינות עם עימוד",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}",
                description: `צפה בפקודות בקטגוריית ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "בוט";
    const embed = createEmbed({ 
        title: `🤖 ${botName} מרכז עזרה`,
        description: "בן לוויה משלם ל-Discord שלך למודרציה, כלכלה, כיף וניהול שרתים.",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **מודרציה**",
            value: "מודרציה של שרתים, ניהול משתמשים וכלים אכיפה",
            inline: true
        },
        {
            name: "💰 **כלכלה**",
            value: "מערכת מטבע, חנויות וכלכלה וירטואלית",
            inline: true
        },
        {
            name: "🎮 **כיף**",
            value: "משחקים, בידור ופקודות אינטראקטיביות",
            inline: true
        },
        {
            name: "📊 **דרגות**",
            value: "רמות משתמשים, מערכת XP וטיפול בהתקדמות",
            inline: true
        },
        {
            name: "🎫 **כרטיסים**",
            value: "מערכת כרטיסי תמיכה לניהול שרתים",
            inline: true
        },
        {
            name: "🎉 **הגרלות**",
            value: "ניהול הגרלות אוטומטי והפצה",
            inline: true
        },
        {
            name: "👋 **ברוכים הבאים**",
            value: "הודעות קבלת חברים וביילוט",
            inline: true
        },
        {
            name: "🎂 **ימי הולדת**",
            value: "מעקב ימי הולדת ותכונות חגיגה",
            inline: true
        },
        {
            name: "👥 **קהילה**",
            value: "כלים בקהילה, יישומים והתקשרות חברים",
            inline: true
        },
        {
            name: "⚙️ **הגדרות**",
            value: "פקודות הגדרה של שרת וביט",
            inline: true
        },
        {
            name: "🔢 **דלפקים**",
            value: "הגדרת ערוץ דלפק חי וניהול דלפקים",
            inline: true
        },
        {
            name: "🎙️ **הצטרפות ליצירה**",
            value: "יצירה וניהול ערוץ קול דינמי",
            inline: true
        },
        {
            name: "🎭 **תפקידי תגובה**",
            value: "תפקידים בני-הקצאה עצמית המשתמשים במערכות תגובה-תפקיד",
            inline: true
        },
        {
            name: "✅ **אימות**",
            value: "זרימות עבודה אימות חברים וניהול גישה",
            inline: true
        },
        {
            name: "🔧 **כלי עזר**",
            value: "כלים שימושיים וכלים שרת",
            inline: true
        }
    );

    embed.setFooter({ 
        text: "עשוי באהבה ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("🐛 דווח על באג")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("💬 שרת התמיכה")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("▶️ למד מ-Touchpoint")
        .setURL("https://www.youtube.com/@TouchDisc")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "בחר כדי לצפות בפקודות",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("הצג את תפריט העזרה עם כל הפקודות הזמינות"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "❌ תפריט העזרה סגור",
                    description: "תפריט העזרה סגור, השתמש ב-/help שוב.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};