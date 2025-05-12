// backend/services/notificationService.js
const axios = require('axios'); // استخدم axios لإرسال الطلبات

// قراءة التوكن ومعرف الدردشة من متغيرات البيئة
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHANNEL_ID; // هذا هو معرف القناة/المجموعة
const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

const SOLSCAN_BASE_URL = "https://solscan.io";
const EXPLORER_CLUSTER_PARAM = "?cluster=devnet";
//const PROJECT_ICON_URL = "https://sol-rebound-pro.vercel.app/sol_reb.png"; // <-- ضع رابطًا لملف الشعار المستضاف

// التحقق من وجود المتغيرات عند تحميل الوحدة
if (!token || !chatId) {
    console.warn("Telegram Bot Token or Chat ID not provided in environment variables. Telegram notifications will be disabled.");
}

/**
 * يرسل رسالة نصية إلى قناة تيليجرام المحددة باستخدام axios.
 * @param {string} messageText - النص المراد إرساله (يدعم تنسيق Markdown).
 */
async function sendTelegramMessage(messageText, disableWebPagePreview = false) { // <-- تغيير اسم المعلمة هنا
    if (!token || !chatId) { return; }
    try {
        console.log(`NotificationService: Sending message to Chat ID: [${chatId}]`);
        const payload = {
            chat_id: chatId,
            text: messageText,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: disableWebPagePreview // <-- استخدام الاسم الصحيح للمعامل
        };
        // console.log("NotificationService Payload:", JSON.stringify(payload)); // للتصحيح إذا لزم الأمر
        const response = await axios.post(telegramApiUrl, payload);
        if (response.data?.ok) {
            console.log("NotificationService: Message sent successfully via axios.");
        } else {
            console.error("!!! NotificationService: Telegram API error (axios):", response.data);
        }
    } catch (error) {
         const status = error.response?.status;
         const errorData = error.response?.data;
         console.error(`!!! NotificationService ERROR sending message (Status: ${status || 'N/A'}):`, JSON.stringify(errorData || error.message));
    }
}


/**
 * ينسق ويرسل تقرير أفضل المستخدمين الأسبوعي إلى تيليجرام.
 * @param {string} title - عنوان التقرير (e.g., "🏆 Weekly Top Referrers!").
 * @param {Array<object>} topUsersList - قائمة الفائزين (يجب أن تحتوي على recipient و scoreKey).
 * @param {string} scoreKey - اسم الحقل الذي يحتوي على النتيجة (e.g., 'weeklyScore').
 * @param {string} scoreUnit - وحدة النتيجة (e.g., 'Lamports Earned' or 'Accounts Closed').
 * @param {string} [footerMessage] - رسالة اختيارية في نهاية التقرير.
 */
async function sendWeeklyTopReport(title, topUsersList, scoreKey = 'weeklyScore', scoreUnit = 'Score') {
    if (!topUsersList || topUsersList.length === 0) {
        console.log(`NotificationService: No top users for report: "${title}". Skipping Telegram message.`);
        return;
    }
    const escapeMarkdownV2 = (text) => String(text || '').replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
    const txSignature = topUsersList[0]?.signature;
    const txLink = txSignature ? `${SOLSCAN_BASE_URL}/tx/${txSignature}${EXPLORER_CLUSTER_PARAM}` : null;

    // let message = `[\u200B](${PROJECT_ICON_URL}) *${escapeMarkdownV2(title)}*\n\n`; // إذا أردت الشعار لاحقًا
    let message = `*${escapeMarkdownV2(title)}*\n\n`;

    topUsersList.slice(0, 10).forEach((user, index) => {
        const recipientKey = user.recipient;
        if (!recipientKey) return;
        const shortKey = recipientKey.length >= 8 ? `${recipientKey.slice(0, 4)}...${recipientKey.slice(-4)}` : recipientKey;
        const score = Number(user[scoreKey]) || 0;
        let rankEmoji = `*${index + 1}\\.*`;
        if (index === 0) rankEmoji = '🥇'; else if (index === 1) rankEmoji = '🥈'; else if (index === 2) rankEmoji = '🥉';
        message += `${rankEmoji} \`${escapeMarkdownV2(shortKey)}\` \\- *${escapeMarkdownV2(score.toLocaleString())}* ${escapeMarkdownV2(scoreUnit)}\n`;
    });

    if (txLink) {
        message += `\nCheck the distribution transaction [here](${txLink})\\.`;
    }
    message += `\n\nCongratulations winners\\! 🎉 Keep climbing\\!`;
    await sendTelegramMessage(message, true); // تمرير true لتعطيل معاينة الرابط
}


// تصدير الدوال للاستخدام في الوحدات الأخرى
module.exports = {
    sendTelegramMessage,
    sendWeeklyTopReport,
};