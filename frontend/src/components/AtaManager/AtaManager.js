// src/components/AtaManager/AtaManager.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TOKEN_PROGRAM_ID } from '@solana/web3.js'; // استيراد TOKEN_PROGRAM_ID هنا
import axios from 'axios';
import { Buffer } from 'buffer';
import styles from './AtaManager.module.css';
import { toast } from 'react-toastify';

import apiClient from '../../api/axiosInstance'; // <-- المسار الصحيح



// تعريف Props المستلمة من App.js
const AtaManager = ({
    setError,               // دالة لتحديث الخطأ العام في App
    setLastSignature,       // دالة لتحديث آخر توقيع في App
    referrerFromUrl,        // المحيل من URL
    onSuccessfulClose,      // دالة لتشغيل التحديث الشامل في App
    initialEmptyAtas,       // قائمة ATAs المكتشفة من App
    isLoadingAtas           // حالة تحميل قائمة ATAs من App
}) => {
    // === Hooks ===
    const { connection } = useConnection(); // نحتاج connection للإرسال والتأكيد
    const { publicKey, connected, signTransaction } = useWallet(); // نحتاج هذه لتشغيل العملية
    // --- !! انقل التعريفات إلى هنا !! ---
    const RENT_PER_EMPTY_ATA_SOL = 0.00203928;
    const PLATFORM_FEE_PERCENT = 0.25; // للعرض فقط
    // ---------------------------------
    // === الحالة الداخلية للمكون ===
    const [emptyATAs, setEmptyATAs] = useState(initialEmptyAtas || []); // القائمة الفعلية للعرض
    const [selectedATAs, setSelectedATAs] = useState([]);           // القائمة المختارة
    const [netSolForSelected, setNetSolForSelected] = useState(0);    // المبلغ المقدر
    const [isProcessing, setIsProcessing] = useState(false);        // هل عملية الإغلاق جارية؟

    // === Effects ===

    // تحديث قائمة emptyATAs الداخلية عند تغير الـ prop القادم من App
    useEffect(() => {
        console.log("AtaManager: Received new initialEmptyAtas count:", (initialEmptyAtas || []).length);
        setEmptyATAs(initialEmptyAtas || []);
        // مسح القائمة المختارة عند تحديث القائمة الرئيسية
        setSelectedATAs([]);
    }, [initialEmptyAtas]);

    // إعادة حساب المبلغ المقدر عند تغير القائمة المختارة
    useEffect(() => {
        const netRecoveryPerATA = RENT_PER_EMPTY_ATA_SOL * (1 - PLATFORM_FEE_PERCENT);
        const calculatedNetSol = selectedATAs.length * netRecoveryPerATA;
        setNetSolForSelected(calculatedNetSol);
        console.log(`AtaManager: Calculated net SOL for ${selectedATAs.length} selected ATAs: ${calculatedNetSol}`);
    }, [selectedATAs]);

    // === Callbacks ===

    // التعامل مع تغيير مربع الاختيار
    const handleCheckboxChange = useCallback((ata) => {
        setSelectedATAs(prevSelected =>
            prevSelected.includes(ata)
                ? prevSelected.filter(selectedAta => selectedAta !== ata)
                : [...prevSelected, ata]
        );
    }, []); // لا توجد اعتماديات متغيرة

    // التعامل مع زر "Select All"
    const handleSelectAll = useCallback(() => {
        // حدد فقط ما هو متاح وليس مختارًا بالفعل
        const availableToSelect = emptyATAs.filter(ata => !selectedATAs.includes(ata));
        setSelectedATAs(prevSelected => [...prevSelected, ...availableToSelect]);
    }, [emptyATAs, selectedATAs]); // أضف selectedATAs للاعتماديات هنا

    // التعامل مع زر "Deselect All"
    const handleDeselectAll = useCallback(() => {
        setSelectedATAs([]);
    }, []);

    // قائمة ATAs المتاحة (غير المختارة)
    const availableATAs = useMemo(() => {
        // التأكد من أن emptyATAs مصفوفة قبل الفلترة
        if (!Array.isArray(emptyATAs)) return [];
        return emptyATAs.filter(ata => !selectedATAs.includes(ata));
    }, [emptyATAs, selectedATAs]);

    // --- الدالة الرئيسية لإغلاق الحسابات ---
    const handleCloseAccounts = useCallback(async () => {
        console.log("TEST DEBUG: handleCloseAccounts triggered!"); // <--- أضف هذا
        // 1. التحققات الأولية
        if (!publicKey || !signTransaction || !connected || selectedATAs.length === 0) {
            setError("Please connect wallet and select at least one account to close.");
            return;
        }
        if (isProcessing) {
            console.warn("AtaManager: Close process already in progress.");
            return;
        }

        // 2. إعداد الحالة الأولية للمعالجة
        setIsProcessing(true);
        //setError('');
        setLastSignature('');

        const atasToClose = [...selectedATAs]; // إنشاء نسخة لتجنب التعديل المباشر
        let signature = '';

        try {
            // 3. تحضير بيانات الطلب
            const requestData = {
                userPublicKeyString: publicKey.toBase58(),
                ataAddresses: atasToClose,
                referrerPublicKeyString: referrerFromUrl
            };
            console.log("AtaManager: Sending close request...", requestData);

            // 4. استدعاء API التحضير
            const prepareResponse = await apiClient.post('/transactions/prepare-close', requestData); // إزالة /api
            if (!prepareResponse.data?.success || !prepareResponse.data.transaction || prepareResponse.data.platformFeeLamports === undefined) {
                throw new Error(prepareResponse.data?.error || 'Invalid response from prepare transaction API.');
            }
            const platformFeeFromBackend = prepareResponse.data.platformFeeLamports;
            const transactionBase64 = prepareResponse.data.transaction;
            console.log("AtaManager: Transaction prepared by backend.");

            // 5. تحويل وتوقيع المعاملة
            const transaction = Transaction.from(Buffer.from(transactionBase64, 'base64'));
            console.log("AtaManager: Requesting transaction signature from wallet...");
            const signedTx = await signTransaction(transaction);
            console.log("AtaManager: Transaction signed by user.");

            // 6. إرسال المعاملة للشبكة
            console.log("AtaManager: Sending signed transaction to network...");
            signature = await connection.sendRawTransaction(signedTx.serialize());
            setLastSignature(signature); // تحديث التوقيع العام
            console.log(`AtaManager: Transaction sent successfully. Signature: ${signature}`);

            // 7. تأكيد المعاملة
            console.log(`AtaManager: Confirming transaction ${signature}...`);
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            if (confirmation.value.err) {
                const confirmError = JSON.stringify(confirmation.value.err);
                console.error("AtaManager: Transaction confirmation failed on chain.", confirmError);
                throw new Error(`Transaction confirmation failed: ${confirmError}`);
            }
            console.log(`AtaManager: Transaction ${signature} confirmed successfully.`);
            toast.success(`Successfully closed ${atasToClose.length} account(s)!`); // <-- Toast نجاح//alert(`Successfully closed ${atasToClose.length} accounts! Transaction: ${signature}`); // إشعار بسيط

            // 8. إخطار الباك اند بنجاح المعاملة
            try {
                const confirmationData = { signature, userPublicKeyString: requestData.userPublicKeyString, referrerPublicKeyString: requestData.referrerPublicKeyString, closedCount: atasToClose.length, platformFeeLamportsString: platformFeeFromBackend };
                console.log("AtaManager: Sending confirmation to backend...", confirmationData);
                const dbUpdateResponse = await apiClient.post('/transactions/confirm-close', confirmationData); // إزالة /api
                if (!dbUpdateResponse.data?.success) {
                    console.warn("AtaManager: Backend DB update failed:", dbUpdateResponse.data?.error);
                    toast.warn("Backend stats update might be delayed."); // <-- Toast تحذير
                    //setError(prev => `${prev} | Backend stats update might be delayed.`.trim());
                } else {
                    console.log("AtaManager: Backend DB update successful.");
                }
            } catch (dbError) {
                console.error("AtaManager: Network error sending confirmation to backend:", dbError);
                toast.warn("Network error updating backend records."); // <-- Toast تحذير
               // setError(prev => `${prev} | Network error updating backend records. Stats might be delayed.`.trim());
            }

            // --- !!! 9. استدعاء دالة التحديث الشامل من App.js !!! ---
            console.log("AtaManager: Calling onSuccessfulClose callback...");
            if (onSuccessfulClose && typeof onSuccessfulClose === 'function') {
                onSuccessfulClose();
            }
             // مسح القائمة المختارة بعد النجاح
             setSelectedATAs([]);


        } catch (error) {
            // 10. معالجة الأخطاء
            console.error("!!! AtaManager Error during close accounts process:", error);
            let displayError = 'An error occurred during the closing process.';
            if (axios.isAxiosError(error)) { displayError = `Network/Backend Error (${error.response?.status || 'N/A'}): ${error.response?.data?.error || error.message}`; }
            else if (error.name === 'WalletSignTransactionError' || error.message.includes('rejected')) { displayError = `Wallet signing was rejected. Please approve the transaction in your wallet.`; }
            else if (error.message.includes('Transaction confirmation failed')) { displayError = `Transaction failed on-chain. Signature: ${signature || 'N/A'}. Check explorer for details.`; }
            else { displayError = `Error: ${error.message || 'Unknown error during close process.'}`; }
            //setError(displayError);
            toast.error(`Account Closing Failed: ${displayError}`); // <-- Toast خطأ
            setLastSignature('');

        } finally {
            // 11. إنهاء حالة المعالجة دائمًا
            setIsProcessing(false);
            console.log("AtaManager: Finished close accounts process.");
        }
    }, [
        // الاعتماديات: كل ما يُستخدم داخل الدالة ويأتي من الخارج أو من الحالة
        publicKey, connection, connected, signTransaction, selectedATAs, isProcessing,
        setError, setLastSignature, referrerFromUrl, onSuccessfulClose
    ]);

    // === العرض ===

    // لا تعرض المكون إذا لم تكن المحفظة متصلة
    if (!connected || !publicKey) {
        return null;
    }

    return (
        // استخدام الفئات العامة والفئات الخاصة بالمكون من ملف CSS Module
        <div className={`${styles.ataContainer} glass-effect container`}>
            <h2 className={`${styles.title} gradient-text-bold`}>Select Empty Accounts to Close</h2>

            {/* عرض التحميل بناءً على الـ prop القادم من App */}
            {isLoadingAtas && <p className={styles.loadingText}>Scanning for accounts...</p>}

            {/* عرض رسالة عدم وجود حسابات بناءً على القائمة المحدثة */}
            {!isLoadingAtas && emptyATAs.length === 0 && (
                <p className={styles.noAtasText}>
                Looks like you don't have any empty token accounts currently. Remember to check back after your trading sessions or token activities to recover any newly locked SOL rent.
            </p>
            )}

            {/* عرض الأعمدة إذا كانت هناك حسابات */}
            {!isLoadingAtas && emptyATAs.length > 0 && (
                <div className={styles.columnsWrapper}>
                    {/* العمود الأيسر: الحسابات المتاحة */}
                    <div className={`${styles.column} ${styles.columnLeft}`}>
                        <div className={styles.listHeader}>
                            <h4 className={`${styles.listTitle} gradient-text-bold`}>
                                Available ATAs ({availableATAs.length})
                            </h4>
                            <button
                                onClick={handleSelectAll}
                                disabled={availableATAs.length === 0 || isProcessing}
                                className={styles.actionButton}
                            >
                                Select All
                            </button>
                        </div>
                        {/* قائمة الحسابات المتاحة */}
                        <ul className={styles.ataList}>
                            {availableATAs.map(ata => (
                                <li key={`avail-${ata}`} className={styles.ataListItem}>
                                    <input
                                        type="checkbox"
                                        checked={false} // دائمًا غير محدد بصريًا هنا
                                        onChange={() => handleCheckboxChange(ata)}
                                        id={`checkbox-available-${ata}`}
                                        className={styles.ataCheckbox}
                                        disabled={isProcessing}
                                    />
                                    <label htmlFor={`checkbox-available-${ata}`} className={styles.ataLabel}>
                                        {ata}
                                    </label>
                                </li>
                            ))}
                            {/* رسالة إذا كانت كل الحسابات مختارة */}
                            {availableATAs.length === 0 && selectedATAs.length > 0 && (
                                 <p style={{ textAlign: 'center', color: '#888', marginTop: '1rem' }}>All available accounts are selected.</p>
                            )}
                        </ul>
                    </div>

                    {/* العمود الأيمن: الحسابات المختارة وزر Claim */}
                    <div className={styles.column}>
                        <div className={styles.listHeader}>
                             <h4 className={`${styles.listTitle} gradient-text-bold`}>
                                Selected for Closing ({selectedATAs.length})
                             </h4>
                            <button
                                onClick={handleDeselectAll}
                                disabled={selectedATAs.length === 0 || isProcessing}
                                className={styles.actionButton}
                            >
                                Deselect All
                            </button>
                        </div>
                        {/* زر الإغلاق */}
                         <button
                             className={styles.claimButton}
                             onClick={handleCloseAccounts}
                             // تعطيل الزر عند التحميل أو المعالجة أو عدم اختيار حسابات
                             disabled={isLoadingAtas || isProcessing || selectedATAs.length === 0}
                         >
                             {isProcessing ? 'Processing...' : `Claim ~${netSolForSelected.toFixed(6)} SOL (${selectedATAs.length} Accs)`}
                         </button>
                        {/* قائمة الحسابات المختارة */}
                        <ul className={styles.ataList} data-testid="selected-ata-list">
                            {selectedATAs.map(ata => (
                                <li key={`selected-${ata}`} className={styles.ataListItem}>
                                    <span className={styles.ataLabel}>{ata}</span>                                                        
                                    <button
                                        onClick={() => handleCheckboxChange(ata)}
                                        disabled={isProcessing}
                                        className={styles.removeButton}
                                        title="Remove"
                                        aria-label={`Remove ${ata}`}
                                    >
                                        ×
                                    </button>
                                </li>
                            ))}
                            {/* رسالة عند عدم اختيار حسابات */}
                             {selectedATAs.length === 0 && (
                                 <p style={{ textAlign: 'center', color: '#888', marginTop: '1rem' }}>Select accounts from the left list to close.</p>
                             )}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AtaManager;