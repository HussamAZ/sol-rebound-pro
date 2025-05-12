// src/components/Footer/Footer.js
import React, { useState } from 'react';
import styles from './Footer.module.css';

import { ReactComponent as TwitterIcon } from '../../assets/icons/twitter.svg';
import { ReactComponent as TelegramIcon } from '../../assets/icons/telegram.svg';


// --- !! تعريف عنوان العقد هنا كثابت !! ---
const CONTRACT_ADDRESS = "8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW";
// --- !! تحديد رابط المستكشف (استخدم devnet حاليًا) !! ---
const EXPLORER_LINK = `https://solscan.io/account/${CONTRACT_ADDRESS}?cluster=devnet`;
// أو استخدم Solana Explorer: `https://explorer.solana.com/address/${CONTRACT_ADDRESS}?cluster=devnet`


// مكون FAQItem يبقى كما هو
const FAQItem = ({ q, a }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className={styles.faqItem}>
            <button className={styles.faqQuestion} onClick={() => setIsOpen(!isOpen)}>
                <span>{q}</span>
                <span className={`${styles.faqIcon} ${isOpen ? styles.faqIconOpen : ''}`}>▼</span>
            </button>
            <div className={`${styles.faqAnswer} ${isOpen ? styles.faqAnswerOpen : ''}`}>
                {a}
            </div>
        </div>
    );
};

const Footer = () => {
    // --- تقسيم الأسئلة ---
    const allFaqs = [
        { q: "What is Sol Rebound Pro?", a: "A dApp to help Solana users find and close their empty Associated Token Accounts (ATAs) and recover the SOL locked for rent, with added referral and weekly reward programs." },
        // --- العمود الأيسر (الأسئلة 2-5) ---
        { q: "What are Associated Token Accounts (ATAs)?", a: "Special accounts on Solana required to hold specific tokens (like USDC, BONK, etc.). Each ATA is linked to your main wallet address and the token's mint address." },
        { q: "Why do empty ATAs have SOL locked in them? (Rent)", a: "Solana requires accounts to maintain a minimum SOL balance to cover storage costs, known as \"rent\". Even empty ATAs hold this minimum balance (~0.002 SOL). Closing the empty ATA returns this rent to you." },
        { q: "Is it safe to close empty ATAs?", a: "Yes, it is safe to close ATAs that have a zero token balance. The smart contract only allows closing empty accounts you own. You cannot close accounts with tokens in them." },
        { q: "How much SOL can I recover?", a: "You recover the full rent amount (~0.002 SOL) for each empty ATA you close, minus network transaction fees and a small platform fee." },
        // --- العمود الأيمن (الأسئلة 6-9) ---
        { q: "What are the fees for using Sol Rebound Pro?", a: "The platform charges a 25% fee *on the recovered rent* (not your wallet balance). A portion of this fee (25% of the fee) goes to your referrer, if you were referred. You also pay the standard Solana network transaction fee." },
        { q: "How does the referral system work?", a: "Share your unique referral link. When someone uses your link to close ATAs, you earn 25% of the platform fee they pay, deposited directly into your earnings balance." },
        { q: "How often are weekly rewards distributed?", a: "Rewards for Top Referrers and Top Closers are calculated and automatically distributed once a week (typically around Saturday ~23:45 GMT). The countdown timer shows the time until the next reward cycle." },
        { q: "Is connecting my wallet safe?", a: "Yes. We use the standard Solana Wallet Adapter. The dApp never has access to your private keys. All transactions (closing ATAs, withdrawing earnings) require your explicit approval within your wallet application." },
    ];

    const firstFaq = allFaqs[0];
    const leftFaqs = allFaqs.slice(1, 5); // الأسئلة من الثاني إلى الخامس
    const rightFaqs = allFaqs.slice(5);   // الأسئلة من السادس إلى النهاية

    return (
        <div className={`${styles.footerContainer} glass-effect container`}>
            <div className={styles.faqSection}>
                <h3 className={`${styles.faqTitle} gradient-text-bold`}>Frequently Asked Questions (FAQ)</h3>

                {/* --- السؤال الأول (بعرض كامل) --- */}
                {firstFaq && <FAQItem q={firstFaq.q} a={firstFaq.a} />}

                {/* --- حاوية العمودين --- */}
                <div className={styles.faqColumnsContainer}>
                    {/* العمود الأيسر */}
                    <div className={styles.faqColumn}>
                        {leftFaqs.map((faq, index) => (
                            <FAQItem key={`left-${index}`} q={faq.q} a={faq.a} />
                        ))}
                    </div>
                    {/* العمود الأيمن */}
                    <div className={styles.faqColumn}>
                        {rightFaqs.map((faq, index) => (
                            <FAQItem key={`right-${index}`} q={faq.q} a={faq.a} />
                        ))}
                    </div>
                </div>
                 {/* --- نهاية حاوية العمودين --- */}
                
                 

            </div>
            <hr className={styles.footerDivider} />

            <div className={styles.infoLinksSection}>
                
                 {/* --- !! قسم "تابعنا" فقط !! --- */}
                <div className={styles.followUsSection}> {/* إعادة تسمية الفئة للتوضيح */}
                    {/* القسم الأيمن سابقًا، أصبح الآن القسم الوحيد هنا */}
                    <div className={styles.followUsContent}> {/* فئة جديدة للمحتوى */}
                        <img src="/sol_reb.png" alt="Sol Rebound Logo" className={styles.footerLogo} />
                        <p className={styles.followText}>Follow us for updates:</p>
                        <div className={styles.socialIcons}>
                            <a href="https://x.com/SOLREBOUND" target="_blank" rel="noopener noreferrer" aria-label="Follow us on X">
                                <TwitterIcon className={styles.socialIcon} />
                            </a>
                            <a href="https://t.me/SolRebound" target="_blank" rel="noopener noreferrer" aria-label="Join our Telegram">
                                <TelegramIcon className={styles.socialIcon} />
                            </a>
                        </div>
                    </div>
                </div>
                {/* --- نهاية قسم "تابعنا" --- */}                
            </div>
            <hr className={styles.footerDivider} />
            {/* --- !! إضافة عنوان العقد الذكي !! --- */}
            <div className={styles.contractInfo}>
                 <span className={styles.contractLabel}>Smart Contract Address (Devnet):</span>
                 <a href={EXPLORER_LINK} target="_blank" rel="noopener noreferrer" className={styles.contractAddressLink}>
                     {CONTRACT_ADDRESS}
                 </a>
            </div>
             {/* ------------------------------------- */}
            <h4 className={`${styles.footerText} gradient-text-bold`}>
                Powered by Solana | Sol Rebound Pro © {new Date().getFullYear()}
            </h4>
            {/* ... روابط اختيارية ... */}
        </div>
    );
};

export default Footer;