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
            description: "צפה בכל הפקודות הזמינות עם עמודים",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `צפה בפקודות בקטגוריה ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "בוט";
    const embed = createEmbed({ 
        title: `🤖 מרכז עזרה ${botName}`,
        description: "עוזר הכל-באחד שלך ב-Discord למיתון, כלכלה, כיף וניהול שרת.",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **ניתוח**",
            value: "ניתוח שרת, ניהול משתמשים וכלים אכיפה",
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
            name: "📊 **דירוג**",
            value: "רמות משתמש, מערכת XP ומעקב התקדמות",
            inline: true
        },
        {
            name: "🎫 **כרטיסים**",
            value: "מערכת כרטיסי תמיכה לניהול שרת",
            inline: true
        },
        {
            name: "🎉 **הגרלות**",
            value: "ניהול הגרלות אוטומטי והפצה",
            inline: true
        },
        {
            name: "👋 **ברכה בכניסה**",
            value: "הודעות ברכה לחברים ואונבורדינג",
            inline: true
        },
        {
            name: "🎂 **יומולדות**",
            value: "מעקב יומולדות וכי חגיגיות",
            inline: true
        },
        {
            name: "👥 **קהילה**",
            value: "כלים קהילתיים, מועמדויות והשתתפות חברים",
            inline: true
        },
        {
            name: "⚙️ **הגדרות**",
            value: "פקודות ניהול הגדרות שרת ובוט",
            inline: true
        },
        {
            name: "🔢 **מונה**",
            value: "הגדרת ערוץ מונה חי ובקרות מונה",
            inline: true
        },
        {
            name: "🎙️ **הצטרפות כדי ליצור**",
            value: "יצירה ודינמית של ערוצי קול וניהול",
            inline: true
        },
        {
            name: "🎭 **תפקידי Reaction**",
            value: "תפקידים בני הקצאה עצמית באמצעות מערכות reaction-role",
            inline: true
        },
        {
            name: "✅ **אימות**",
            value: "זרימות אימות חברים וגישה מוגנת",
            inline: true
        },
        {
            name: "🔧 **כלים שימושיים**",
            value: "כלים שימושיים וכלים לשרת",
            inline: true
        }
    );

    embed.setFooter({ 
        text: "עשוי בעם ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("דווח על באג")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("שרת תמיכה")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("למד מ-Touchpoint")
        .setURL("https://www.youtube.com/@TouchDisc")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "בחר כדי להצגת הפקודות",
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
        .setDescription("🤖 הצג את תפריט העזרה עם כל הפקודות הזמינות"),

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
                    title: "תפריט עזרה סגור",
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
