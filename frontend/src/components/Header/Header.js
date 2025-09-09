// src/components/Header/Header.js
import React, { useMemo, useCallback, useState, useEffect } from 'react'; // أضف useState, useEffect
import { Link } from 'react-router-dom'; // <-- 1. استيراد Link
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import styles from './Header.module.css'; // استيراد CSS Module

// نقل دالة اختصار العنوان هنا أو إلى ملف utils
const shortenAddress = (address) => {
    if (!address) return null;
    const base58 = address.toString(); // تأكد من أنه سلسلة نصية
    return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
};

// تعريف Props التي سيستقبلها المكون
// (يمكن استخدام TypeScript هنا لتعريف الأنواع بشكل أفضل)
const Header = ({ error, lastSignature }) => {
    // الحصول على ما نحتاجه من useWallet و useWalletModal
    const { connected, connecting, publicKey, disconnect, wallet } = useWallet();
    const { visible: modalVisible, setVisible: setModalVisible } = useWalletModal();

    // حساب العنوان المختصر
    const shortAddress = useMemo(() => shortenAddress(publicKey?.toBase58()), [publicKey]);

    const [showMobileWarning, setShowMobileWarning] = useState(false);
    const [showMobileGuidance, setShowMobileGuidance] = useState(false)
    const [appUrlForCopy, setAppUrlForCopy] = useState(''); // <-- حالة جديدة لتخزين الرابط للنسخ
    const [copyButtonText, setCopyButtonText] = useState('Copy App Link'); // <-- حالة لنص زر النسخ

    // --- !!! useEffect لاكتشاف المتصفح !!! ---
    useEffect(() => {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isMobileDeviceCurrent = /android|iPhone|iPad|iPod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());

        // التحقق مما إذا كنا داخل متصفح Phantom (قد يحتاج هذا للتحقق من وثائق Phantom أو Wallet Adapter)
        // طريقة شائعة هي التحقق من وجود كائن window.phantom أو من خاصية isPhantom في wallet adapter
        const isInPhantomBrowser = !!(window.phantom?.solana?.isPhantom || wallet?.adapter?.name?.toLowerCase().includes('phantom'));

        console.log("Mobile Detect:", { isMobileDevice: isMobileDeviceCurrent, isInPhantomBrowser, 
            adapterName: wallet?.adapter?.name });

        // أظهر التحذير فقط إذا كان على موبايل وليس داخل متصفح Phantom
        setShowMobileGuidance(isMobileDeviceCurrent && !isInPhantomBrowser);
        if (isMobileDeviceCurrent && !isInPhantomBrowser) {
            setAppUrlForCopy(window.location.href);
        } else {
            // (اختياري) مسح الرابط إذا لم تكن الإرشادات معروضة
            // setAppUrlForCopy('');
        }

    }, [wallet]); // أعد التحقق إذا تغير كائن المحفظة (قد يحدث عند الاتصال)

    // دالة لفتح نافذة اختيار المحفظة
    const handleConnectClick = useCallback(() => {
        if (!publicKey && !connecting && !connected) {
            setModalVisible(true);
        }
    }, [setModalVisible, publicKey, connecting, connected]);

    // دالة لعرض رابط Explorer (مثال)
    const getExplorerLink = (signature) => {
        // استخدم cluster=devnet أو mainnet-beta حسب الشبكة
        return `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`;
    }

    const handleOpenInPhantom = useCallback(() => {
        try {
            const currentUrl = window.location.href; // رابط الصفحة الحالية (بما في ذلك أي بارامترات مثل ?ref=...)
            const encodedUrl = encodeURIComponent(currentUrl);
            const phantomDeepLink = `phantom://browse/${encodedUrl}`;
            console.log("Attempting to open Phantom with URL:", phantomDeepLink);
            window.location.href = phantomDeepLink; // محاولة فتح الرابط العميق
        } catch (err) {
            console.error("Error trying to generate or open Phantom deep link:", err);
            // يمكنك إضافة رسالة خطأ للمستخدم هنا إذا فشلت عملية التوجيه
            alert("Could not automatically open Phantom. Please open Phantom browser manually and navigate to the site.");
        }
    }, []);

    const handleCopyAppUrl = useCallback(() => {
        if (!appUrlForCopy) return;
        navigator.clipboard.writeText(appUrlForCopy)
            .then(() => {
                setCopyButtonText('Copied!');
                setTimeout(() => setCopyButtonText('Copy App Link'), 2000);
            })
            .catch(err => {
                console.error("Failed to copy app URL:", err);
                setCopyButtonText('Error!');
                setTimeout(() => setCopyButtonText('Copy App Link'), 2000);
                alert("Failed to copy link. Please copy it manually.");
            });
    }, [appUrlForCopy]);

    return (
        // استخدم Fragment لتغليف الهيدر والتحذير
        <>
            <div className={`${styles.headerContainer} glass-effect container`}> {/* تطبيق الفئة العامة والفئة الخاصة بالهيدر */}
                <div className={styles.header}>
                    {/* القسم الأيسر: الشعار */}
                    <div className={styles.leftSection}>
                        {/* --- 2. تغليف الشعار بمكون Link --- */}
                        <Link to="/" className={styles.logoLink}> {/* أضفت فئة logoLink للتحكم في النمط إذا لزم الأمر */}
                            <img src="/sol_reb.png" alt="SOL Rebound Pro Logo" className={styles.projectLogo} />
                        </Link>
                        {/* ------------------------------------ */}
                    </div>

                    {/* القسم المركزي: معلومات المحفظة */}
                    <div className={styles.centerSection}>
                        {connected && publicKey ? (
                            // هذا الجزء يظهر عندما تكون المحفظة متصلة (يبقى كما هو)
                            <div className={styles.walletInfo}>
                                <span>{shortAddress}</span>
                            </div>
                        ) : (
                             // هذا الجزء الجديد يظهر عندما لا تكون المحفظة متصلة
                            <h2 className={`${styles.promoText} gradient-text-bold`}>
                                Scan & claim lost SOL in 60 secs! + Earn 25% SOL cash PER REFERRAL!
                            </h2>
                        )}
                    </div>

                    {/* القسم اليميني: أزرار الاتصال/الفصل */}
                    <div className={styles.rightSection}>
                        {!connected ? (
                            <button
                                onClick={handleConnectClick}
                                disabled={connecting}
                                className={styles.connectWalletButton}
                                style={{  // إضافة ستايل إضافي لو أردت
                                    backgroundColor: '#FF6B00', 
                                    fontWeight: 'bold'
                                }}
                            >
                                {connecting ? 'Connecting...' : 'GET YOUR SOL NOW!🔥'}
                            </button>
                        ) : (
                            <button className={styles.disconnectButton} onClick={disconnect}>
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>

                {/* عرض الأخطاء ورسالة آخر معاملة */}
                {/* نقل هذا الجزء إلى مكان أنسب ربما تحت الهيدر أو في مكون إشعارات */}
                {error && <p className={styles.errorMessage} style={{ color: '#ff4d4d', textAlign: 
                    'center', marginTop: '10px', padding: '0 1rem', fontSize: '0.9em' }}>Error: {error}</p>}
                {lastSignature && ( 
                    <p className={styles.successMessage} style={{ color: '#93fc8b', textAlign: 
                        'center', marginTop: '10px', wordBreak: 'break-all', padding: '0 1rem', fontSize: '0.9em' }}>
                        Last Close Tx: 
                        <a 
                            href={getExplorerLink(lastSignature)} target="_blank" rel="noopener noreferrer" 
                            style={{ color: '#93fc8b', textDecoration: 'underline' }}>{shortenAddress(lastSignature)}
                        </a>
                    </p> 
                )}
            </div>
        </>
    );
};

export default Header;
