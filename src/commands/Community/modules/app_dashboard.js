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

/**
 * ====================================================
 * 📋 APPLICATION DASHBOARD MODULE
 * ====================================================
 * 
 * מודול זה אחראי על ניהול לוח הבקרה של המועמדויות.
 * הוא מאפשר למנהלים להגדיר ולעדכן את כל הגדרות המערכת
 * כולל: ערוץ רישום, תפקידים, שאלות ותקופות שמירה.
 * 
 * פונקציות עיקריות:
 * - buildDashboardEmbed: יוצר את ה-Embed של לוח הבקרה
 * - buildSelectMenu: יוצר תפריט בחירה ראשי
 * - setupCollectors: מגדיר אספנים לטיפול באינטראקציות
 * 
 * ====================================================
 */

// ─── בנאים של Embed ו-Menu ────────────────────────────────────────────────────

/**
 * בניית ה-Embed של לוח הבקרה
 * 
 * פונקציה זו יוצרת את ה-Embed הראשי שמציג את כל הגדרות המערכת.
 * היא מציגה:
 * - סטטוס המערכת (מופעלת/בטלה)
 * - ערוץ הרישום הנוכחי
 * - תפקידי מנהלים מוגדרים
 * - השאלות המוגדרות
 * - תפקידי המועמדויות
 * - תקופות השמירה
 * 
 * @param {Object} settings - הגדרות המערכת הגלובליות
 * @param {Array} roles - מערך תפקידי המועמדויות
 * @param {Guild} guild - אובייקט השרת של Discord
 * @returns {EmbedBuilder} - ה-Embed שיוצג
 */
