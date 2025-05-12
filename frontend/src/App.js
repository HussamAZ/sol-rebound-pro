// src/App.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'; // <-- الصحيح لـ web3.jsimport axios from 'axios';
import { Buffer } from 'buffer';
import { useLocation } from 'react-router-dom';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'; // <-- استيراد من المكتبة الصحيحة
import axios from 'axios';
// ... other imports
import { ToastContainer, toast } from 'react-toastify'; // <-- استيراد جديد
import 'react-toastify/dist/ReactToastify.css';       // <-- استيراد أنماط CSS للمكتبة

// استيراد المكونات الجديدة
import Header from './components/Header/Header';
import AtaManager from './components/AtaManager/AtaManager';
import ReferralDashboard from './components/ReferralDashboard/ReferralDashboard';
import Leaderboards from './components/Leaderboards/Leaderboards';
import Footer from './components/Footer/Footer';
import CountdownTimer from './components/CountdownTimer/CountdownTimer'; // <-- أضف هذا
import ProjectStats from './components/ProjectStats/ProjectStats'; // <-- استيراد جديد

import apiClient from './api/axiosInstance'; // <-- صحيح الآن

// التأكد من تعريف Buffer عالميًا (قد لا يكون ضروريًا مع craco لكنه لا يضر)
window.Buffer = window.Buffer || Buffer;

// تعريف الثوابت العامة للتطبيق
// const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'); // معرف سابقًا في AtaManager

