// backend/services/notificationService.js
const axios = require('axios');
const constants = require('../config/constants');
const token = process.env.TELEGRAM_BOT_TOKEN;
const publicChannelId = process.env.TELEGRAM_CHANNEL_ID; // هذا هو المعرف للقناة العامة الرئيسية
const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

const SOLSCAN_BASE_URL = "https://solscan.io";
const EXPLORER_CLUSTER_PARAM = "?cluster=mainnet-beta"; // !! يجب تعديل هذا لـ mainnet-beta عند الإطلاق النهائي !!
// const PROJECT_ICON_URL = "https://your-dapp-domain.com/sol_reb.png"; // <-- ضع رابط الشعار هنا لاحقًا

if (!token || !publicChannelId) {
    console.warn("Telegram Bot Token or Public Chat ID not provided. General Telegram notifications will be disabled.");
}

// دالة مساعدة لتنسيق الأرقام مع فواصل الآلاف
function formatNumberWithCommas(number) {
    if (typeof number !== 'number') return number; // أرجع القيمة كما هي إذا لم تكن رقمًا
    return number.toLocaleString('en-US');
}

// دالة مساعدة لاختصار العنوان (مع الحفاظ على إمكانية القراءة)
function shortenPublicKeyForDisplay(publicKey, startChars = 5, endChars = 5) {
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length < (startChars + endChars + 3)) {
        return publicKey || 'N/A';
    }
    return `${publicKey.slice(0, startChars)}...${publicKey.slice(-endChars)}`;
}

// دالة مساعدة لتهريب محارف MarkdownV2
const escapeMarkdownV2 = (text) => {
    if (typeof text !== 'string') text = String(text || '');
    // قائمة المحارف التي تحتاج لتهريب في MarkdownV2
    // _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
};


async function sendTelegramMessage(chatId, messageText, disableWebPagePreview = false, extraOptions = {}) {
    if (!token || !chatId) {
        console.warn(`Telegram message not sent. Missing token or chatId (Chat ID: ${chatId})`);
        return;
    }
    try {
        console.log(`NotificationService: Sending message to Chat ID: [${chatId}]`);
        const payload = {
            chat_id: chatId,
            text: messageText,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: disableWebPagePreview,
            ...extraOptions, // دمج أي خيارات إضافية
        };
        const response = await axios.post(telegramApiUrl, payload);
        if (response.data?.ok) {
            console.log("NotificationService: Message sent successfully via axios.");
        } else {
            console.error("!!! NotificationService: Telegram API error (axios):", response.data);
        }
    } catch (error) {
         const status = error.response?.status;
         const errorData = error.response?.data;
         console.error(`!!! NotificationService ERROR sending message to Chat ID [${chatId}] (Status: ${status || 'N/A'}):`, JSON.stringify(errorData || error.message));
    }
}

async function sendWeeklyTopReport(title, topUsersList, scoreKey = 'weeklyScore', scoreUnit = 'Score') {
    if (!publicChannelId) {
        console.warn("Public Telegram Channel ID not set. Skipping weekly top report.");
        return;
    }
    if (!topUsersList || topUsersList.length === 0) {
        console.log(`NotificationService: No top users for report: "${title}". Skipping Telegram message.`);
        return;
    }

    const txSignature = topUsersList[0]?.signature;
    // !! تعديل رابط المستكشف لـ Mainnet إذا لزم الأمر !!
    const txLink = txSignature ? `${SOLSCAN_BASE_URL}/tx/${txSignature}${constants.EXPLORER_CLUSTER_PARAM_MAINNET}` : null;

    let message = `*${escapeMarkdownV2(title)}*\n\n`;
    message += `Congratulations to this week's champions\\! 🎉\n\n`;

    topUsersList.slice(0, 10).forEach((user, index) => {
        const recipientKey = user.recipient;
        if (!recipientKey) return;
        const shortKey = shortenPublicKeyForDisplay(recipientKey);
        const score = Number(user[scoreKey]) || 0;
        let rankEmoji = `*${index + 1}\\.*`;
        if (index === 0) rankEmoji = '🥇'; else if (index === 1) rankEmoji = '🥈'; else if (index === 2) rankEmoji = '🥉';
        message += `${rankEmoji} \`${escapeMarkdownV2(shortKey)}\` \\- *${escapeMarkdownV2(formatNumberWithCommas(score))}* ${escapeMarkdownV2(scoreUnit)}\n`;
    });

    if (txLink) {
        message += `\nCheck the distribution transaction [here](${txLink})\\.`;
    }
    message += `\n\nKeep up the great work, everyone\\! 💪`;
    await sendTelegramMessage(publicChannelId, message, true);
}


// --- !! الدالة الجديدة لإشعار الفائزين بمسابقة الإطلاق !! ---
/**
 * يرسل إشعارًا بقائمة الفائزين المبدئيين في مسابقة الإطلاق ويدعوهم لملء نموذج.
 * @param {Array<object>} launchContestWinners - مصفوفة الفائزين (يجب أن تحتوي على userPublicKey و order).
 * @param {string} googleFormLink - رابط نموذج جوجل لجمع بيانات الفائزين.
 */