function buildDashboardEmbed(settings, roles, guild) {
    const logChannel = settings.logChannelId ? `<#${settings.logChannelId}>` : '`לא הוגדר`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`אין מוגדר`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`לא הוגדרו תפקידים למועמדויות`';
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

/**
 * בניית תפריט הבחירה הראשי
 * 
 * פונקציה זו יוצרת את תפריט ה-StringSelect שמאפשר למנהל
 * לבחור איזו הגדרה הוא רוצה לעדכן.
 * 
 * האפשרויות הזמינות:
 * 1. ערוץ רישום - הגדר ערוץ לרישום מועמדויות
 * 2. תפקידי מנהלים - הוסף/הסר תפקיד למנהלים
 * 3. עריכת שאלות - התאם את השאלות בטופס
 * 4. הוסף תפקיד - הוסף תפקיד חדש למועמדות
 * 5. הסר תפקיד - הסר תפקיד קיים
 * 6. תקופת שמירה - הגדר כמה זמן לשמור נתונים
 * 
 * @param {String} guildId - מזהה השרת
 * @returns {StringSelectMenuBuilder} - תפריט הבחירה
 */
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

/**
 * בניית שורת הכפתורים
 * 
 * פונקציה זו יוצרת שורה עם כפתור ON/OFF להפעלה/בטלון
 * של מערכת המועמדויות בכללותה.
 * 
 * - אם המערכת דלוקה - הכפתור יהיה ירוק (Success)
 * - אם המערכת כבויה - הכפתור יהיה אדום (Danger)
 * 
 * @param {Object} settings - הגדרות המערכת
 * @param {String} guildId - מזהה השרת
 * @param {Boolean} disabled - האם לנטרל את הכפתור
 * @returns {ActionRowBuilder} - שורת הכפתורים
 */
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

// ─── פונקציות עזר ──────────────────────────────────────────────────────────────

/**
 * רענן את לוח הבקרה
 * 
 * פונקציה זו מעדכנת את הודעת לוח הבקרה עם הנתונים החדשים.
 * היא נקראת אחרי כל שינוי בהגדרות כדי להציג את המצב העדכני.
 * 
 * @param {Interaction} rootInteraction - האינטראקציה הראשונית
 * @param {Object} settings - הגדרות המערכת המעודכנות
 * @param {Array} roles - מערך התפקידים המעודכן
 * @param {String} guildId - מזהה השרת
 */
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

// ─── ייצוא ראשי ──────────────────────────────────────────────────────────────────

/**
 * ====================================================
 * 🚀 MAIN EXECUTION FUNCTION
 * ====================================================
 * 
 * פונקציה זו הוא נקודת הכניסה למודול.
 * היא מופעלת כאשר משתמש פותח את לוח הבקרה.
 * 
 * הפונקציה:
 * 1. בודקת אם המערכת מוגדרת כלל
 * 2. טוענת את כל הגדרות המערכת והתפקידים
 * 3. בוחרת איזה לוח בקרה להציג:
 *    - אם אין תפקידים - מציגה הגדרות גלובליות
 *    - אם יש בחירה ספציפית - מציגה את תפקיד זה
 *    - אחרת - מציגה את התפקיד הראשון
 * 4. מגדירה אספנים לטיפול בבחירות המשתמש
 */
export default {
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            // דחה מיד כדי למנוע timeout של Discord
            // זה חשוב כי Discord נותן רק 3 שניות לתגובה
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            // טען הגדרות ותפקידים במקביל כדי להאיץ
            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            // בדוק אם המערכת לא הוגדרה כלל
            const isCompletelyUnconfigured = 
                !settings.logChannelId && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    'מערכת המועמדויות לא הוגדרה',
                    ErrorTypes.CONFIGURATION,
                    'מערכת המועמדויות טרם הוגדרה. בחר `/app-admin setup` כדי ליצור את המועמדות הראשונה שלך.',
                );
            }

            // אם אין תפקידי מועמדויות, הצג הגדרות גלובליות
            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            // אם בחרת מועמדות ספציפית דרך autocomplete, הצג את לוח הבקרה שלה ישירות
            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
            }

            // ברירת מחדל: הצג את המועמדות הראשונה אם לא נבחרה
            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('שגיאה בלוח בקרה של מועמדויות:', error);
            throw new TitanBotError(
                `לוח בקרה למועמדויות נכשל: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'נכשל בפתיחת לוח הבקרה למועמדויות.',
            );
        }
    },
};

// ─── בוחר מועמדויות (למועמדויות מרובות) ────────────────────────────────────

/**
 * הצג בוחר מועמדויות
 * 
 * פונקציה זו מציגה תפריט בחירה כאשר יש מועמדויות רבות.
 * היא מאפשרת למנהל לבחור איזו מועמדות הוא רוצה להגדיר.
 * 
 * @param {Interaction} interaction - אינטראקציית Discord
 * @param {Array} roles - מערך תפקידי המועמדויות
 * @param {Object} settings - הגדרות המערכת
 * @param {String} guildId - מזהה השרת
 * @param {Client} client - לקוח Discord
 */
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

// ─── לוח בקרה גלובלי ──────────────────────────────────────────────────────────

/**
 * הצג לוח בקרה גלובלי
 * 
 * פונקציה זו מציגה את לוח הבקרה עם הגדרות גלובליות.
 * זה מופיע כאשר:
 * - אין עדיין תפקידי מועמדויות מוגדרים
 * - המנהל רוצה לערוך הגדרות גלובליות
 * 
 * @param {Interaction} interaction - אינטראקציית Discord
 * @param {Object} settings - הגדרות המערכת
 * @param {Array} roles - מערך תפקידי המועמדויות
 * @param {String} guildId - מזהה השרת
 * @param {Client} client - לקוח Discord
 */
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

// ─── לוח בקרה לכל מועמדות ────────────────────────────────────────────────────

/**
 * הצג לוח בקרה ספציפי למועמדות
 * 
 * פונקציה זו מציגה לוח בקרה מפורט לתפקיד מסוים.
 * היא מציגה:
 * - שם התפקיד ורוגז הנוכחי
 * - הגדרות ספציפיות לתפקיד זה
 * - כפתורי שליטה (בטל/הפעל/מחק)
 * - תפריט להגדרה של אפשרויות
 * 
 * @param {Interaction} rootInteraction - אינטראקציית Discord
 * @param {Object} selectedRole - התפקיד הנבחר
 * @param {Object} settings - הגדרות המערכת
 * @param {Array} roles - מערך תפקידי המועמדויות
 * @param {String} guildId - מזהה השרת
 * @param {Client} client - לקוח Discord
 */
async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    // קבל את אובייקט התפקיד מ-Discord
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);
    
    // קבל הגדרות ספציפיות למועמדות זו
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = appSettings.logChannelId || settings.logChannelId;
    const isEnabled = selectedRole.enabled !== false;

    // בנה טקסטים להצגה
    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`ירושה מערוץ הרישום הגלובלי`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`ירושה משאלות גלובליות`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
        : '`אין מוגדר`';

    // בנה את ה-Embed
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

    // בנה את הרכיבים
    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

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

    // שלח את לוח הבקרה
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    // הגדר אספנים לטיפול בבחירות
    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

// ─── הגדרת אספנים ────────────────────────────────────────────────────────────

/**
 * ====================================================
 * 🎯 SETUP COLLECTORS FUNCTION
 * ====================================================
 * 
 * פונקציה זו מגדירה אספנים (Collectors) לטיפול בכל האינטראקציות
 * של המשתמש עם לוח הבקרה.
 * 
 * האספנים מטפלים ב:
 * 1. StringSelect - בחירות מתפריט
 * 2. Button - לחיצות על כפתורים
 * 3. Modal - הגשות טפסים
 * 
 * כל אספן מאזין למשך 10 דקות ואז סוגר את לוח הבקרה.
 */
function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    /**
     * אספן ראשי - מטפל בבחירות מתפריט StringSelect
     * זה האספן הראשי שמטפל בכל בחירות המשתמש מהתפריט
     */
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000, // 10 דקות
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            // בדוק שזו אכן StringSelect (לפעמים Discord שולח garbage)
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }

            // נתב לפונקציה המתאימה בהתאם לבחירה
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
                logger.debug(`שגיאת אימות בהגדרות מועמדויות: ${error.message}`);
            } else {
                logger.error('שגיאה בלוח בקרה של מועמדויות:', error);
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

    // כאשר האספן מסתיים (לאחר 10 דקות)
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

    // אם זה לוח בקרה גלובלי, הוסף אספן לכפתור ה-Toggle
    if (!selectedRoleId) {
        /**
         * אספן כפתור טוגל גלובלי
         * מטפל בלחיצה על כפתור הפעלה/בטלון של המערכת בכללותה
         */
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

                // שמור את ההגדרות החדשות
                await saveApplicationSettings(interaction.client, guildId, settings);

                // רענן את לוח הבקרה
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                // שלח הודעת הצלחה
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
                logger.error('שגיאה בהחלפת סטטוס מועמדויות גלובלי:', error);
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

    // אם זה לוח בקרה ספציפי, הוסף אספנים לכפתורי מחק ו-toggle
    if (selectedRoleId) {
        /**
         * אספן כפתור מחיקה
         * מטפל בלחיצה על כפתור מחיקת המועמדות
         */
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            // הצג דיאלוג אישור
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
                logger.error('שגיאה בהצגת דיאלוג אישור מחיקה:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('שגיאה', 'נכשל בהצגת דיאלוג האישור. אנא נסה שוב.')],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
                return;
            }

            try {
                // המתן לאישור
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

                // בדוק אם המשתמש אישר
                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await confirmSubmit.reply({
                        embeds: [errorEmbed('לא אושר', 'עליך לסמן את תיבת האישור כדי למחוק את המועמדות.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                // בצע את המחיקה
                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('שגיאה באישור מחיקת המועמדות:', error);
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

        /**
         * אספן כפתור טוגל ספציפי
         * מטפל בלחיצה על כפתור הפעלה/בטלון של מועמדות ספציפית
         */
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
                // מצא את התפקיד במערך
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await toggleInteraction.followUp({
                        embeds: [errorEmbed('לא נמצא', 'תפקיד המועמדויות לא נמצא.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                // החלף את הסטטוס
                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                // שמור את ההגדרות החדשות
                await saveApplicationRoles(interaction.client, guildId, roles);

                // רענן את לוח הבקרה
                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                // שלח הודעת הצלחה
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
                logger.error('שגיאה בהחלפת סטטוס המועמדות:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('שגיאה', 'אירעה שגיאה בהחלפת סטטוס המועמדות.')],
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

// ─── בניית תפריטי בחירה ───────────────────────────────────────────────────────

/**
 * בניית תפריט בחירה למועמדות ספציפית
 * 
 * תפריט זה מציג אפשרויות להגדרה של מועמדות ספציפית,
 * בניגוד לתפריט הגלובלי שמציג אפשרויות להוספה/הסרה של תפקידים.
 */
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

// ─── ערוץ רישום ──────────────────────────────────────────────────────────────

/**
 * טיפול בבחירת ערוץ רישום
 * 
 * פונקציה זו מאפשרת למנהל לבחור איזה ערוץ יישמש
 * לרישום מועמדויות חדשות.
 * 
 * ניתן להגדיר ערוץ ספציפי לכל מועמדות, או ערוץ גלובלי
 * שישמש כברירת מחדל לכל המועמדויות.
 */
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
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channel.id;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
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

// ─── תפקידי מנהלים ───────────────────────────────────────────────────────────

/**
 * טיפול בבחירת תפקידי מנהלים
 * 
 * פונקציה זו מאפשרת למנהל להוסיף או להסיר תפקידים
 * שיוכלו לנהל את מערכת המועמדויות.
 * 
 * זהו הגדרה גלובלית שחלה על כל המועמדויות.
 */
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

// ─── עריכת שאלות ──────────────────────────────────────────────────────────────

/**
 * טיפול בעריכת שאלות
 * 
 * פונקציה זו מאפשרת למנהל לערוך את השאלות שיופיעו
 * בטופס המועמדות.
 * 
 * ניתן להגדיר עד 5 שאלות:
 * - שאלה 1: חובה
 * - שאלות 2-5: אופציונליות
 * 
 * ניתן להגדיר שאלות גלובליות או שאלות ספציפיות לכל מועמדות.
 */
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
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
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

// ─── הוסף תפקיד מועמדויות ────────────────────────────────────────────────────

/**
 * טיפול בהוספת תפקיד מועמדויות
 * 
 * פונקציה זו מאפשרת למנהל להוסיף תפקיד חדש
 * שחברים יכולים להגיש בקשה עבורו.
 * 
 * תהליך ההוספה:
 * 1. בחר תפקיד Discord
 * 2. הגדר שם תצוגה (אופציונלי)
 * 3. התפקיד מתווסף למערכת
 */
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

        // בדוק אם התפקיד כבר קיים
        if (roles.some(r => r.roleId === role.id)) {
            const deferred = await safeDeferInteraction(roleInteraction);
            if (!deferred) return;
            
            await roleInteraction.followUp({
                embeds: [errorEmbed('כבר נוסף', `${role} כבר תפקיד מועמדויות.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // הצג דיאלוג להגדרת שם התצוגה
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

        // הוסף את התפקיד
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

// ─── הסר תפקיד מועמדויות ──────────────────────────────────────────────────────

/**
 * טיפול בהסרת תפקיד מועמדויות
 * 
 * פונקציה זו מאפשרת למנהל להסיר תפקיד קיים מהמערכת.
 * 
 * הסרה פירושה:
 * - התפקיד לא יהיה זמין עוד לבקשות
 * - חברים לא יוכלו להגיש בקשות עבורו
 */
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

// ─── תקופת שמירה ──────────────────────────────────────────────────────────────

/**
 * טיפול בהגדרת תקופת השמירה
 * 
 * פונקציה זו מאפשרת למנהל להגדיר כמה זמן המערכת
 * תשמור נתונים על מועמדויות:
 * 
 * - בהמתנה: מועמדויות שלא טופלו עדיין
 * - בדוקה: מועמדויות שאושרו או נדחו
 * 
 * לאחר תקופת השמירה, הנתונים יוסרו אוטומטית.
 */
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

    // בדוק ערכים חוקיים
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

    // עדכן את ההגדרות
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

// ─── מחק מועמדות ──────────────────────────────────────────────────────────────

/**
 * טיפול במחיקת מועמדות
 * 
 * פונקציה זו מוחקת מועמדות ומחקה:
 * - את ההגדרות של המועמדות
 * - את כל המועמדויות השמורות לתפקיד זה
 * 
 * זהו פעולה קבועה ולא ניתן לביטול!
 */
async function handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client) {
    try {
        // מצא את התפקיד במערך
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await confirmSubmit.reply({
                embeds: [errorEmbed('לא נמצא', 'תפקיד המועמדויות לא נמצא.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deletedRole = roles[roleIndex];

        // הסר מהמערך
        roles.splice(roleIndex, 1);
        await saveApplicationRoles(client, guildId, roles);

        // מחק את הגדרות התפקיד
        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        // קבל את כל המועמדויות לשרת זה
        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        // מחק כל מועמדות לתפקיד זה
        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        // שלח הודעת הצלחה
        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ מועמדות נמחקה',
                    `המועמדות עבור <@&${selectedRoleId}> (**${deletedRole.name}**) נמחקה לחלוטין.\n\nנמחקו: **${applicationsToDelete.length}** מועמדות${applicationsToDelete.length !== 1 ? '' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('שגיאה ב-handleDeleteApplication:', error);
        await confirmSubmit.reply({
            embeds: [errorEmbed('שגיאה', 'אירעה שגיאה במחיקת המועמדות. אנא נסה שוב.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}
