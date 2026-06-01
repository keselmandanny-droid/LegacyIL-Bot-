import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("🐛 דווח על באג או בעיה עם הבוט"),

    async execute(interaction) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 דווח על באג ב-GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const row = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 דיווח על באג',
            description: 'מצאת באג? אנא דווח עליו בעמוד GitHub Issues שלנו!\n\n' +
            '**כאשר אתה מדווח על באג, אנא כלול:**\n' +
            '• 📝 תיאור מפורט של הבעיה\n' +
            '• 🔄 שלבים לשחזור הבעיה\n' +
            '• 📸 צילומי מסך אם רלוונטי\n' +
            '• 💻 גרסת הבוט וסביבתך\n\n' +
            'זה עוזר לנו לתקן בעיות בצורה מהירה ויעילה יותר!',
            color: 'error'
        })
            .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [bugReportEmbed],
            components: [row],
        });
    },
};