function App() {
    // === Hooks الأساسية ===
    const { connection } = useConnection();
    const { connected, publicKey, signTransaction } = useWallet(); // نحتاج هذه للتحقق والتمرير
    const location = useLocation();

    // === الحالة (State) ===

    // -- حالة عامة للأخطاء والإشعارات --
    const [error, setError] = useState('');
    const [lastSignature, setLastSignature] = useState('');

    // -- حالة متعلقة بالمستخدم والإحالة --
    const [referrerFromUrl, setReferrerFromUrl] = useState(null);
    const [referralInfo, setReferralInfo] = useState(null);
    const [loadingReferralInfo, setLoadingReferralInfo] = useState(false);

    // -- حالة متعلقة بقائمة ATAs (تُدار هنا وتُمرر لـ AtaManager) --
    const [emptyATAsForManager, setEmptyATAsForManager] = useState([]);
    const [loadingAtasForManager, setLoadingAtasForManager] = useState(false);

    // -- حالة متعلقة بالمتصدرين --
    const [topReferrers, setTopReferrers] = useState([]);
    const [loadingTopReferrers, setLoadingTopReferrers] = useState(false);
    const [topClosers, setTopClosers] = useState([]);
    const [loadingTopClosers, setLoadingTopClosers] = useState(false);
    const [leaderboardError, setLeaderboardError] = useState('');

    const [initialUserSetupAttempted, setInitialUserSetupAttempted] = useState(false);
    // === Logic / Callbacks ===

    // 1. قراءة المحيل من URL عند تغير مسار الصفحة
    useEffect(() => {
        console.log("App: Parsing URL for referrer...");
        const queryParams = new URLSearchParams(location.search);
        const ref = queryParams.get('ref');
        if (ref) {
            try {
                new PublicKey(ref);
                console.log("App: Referrer found in URL:", ref);
                setReferrerFromUrl(ref);
            } catch (e) {
                console.warn("App: Invalid referrer key in URL. Ignoring.");
                setReferrerFromUrl(null);
            }
        } else {
            console.log("App: No referrer found in URL.");
            setReferrerFromUrl(null);
        }
    }, [location.search]);

    // *** useEffect جديد لتهيئة سجل المستخدم عند أول توصيل ***
    useEffect(() => {
        const initializeUserRecord = async () => {
            // نفذ فقط إذا كانت المحفظة متصلة، هناك مفتاح عام، ولم يتم محاولة الإعداد بعد
            if (connected && publicKey && !initialUserSetupAttempted) {
                console.log("App: Wallet connected. Attempting to initialize user record on backend...");
                setInitialUserSetupAttempted(true); // ضع علامة أنه تم محاولة الإعداد
                try {
                    const response = await apiClient.post('/users/initialize', {
                        userPublicKeyString: publicKey.toBase58(),
                        potentialReferrer: referrerFromUrl // المحيل من URL الحالي (قد يكون null)
                    });
                    if (response.data?.success) {
                        console.log("App: User record initialization/check request successful:", response.data.message);
                    } else {
                        console.warn("App: User record initialization/check request failed on backend:", response.data?.error);
                    }
                } catch (err) {
                    console.error("App: Network error sending user initialization request:", err.response?.data?.error || err.message);
                    // لا يجب أن يوقف هذا عمل التطبيق، فقط سجل الخطأ
                    // يمكن إظهار toast للمستخدم إذا كان الخطأ حرجًا
                }
            }
        };
        initializeUserRecord();
    }, [connected, publicKey, referrerFromUrl, initialUserSetupAttempted]); // الاعتماديات


    // 2. دالة جلب بيانات لوحة تحكم الإحالة
    const fetchReferralInfo = useCallback(async () => {
        if (!publicKey || !connected) {
            setReferralInfo(null); // مسح البيانات عند عدم الاتصال
            return;
        }
        setLoadingReferralInfo(true);
        // setError(''); // لا تمسح الخطأ العام هنا بالضرورة
        try {
            console.log("App: Fetching referral info...");
            const response = await apiClient.get(`/referrals/info?user=${publicKey.toBase58()}`); // إزالة /api
            if (response.data?.success && response.data.data) {
                setReferralInfo(response.data.data); // الخدمة تُرجع دائمًا كائنًا
            } else {
                console.warn("App: Failed to fetch referral info:", response.data?.error);
                setReferralInfo(null); // التعامل مع فشل الخادم
                // setError(prev => `${prev} | Failed to load referral data.`.trim());
            }
        } catch (err) {
            console.error("App: Network error fetching referral info:", err);
            setError(prev => `${prev} | Network error loading referral data.`.trim());
            setReferralInfo(null);
        } finally {
            setLoadingReferralInfo(false);
        }
    }, [publicKey, connected]); // إعادة الجلب عند تغير المستخدم أو الاتصال

    // 3. دالة اكتشاف ATAs الفارغة (تُستخدم هنا وتُمرر نتيجتها)
    const detectEmptyATAs = useCallback(async () => {
        if (!publicKey || !connection || !connected) {
            setEmptyATAsForManager([]); // مسح عند عدم الاتصال
            return;
        }
        console.log("App: Detecting empty ATAs...");
        setLoadingAtasForManager(true);
        // setError(''); // لا تمسح الخطأ العام هنا بالضرورة
        try {
            const parsedTokenAccounts = await connection.getParsedTokenAccountsByOwner(
                publicKey, { programId: TOKEN_PROGRAM_ID }
            );
            const foundEmptyATAs = parsedTokenAccounts.value
                .filter(acc => acc.account.data.parsed?.type === 'account' && acc.account.data.parsed?.info?.tokenAmount?.amount === '0')
                .map(acc => acc.pubkey.toBase58());
            setEmptyATAsForManager(foundEmptyATAs); // تحديث الحالة التي ستمرر
            console.log("App: Detected empty ATAs count:", foundEmptyATAs.length);
        } catch (err) {
            console.error("App Error detecting ATAs:", err);
            setError(prev => `${prev} | Failed to detect accounts: ${err.message}`.trim());
            setEmptyATAsForManager([]); // مسح عند الخطأ
        } finally {
            setLoadingAtasForManager(false);
        }
    }, [publicKey, connection, connected ]); // الاعتماديات الصحيحة

    // 4. دوال جلب بيانات المتصدرين
    const fetchTopReferrers = useCallback(async () => {
        setLoadingTopReferrers(true);
        setLeaderboardError(''); // مسح خطأ المتصدرين قبل البدء
        try {
            console.log("App: Fetching top referrers...");
            const response = await apiClient.get('/leaderboards/top-referrers'); // إزالة /api
            if (response.data?.success) {
                setTopReferrers(response.data.data || []);
            } else {
                console.warn("App: Failed to fetch top referrers:", response.data?.error);
                setLeaderboardError(prev => `${prev} | Failed to load top referrers.`.trim());
                setTopReferrers([]);
            }
        } catch (err) {
            console.error("App: Network error fetching top referrers:", err);
            setLeaderboardError(prev => `${prev} | Network error loading top referrers.`.trim());
            setTopReferrers([]);
        } finally {
            setLoadingTopReferrers(false);
        }
    }, []);

    const fetchTopClosers = useCallback(async () => {
        setLoadingTopClosers(true);
        setLeaderboardError('');
        try {
            console.log("App: Fetching top closers...");
            const response = await apiClient.get('/leaderboards/top-closers'); // إزالة /api
            if (response.data?.success) {
                setTopClosers(response.data.data || []);
            } else {
                console.warn("App: Failed to fetch top closers:", response.data?.error);
                setLeaderboardError(prev => `${prev} | Failed to load top closers.`.trim());
                setTopClosers([]);
            }
        } catch (err) {
            console.error("App: Network error fetching top closers:", err);
            setLeaderboardError(prev => `${prev} | Network error loading top closers.`.trim());
            setTopClosers([]);
        } finally {
            setLoadingTopClosers(false);
        }
    }, []);

    // 5. التأثير الرئيسي لجلب كل البيانات عند الاتصال
    useEffect(() => {
        if (publicKey && connected && connection) {
          console.log("App: Wallet connected, fetching user-specific data (ATAs, Referral Info)...");
          setError('');
          detectEmptyATAs();
          fetchReferralInfo();
          // المتصدرين يتم جلبهم بشكل منفصل
          } else {
              console.log("App: Wallet disconnected, clearing relevant user-specific data...");
              setReferralInfo(null);
              setEmptyATAsForManager([]);
              // لا تمسح المتصدرين هنا، فهم ليسوا خاصين بالمستخدم
              // أيضًا، لا تمسح initialUserSetupAttempted للسماح بمحاولة التهيئة مرة أخرى إذا أعيد الاتصال في نفس الجلسة
          }
      }, [publicKey, connected, connection, detectEmptyATAs, fetchReferralInfo]);

    // 6. دالة Callback لتحديث البيانات (تُمرر لـ AtaManager)
    const refreshAllData = useCallback((refreshLeaderboards = true) => { // إضافة خيار لتحديث المتصدرين
      console.log("App: Refreshing data...");
      if (connected && publicKey) { // جلب بيانات المستخدم فقط إذا كان متصلاً
           detectEmptyATAs();
           fetchReferralInfo();
      }
      if (refreshLeaderboards) { // تحديث المتصدرين دائمًا أو عند الطلب
           fetchTopReferrers();
           fetchTopClosers();
      }
      // تحديث الاعتماديات
    }, [connected, publicKey, detectEmptyATAs, fetchReferralInfo, fetchTopReferrers, fetchTopClosers]);

  // --- التأثير لجلب بيانات المستخدم عند الاتصال ---
    // هذا ليس بالضرورة الحل لمشكلة 429
    useEffect(() => {
        console.log("App: Fetching initial leaderboard data on mount...");
        fetchTopReferrers();
        fetchTopClosers();
        //fetchProjectStats(); // <-- إضافة جلب الإحصائيات هنا
        const intervalId = setInterval(() => { // <-- تفعيل المؤقت
            console.log("App: Refreshing leaderboards periodically...");
            fetchTopReferrers();
            fetchTopClosers();
        }, 5 * 60 * 1000);
        return () => clearInterval(intervalId);
    }, [fetchTopReferrers, fetchTopClosers]); // <-- إضافة fetchProjectStats للاعتماديات


    // === العرض (Render JSX) ===
    return (
        // يمكنك إضافة حاوية رئيسية أو Layout هنا إذا أردت
        <div>
            {/* 1. تمرير الحالات المطلوبة للهيدر */}
            <Header
                error={error}
                lastSignature={lastSignature}
                // لا تحتاج لتمرير connected, publicKey, etc. لأن Header يستخدم Hooks مباشرة
            />

            {/* 2. تمرير الحالات والدوال المطلوبة لـ AtaManager */}
            {/* يتم عرض AtaManager فقط إذا كانت المحفظة متصلة (التحقق داخل AtaManager) */}
            <AtaManager
                setError={setError} // لتحديث الخطأ العام
                setLastSignature={setLastSignature} // لتحديث آخر توقيع
                referrerFromUrl={referrerFromUrl} // تمرير المحيل من URL
                onSuccessfulClose={refreshAllData} // دالة التحديث بعد الإغلاق
                initialEmptyAtas={emptyATAsForManager} // قائمة ATAs الحالية
                isLoadingAtas={loadingAtasForManager} // حالة تحميل قائمة ATAs
                // AtaManager سيستخدم Hooks للحصول على connection, publicKey, signTransaction
            />

            {/* 3. تمرير الحالات المطلوبة لـ ReferralDashboard */}
            {/* يتم عرضه فقط إذا كانت المحفظة متصلة (التحقق داخل Dashboard) */}
            <ReferralDashboard
                setError={setError}
                referralInfo={referralInfo}       // <-- تمرير الحالة
                loadingInfo={loadingReferralInfo} // <-- تمرير حالة التحميل
                onSuccessfulWithdraw={refreshAllData} // <-- تمرير دالة التحديث
                
            />
            <ProjectStats />
            {/* === إضافة ساعة العد التنازلي === */}
            <CountdownTimer />
            {/* ================================ */}
            {/* 4. تمرير الحالات المطلوبة لـ Leaderboards */}
            {/* يمكن عرضه دائمًا أو فقط عند الاتصال، حسب التصميم */}
            <Leaderboards
                topReferrers={topReferrers} // تأكد من أن هذه هي الحالة الصحيحة
                loadingTopReferrers={loadingTopReferrers} // تأكد من الاسم
                topClosers={topClosers} // تأكد من الاسم
                loadingTopClosers={loadingTopClosers} // تأكد من الاسم
                leaderboardError={leaderboardError} // تأكد من الاسم
            />


            {/* 5. الفوتر */}
            <Footer />
            {/* === حاوية إشعارات Toast (توضع مرة واحدة) === */}
            <ToastContainer
                position="bottom-right" // أو "top-right", "top-center", etc.
                autoClose={5000} // مدة بقاء الإشعار (5 ثواني)
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="dark" // أو "light" أو "colored"
            />
        </div>
    );
}

export default App;