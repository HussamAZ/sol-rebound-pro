// src/components/ReferralDashboard/ReferralDashboard.js
import React, { useState, useCallback, useMemo } from 'react'; // أزلنا useEffect
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';
import styles from './ReferralDashboard.module.css';
import { toast } from 'react-toastify';

import apiClient from '../../api/axiosInstance'; // <-- المسار الصحيح

import { ReactComponent as TelegramIcon } from '../../assets/icons/telegram.svg';
import { ReactComponent as TwitterIcon } from '../../assets/icons/twitter.svg';

// تعريف الثوابت المتعلقة بالإحالة هنا
const MIN_REFERRAL_WITHDRAW_SOL = 0.05;

// تعريف Props المستلمة من App.js
// setError: دالة لتحديث الخطأ العام في App
// referralInfo: كائن بيانات الإحالة (إما من DB أو افتراضي) أو null
// loadingInfo: قيمة boolean تشير إلى ما إذا كانت بيانات الإحالة قيد التحميل في App
// onSuccessfulWithdraw: دالة callback اختيارية لتشغيلها بعد السحب الناجح (مثل refreshAllData)
const ReferralDashboard = ({ setError, referralInfo, loadingInfo, onSuccessfulWithdraw }) => {

    
    // Hook للحصول على publicKey (لا يزال مطلوبًا للسحب والرابط) والاتصال
    const { publicKey, connected } = useWallet();

    // الحالة الداخلية الخاصة فقط بهذا المكون
    const [isWithdrawing, setIsWithdrawing] = useState(false); // حالة السحب
    const [copyStatus, setCopyStatus] = useState('Copy'); // حالة زر النسخ

    const referralLink = useMemo(() => {
        if (!publicKey) return '';
        
        // **المنطق الجديد**
        const refParam = referralInfo?.referralCode || publicKey.toBase58();
        
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/?ref=${refParam}`;
        }
        return '';
    }, [publicKey, referralInfo]); // أضف referralInfo كاعتمادية

    // وظيفة النسخ (تبقى كما هي)
    const handleCopyLink = useCallback(() => {
        if (!referralLink) return;
        navigator.clipboard.writeText(referralLink)
            .then(() => {
                setCopyStatus('Copied!');
                toast.success("Referral link copied to clipboard!"); // <-- استدعاء Toast
                setTimeout(() => setCopyStatus('Copy'), 2000);
            })
            .catch(err => {
                console.error('ReferralDashboard: Copy failed: ', err);
                setCopyStatus('Error!');
                //setError('Failed to copy link to clipboard.'); // استخدام setError الممرر
                toast.error("Failed to copy link!"); // <-- استدعاء Toast للخطأ
                setTimeout(() => setCopyStatus('Copy'), 2000);
            });
    }, [referralLink, setError]); // إضافة setError للاعتماديات

    

    const TELEGRAM_CHANNEL_URL = "https://t.me/SolRebound"; // استبدل بالرابط الفعلي
    const TWITTER_PROFILE_URL = "https://x.com/SOLREBOUND";   // استبدل بالرابط الفعلي


    // === العرض ===

    // لا تعرض شيئًا إذا لم تكن المحفظة متصلة
    if (!connected || !publicKey) {
        return null;
    }

    // عرض رسالة التحميل بناءً على prop 'loadingInfo'
    if (loadingInfo) {
        return (
            <div className={`${styles.referralContainer} glass-effect container`}>
                <h2 className={`${styles.title} gradient-text-bold`}>Referral Dashboard</h2>
                <p className={styles.loadingText}>Loading referral data...</p>
            </div>
        );
    }

    // عرض رسالة الخطأ أو عدم وجود بيانات إذا كان referralInfo هو null أو undefined
    if (!referralInfo) {
         return (
            <div className={`${styles.referralContainer} glass-effect container`}>
                 <h2 className={`${styles.title} gradient-text-bold`}>Referral Dashboard</h2>
                 {/* رسالة أوضح للمستخدم */}
                <p className={styles.errorText}>Could not load your referral data. Please try refreshing the page or reconnecting your wallet. If the issue persists, you might need to close an account first to initialize your record.</p>
            </div>
         );
    }

    // العرض الرئيسي للوحة التحكم باستخدام referralInfo الممرر
    return (
        <div className={`${styles.referralContainer} glass-effect container`}>
            <h2 className={`${styles.title} gradient-text-bold`}>Referral Dashboard</h2>
            <p className={styles.referralSubtitle}>
                💰 Refer Friends & Earn 25% of Our Platform Fee – Paid Straight to You, LIFETIME! Start Sharing Now! 🚀🔗
            </p>

            {/* --- رابط الإحالة --- */}
            <div className={styles.linkContainer}>
                <strong className={`${styles.linkLabel} gradient-text-bold`}>Your Referral Link:</strong>
                <div className={styles.linkBox} onClick={handleCopyLink} title="Click to copy">
                     <span className={styles.linkText}>{referralLink || 'Generating...'}</span>
                    <button
                        className={`
                            ${styles.copyButton}
                            ${copyStatus === 'Copied!' ? styles.copyButtonSuccess : ''}
                            ${copyStatus === 'Error!' ? styles.copyButtonError : ''}
                            ${copyStatus === 'Copy' ? styles.copyButtonDefault : ''}
                        `}
                        disabled={!referralLink}
                        aria-label="Copy referral link"
                    >
                        {copyStatus}
                    </button>
                </div>
            </div>

            {/* --- حاوية الأربعة أعمدة للإحصائيات --- */}
            <div className={styles.statsGrid}>
                {/* استخدام ?? '0' لضمان عرض قيمة حتى لو كانت الحقول غير موجودة (احتياطي) */}
                <div className={styles.statCard}>
                    <p className={`${styles.statLabel} gradient-text-bold`}>Accounts Closed</p>
                    <p className={styles.statValue}>{(referralInfo.weeklyClosedAccounts ?? 0).toLocaleString()}</p>
                    <p className={styles.statPeriod}>(Weekly)</p>
                </div>
                 <div className={styles.statCard}>
                    <p className={`${styles.statLabel} gradient-text-bold`}>New Referrals</p>
                    <p className={styles.statValue}>{(referralInfo.weeklyReferralsCount ?? 0).toLocaleString()}</p>
                    <p className={styles.statPeriod}>(Weekly)</p>
                 </div>
                 <div className={styles.statCard}>
                    <p className={`${styles.statLabel} gradient-text-bold`}>Accounts Closed</p>
                    <p className={styles.statValue}>{(referralInfo.closedAccounts ?? 0).toLocaleString()}</p>
                    <p className={styles.statPeriod}>(Lifetime)</p>
                 </div>
                 <div className={styles.statCard}>
                    <p className={`${styles.statLabel} gradient-text-bold`}>Total Referrals</p>
                    <p className={styles.statValue}>{(referralInfo.referralsCount ?? 0).toLocaleString()}</p>
                    <p className={styles.statPeriod}>(Lifetime)</p>
                 </div>
            </div>
           
            
            {/* --- الجملة التحفيزية الجديدة (مقسمة على أسطر) --- */}
            <div className={styles.leaderboardPrompt}>
                    <p className={styles.promptLine1}>
                        🏆 Keep an eye on the Weekly Leaderboards below! 👇
                    </p>
                    {/* السطر الثاني: النص قبل الروابط */}
                    <p className={styles.promptLine2TextOnly}>
                        Winners announced here & on
                    </p>
                    {/* حاوية جديدة للروابط والأيقونات فقط */}
                    <div className={styles.promptSocialLinksContainer}>
                        <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className={styles.socialIconLink} aria-label="Telegram">
                            <TelegramIcon className={styles.promptSocialIcon} />
                        </a>
                        <a href={TWITTER_PROFILE_URL} target="_blank" rel="noopener noreferrer" className={styles.socialIconLink} aria-label="X (Twitter)">
                            <TwitterIcon className={styles.promptSocialIcon} />
                        </a>
                    </div>
                    {/* السطر الثالث */}
                    <p className={styles.promptLine3}>
                        Aim for the top! 💸🎉
                    </p>
                </div>
        </div>
    );
};

export default ReferralDashboard;

