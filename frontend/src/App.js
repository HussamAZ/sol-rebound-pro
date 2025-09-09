// src/App.js

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header/Header';
import AtaManager from './components/AtaManager/AtaManager';
import ReferralDashboard from './components/ReferralDashboard/ReferralDashboard';
import Leaderboards from './components/Leaderboards/Leaderboards';
import Footer from './components/Footer/Footer';
import CountdownTimer from './components/CountdownTimer/CountdownTimer';
import ProjectStats from './components/ProjectStats/ProjectStats';
import PrivacyPolicyPage from './components/PrivacyPolicyPage/PrivacyPolicyPage';
import TermsAndConditionsPage from './components/TermsAndConditionsPage/TermsAndConditionsPage';
// تم حذف import لـ LandingPage
import apiClient from './api/axiosInstance';
import './wallet-adapter-overrides.css';

window.Buffer = window.Buffer || Buffer;

// تم حذف متغير وقت الإطلاق

function App() {
    const { connection } = useConnection();
    const { wallet, publicKey, connected, connecting, disconnect } = useWallet();
    const location = useLocation();

    // --- State hooks ---
    // تم حذف حالة isAppLive
    const [lastSignature, setLastSignature] = useState('');
    const [referrerFromUrl, setReferrerFromUrl] = useState(null);
    const [referralInfo, setReferralInfo] = useState(null);
    const [loadingReferralInfo, setLoadingReferralInfo] = useState(false);
    const [initialUserSetupAttempted, setInitialUserSetupAttempted] = useState(false);
    const [emptyATAsForManager, setEmptyATAsForManager] = useState([]);
    const [loadingAtasForManager, setLoadingAtasForManager] = useState(false);
    const [topReferrers, setTopReferrers] = useState([]);
    const [loadingTopReferrers, setLoadingTopReferrers] = useState(false);
    const [topClosers, setTopClosers] = useState([]);
    const [loadingTopClosers, setLoadingTopClosers] = useState(false);
    const [leaderboardError, setLeaderboardError] = useState('');
    const [urlRefChecked, setUrlRefChecked] = useState(false); // <-- حالة جديدة


    // --- تم حذف useEffect الخاص بالتحقق من وقت الإطلاق ---

    // --- 2. قراءة referrer من URL (يبقى كما هو) ---
    useEffect(() => {
        const qs = new URLSearchParams(location.search);
        const ref = qs.get('ref');
        
        // ببساطة، اقرأ القيمة وضعها في الحالة. لا تقم بأي تحقق هنا.
        setReferrerFromUrl(ref || null); 

        setUrlRefChecked(true); // أخبر التطبيق أننا انتهينا
    }, [location.search]);
    // --- 3. دوال جلب البيانات وإدارة الحساب (تبقى كما هي) ---

    const fetchReferralInfo = useCallback(async () => {
        if (!publicKey) return;
        setLoadingReferralInfo(true);
        try {
            const res = await apiClient.get(`/referrals/info?user=${publicKey.toBase58()}`);
            setReferralInfo(res.data?.data || null);
        } catch (err) {
            console.error("Network error fetching referral info:", err);
            toast.error("Network error loading referral data.");
            setReferralInfo(null);
        } finally {
            setLoadingReferralInfo(false);
        }
    }, [publicKey]);

    const detectEmptyATAs = useCallback(async () => {
        if (!publicKey || !connection) return;
        setLoadingAtasForManager(true);
        try {
            const accounts = await connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID }
            );
            const empty = accounts.value
                .filter(acc =>
                    acc.account.data.parsed?.info?.tokenAmount?.amount === '0'
                )
                .map(acc => acc.pubkey.toBase58());
            setEmptyATAsForManager(empty);
        } catch (err) {
            console.error("Error detecting ATAs:", err);
            toast.error(`Failed to detect accounts: ${err.message}`);
            setEmptyATAsForManager([]);
        } finally {
            setLoadingAtasForManager(false);
        }
    }, [publicKey, connection]);

    const initializeUserRecord = useCallback(async () => {
        // **الشرط الجديد:** لا تعمل إلا إذا كنا متصلين، ولم نحاول من قبل، وانتهينا من فحص الـ URL
        if (!publicKey || initialUserSetupAttempted || !urlRefChecked) return; 

        setInitialUserSetupAttempted(true);
        try {
            console.log(`Initializing user with referrer from URL: ${referrerFromUrl}`); // <-- أضف هذا السجل للتصحيح
            await apiClient.post('/users/initialize', {
                userPublicKeyString: publicKey.toBase58(),
                potentialReferrer: referrerFromUrl
            });
        } catch (err) {
            console.error("Network error on user initialization:", err);
        }
    }, [publicKey, referrerFromUrl, initialUserSetupAttempted, urlRefChecked]); // <-- أضف urlRefChecked

    // --- 4. فصل الاتصال عند إغلاق الصفحة (يبقى كما هو بناءً على طلبك) ---
    useEffect(() => {
        const handleDisconnect = () => {
            if (connected) {
                disconnect().catch(console.error);
            }
        };
        window.addEventListener('beforeunload', handleDisconnect);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                handleDisconnect();
            }
        });
        return () => {
            window.removeEventListener('beforeunload', handleDisconnect);
            document.removeEventListener('visibilitychange', handleDisconnect);
        };
    }, [connected, disconnect]);

    // --- 5. إدارة الربط وفصل المحفظة (يبقى كما هو) ---
    useEffect(() => {
        if (connected && publicKey && wallet) {
            console.log("Wallet connected — initializing user & fetching data");
            initializeUserRecord();
            detectEmptyATAs();
            fetchReferralInfo();
        } else if (!connected && !connecting) {
            console.log("Wallet disconnected — clearing user data");
            setReferralInfo(null);
            setEmptyATAsForManager([]);
            setLastSignature('');
            setInitialUserSetupAttempted(false);
        }
    }, [connected, connecting, publicKey, wallet, initializeUserRecord, detectEmptyATAs, fetchReferralInfo]);

    // --- 6. جلب بيانات القوائم (يبقى كما هو) ---
    const fetchTopReferrers = useCallback(async () => {
        setLoadingTopReferrers(true);
        setLeaderboardError('');
        try {
            const res = await apiClient.get('/leaderboards/top-referrers');
            if (res.data?.success) {
                setTopReferrers(res.data.data);
            } else {
                setLeaderboardError('Failed to load top referrers.');
                setTopReferrers([]);
            }
        } catch (err) {
            console.error("Error loading top referrers:", err);
            setLeaderboardError('Network error loading top referrers.');
            setTopReferrers([]);
        } finally {
            setLoadingTopReferrers(false);
        }
    }, []);

    const fetchTopClosers = useCallback(async () => {
        setLoadingTopClosers(true);
        setLeaderboardError(prev => prev.replace(/top closers/i, '').trim());
        try {
            const res = await apiClient.get('/leaderboards/top-closers');
            if (res.data?.success) {
                setTopClosers(res.data.data);
            } else {
                setLeaderboardError(prev => `${prev} Failed to load top closers.`.trim());
                setTopClosers([]);
            }
        } catch (err) {
            console.error("Error loading top closers:", err);
            setLeaderboardError(prev => `${prev} Network error loading top closers.`.trim());
            setTopClosers([]);
        } finally {
            setLoadingTopClosers(false);
        }
    }, []);

    // --- 7. تحديث دوري للقوائم (تم حذف شرط isAppLive) ---
    useEffect(() => {
        fetchTopReferrers();
        fetchTopClosers();
        const iv = setInterval(() => {
            fetchTopReferrers();
            fetchTopClosers();
        }, 5 * 60 * 1000);
        return () => clearInterval(iv);
    }, [fetchTopReferrers, fetchTopClosers]);

    // --- 8. واجهة المستخدم (Render) ---
    // تم حذف الشرط الخاص بـ isAppLive
    return (
        <div>
            <Header lastSignature={lastSignature} />
            <Routes>
                <Route path="/" element={
                    <>
                        <AtaManager
                            setLastSignature={setLastSignature}
                            referrerFromUrl={referrerFromUrl}
                            onSuccessfulClose={() => {
                                detectEmptyATAs();
                                fetchReferralInfo();
                                fetchTopReferrers();
                                fetchTopClosers();
                            }}
                            initialEmptyAtas={emptyATAsForManager}
                            isLoadingAtas={loadingAtasForManager}
                        />
                        <ReferralDashboard
                            referralInfo={referralInfo}
                            loadingInfo={loadingReferralInfo}
                        />
                        <ProjectStats />
                        <CountdownTimer />
                        <Leaderboards
                            topReferrers={topReferrers}
                            loadingTopReferrers={loadingTopReferrers}
                            topClosers={topClosers}
                            loadingTopClosers={loadingTopClosers}
                            leaderboardError={leaderboardError}
                        />
                    </>
                } />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
            </Routes>
            <Footer />
            <ToastContainer
                position="bottom-right"
                autoClose={5000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="dark"
            />
        </div>
    );
}

export default App;