// --- !! تعديل دالة إشعار الفائزين بمسابقة الإطلاق !! ---
async function sendLaunchContestWinnerAnnouncement(launchContestWinners, googleFormLink) {
    if (!publicChannelId) {
        console.warn("Public Telegram Channel ID not set. Skipping launch contest winner announcement.");
        return;
    }
    if (!launchContestWinners || launchContestWinners.length === 0) {
        console.log("NotificationService: No launch contest winners to announce. Skipping message.");
        return;
    }
    if (!googleFormLink || typeof googleFormLink !== 'string' || googleFormLink.trim() === '') {
        console.error("NotificationService: Google Form link is missing or invalid for launch contest announcement.");
        return;
    }

    const totalWinners = launchContestWinners.length;
    const chunkSize = 20; // عدد الفائزين في كل رسالة
    const numMessages = Math.ceil(totalWinners / chunkSize); // عدد الرسائل المطلوبة

    console.log(`NotificationService: Preparing to send ${numMessages} announcement messages for ${totalWinners} launch contest winners.`);

    // --- الرسالة التقديمية الأولى (إذا أردت) ---
    let introMessage = `🎉 *Congratulations to the First ${escapeMarkdownV2(totalWinners)} Sol Rebound Pro Users\\!* 🎉\n\n`;
    introMessage += `You are one of the pioneering users who successfully closed ATAs and have qualified for a chance to share *10% of our first 24 hours of platform earnings\\!* Solana's getting cleaner thanks to you\\! 🧼\n\n`;
    introMessage += `We will now list our founding winners in batches\\. If you see your wallet, or believe you are one of the first ${escapeMarkdownV2(totalWinners)}, please proceed to the verification form below\\.\n\n`;
    // (اختياري) إرسال الرسالة التقديمية مرة واحدة
    // await sendTelegramMessage(publicChannelId, introMessage, true);
    // أو دمجها مع الرسالة الأولى

    for (let i = 0; i < numMessages; i++) {
        const startIdx = i * chunkSize;
        const endIdx = startIdx + chunkSize;
        const chunkOfWinners = launchContestWinners.slice(startIdx, endIdx);

        if (chunkOfWinners.length === 0) continue; // تخطي إذا كانت الشريحة فارغة لسبب ما

        let message = "";
        if (i === 0) { // الرسالة الأولى يمكن أن تكون مميزة قليلاً أو تحتوي على المقدمة
            message += introMessage; // دمج الرسالة التقديمية مع الرسالة الأولى
            message += `*Founding Winners (Part ${escapeMarkdownV2(i + 1)}/${escapeMarkdownV2(numMessages)}):*\n`;
        } else {
            message += `*Founding Winners (Part ${escapeMarkdownV2(i + 1)}/${escapeMarkdownV2(numMessages)} \\- Continued):*\n`;
        }

        chunkOfWinners.forEach((winner) => {
            // userPublicKey و order يجب أن يكونا موجودين في كائن winner
            const shortKey = shortenPublicKeyForDisplay(winner.userPublicKey, 7, 7);
            let rankText = `*${escapeMarkdownV2(winner.order)}*`; // استخدام الترتيب الفعلي

            // (اختياري) أيقونات للمراكز الأولى يمكن إضافتها هنا بناءً على winner.order
            if (winner.order === 1 && i === 0) rankText = '🏆 *1*'; // أيقونة فقط للأول في الرسالة الأولى

            message += `${rankText}\\. \`${escapeMarkdownV2(shortKey)}\`\n`;
        });

        // إضافة رابط النموذج والمهلة في الرسالة الأخيرة فقط أو في كل رسالة
        if (i === numMessages - 1) { // إذا كانت هذه هي الرسالة الأخيرة
            message += `\n\n*To claim your spot & prize, ALL ${escapeMarkdownV2(totalWinners)} QUALIFIERS please complete this verification form within the next 24 hours:* 👇\n`;
            message += `[Complete Verification Form Now](${escapeMarkdownV2(googleFormLink)})\n\n`;
            message += `*Form Deadline: 24 hours from the *initial* announcement time\\.* Prizes will be distributed to verified winners after the 24\\-hour platform earning period and verification process are complete\\. Stay tuned for more updates\\!\n\n`;
            message += `Thank you for being a part of the Sol Rebound Pro launch\\! 🚀`;
        } else {
            message += `\n_More winners in the next message\\.\\.\\._`;
        }

        // إرسال الرسالة الحالية مع تأخير بسيط بين الرسائل لتجنب إغراق القناة أو تجاوز حدود معدل API تيليجرام
        await sendTelegramMessage(publicChannelId, message, true);
        console.log(`NotificationService: Sent part ${i + 1}/${numMessages} of launch contest winner announcement.`);

        if (i < numMessages - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500)); // تأخير 1.5 ثانية بين الرسائل
        }
    }
    console.log(`NotificationService: All ${numMessages} parts of launch contest winner announcement sent for ${totalWinners} users.`);
}


module.exports = {
    sendTelegramMessage,
    sendWeeklyTopReport,
    sendLaunchContestWinnerAnnouncement, // <-- تصدير الدالة الجديدة
    escapeMarkdownV2
};
