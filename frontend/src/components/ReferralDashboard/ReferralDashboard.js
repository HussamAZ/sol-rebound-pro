// src/components/ReferralDashboard/ReferralDashboard.js
import React, { useState, useCallback, useMemo } from 'react'; // أزلنا useEffect
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';
import styles from './ReferralDashboard.module.css';
import { toast } from 'react-toastify';

import apiClient from '../../api/axiosInstance'; // <-- المسار الصحيح

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

    // إنشاء رابط الإحالة الديناميكي (يعتمد على publicKey)
    const referralLink = useMemo(() => {
        if (!publicKey) return '';
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/?ref=${publicKey.toBase58()}`;
        }
        return '';
    }, [publicKey]);

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

    // دالة معالجة سحب الأرباح (تعتمد الآن على referralInfo الممرر)
    const handleWithdraw = useCallback(async () => {
        // التحقق من الشروط باستخدام referralInfo الممرر
        if (!publicKey || !connected || !referralInfo || (referralInfo.totalEarningsSol ?? 0) < MIN_REFERRAL_WITHDRAW_SOL) {
            setError("Cannot withdraw: Connect wallet and ensure minimum balance is met.");
            return;
        }
        if (isWithdrawing) return; // منع السحب المتعدد

        setIsWithdrawing(true);
        //setError(''); // مسح الأخطاء قبل البدء

        try {
            console.log("ReferralDashboard: Sending withdrawal request...");
            const response = await apiClient.post('/referrals/withdraw', {
                userPublicKeyString: publicKey.toBase58()
            });

            if (response.data?.success) {
                //alert(`Successfully withdrew ${response.data.amountSol?.toFixed(8)} SOL! Data will refresh.`); // إشعار بسيط
                // استدعاء دالة التحديث الشامل من App.js إذا تم تمريرها
                toast.success(`Successfully withdrew ${response.data.amountSol?.toFixed(8)} SOL!`); // <-- Toast نجاح
                if (onSuccessfulWithdraw && typeof onSuccessfulWithdraw === 'function') {
                    console.log("ReferralDashboard: Calling onSuccessfulWithdraw callback.");
                    onSuccessfulWithdraw();
                } else {
                    // كحل بديل إذا لم يتم تمرير الدالة، يمكن إعادة تحميل الصفحة
                    console.warn("ReferralDashboard: onSuccessfulWithdraw callback not provided. Reloading page as fallback.");
                    window.location.reload();
                }
            } else {
                // رمي خطأ إذا فشل الـ backend
                throw new Error(response.data?.error || "Withdrawal failed on backend.");
            }
        } catch (error) {
            console.error("ReferralDashboard Error during withdrawal:", error);
            let displayError = 'An error occurred during withdrawal.';
            if (axios.isAxiosError(error)) {
                displayError = `Withdrawal Failed (${error.response?.status || 'N/A'}): ${error.response?.data?.error || error.message}`;
            } else {
                 displayError = error.message;
            }
            //setError(displayError); // عرض الخطأ باستخدام setError الممرر
            toast.error(`Withdrawal Failed: ${displayError}`); // <-- Toast خطأ
        } finally {
            setIsWithdrawing(false); // إنهاء حالة المعالجة دائمًا
        }
    // الاعتماديات: publicKey, connected, referralInfo, isWithdrawing, setError, onSuccessfulWithdraw
    }, [publicKey, connected, referralInfo, isWithdrawing, setError, onSuccessfulWithdraw]);


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
           
            {/* --- قسم السحب --- */}
            <div className={styles.withdrawSection}>
                <p className={styles.earningsText}>
                    <strong className="gradient-text-bold">Accumulated Earnings (Lifetime): </strong>
                    <span className={styles.earningsValue}>
                        {(referralInfo.totalEarningsSol ?? 0).toFixed(8)} SOL
                    </span>
                    <span className={styles.lamportsValue}>
                        ({(referralInfo.totalEarningsLamports ?? 0).toLocaleString()} Lamports)
                    </span>
                </p>
                
            </div>
        </div>
    );
};

export default ReferralDashboard;