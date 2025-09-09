// src/components/AtaManager/AtaManager.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TOKEN_PROGRAM_ID } from '@solana/web3.js';
import axios from 'axios'; // لا يزال يُستخدم بواسطة apiClient (بشكل غير مباشر)
import { Buffer } from 'buffer';
import styles from './AtaManager.module.css';
import { toast } from 'react-toastify';
import apiClient from '../../api/axiosInstance';

// تعريف Props المستلمة من App.js
const AtaManager = ({
    // setError, // تم تقليل استخدامه المباشر، لكن يمكن إعادته إذا لزم الأمر
    setLastSignature,       // دالة لتحديث آخر توقيع في App
    referrerFromUrl,        // المحيل من URL
    onSuccessfulClose,      // دالة لتشغيل التحديث الشامل في App
    initialEmptyAtas,       // قائمة ATAs المكتشفة من App
    isLoadingAtas           // حالة تحميل قائمة ATAs من App
}) => {
    const { connection } = useConnection();
    const { publicKey, connected, signTransaction } = useWallet();

    const RENT_PER_EMPTY_ATA_SOL = 0.00203928;
    const PLATFORM_FEE_PERCENT = 0.25; // للعرض فقط

    const [emptyATAs, setEmptyATAs] = useState(initialEmptyAtas || []);
    const [selectedATAs, setSelectedATAs] = useState([]);
    const [netSolForSelected, setNetSolForSelected] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const MAX_SELECTION_LIMIT = 8;
    // currentTransactionSignature لم تعد ضرورية كحالة منفصلة هنا لأن localSignatureAttempt كافية
    // const [currentTransactionSignature, setCurrentTransactionSignature] = useState('');

    useEffect(() => {
        setEmptyATAs(initialEmptyAtas || []);
        if (initialEmptyAtas && initialEmptyAtas.length > 0) {
            setSelectedATAs(prevSelected => prevSelected.filter(sAta => initialEmptyAtas.includes(sAta)));
        } else {
            setSelectedATAs([]);
        }
    }, [initialEmptyAtas]);

    useEffect(() => {
        const netRecoveryPerATA = RENT_PER_EMPTY_ATA_SOL * (1 - PLATFORM_FEE_PERCENT);
        const calculatedNetSol = selectedATAs.length * netRecoveryPerATA;
        setNetSolForSelected(calculatedNetSol);
    }, [selectedATAs, RENT_PER_EMPTY_ATA_SOL, PLATFORM_FEE_PERCENT]);

    const handleCheckboxChange = useCallback((ata) => {
        setSelectedATAs(prevSelected =>
            prevSelected.includes(ata)
                ? prevSelected.filter(selectedAta => selectedAta !== ata)
                : [...prevSelected, ata]
        );
    }, []);

    const handleSelectAll = useCallback(() => {
        const availableToSelect = emptyATAs.filter(ata => !selectedATAs.includes(ata));
        // حدد فقط العدد المسموح به للوصول إلى الحد الأقصى
        const howManyCanISelect = MAX_SELECTION_LIMIT - selectedATAs.length;
        const itemsToSelect = availableToSelect.slice(0, howManyCanISelect);
        setSelectedATAs(prevSelected => [...prevSelected, ...itemsToSelect]);
    }, [emptyATAs, selectedATAs]);

    const handleDeselectAll = useCallback(() => {
        setSelectedATAs([]);
    }, []);

    const availableATAs = useMemo(() => {
        if (!Array.isArray(emptyATAs)) return [];
        return emptyATAs.filter(ata => !selectedATAs.includes(ata));
    }, [emptyATAs, selectedATAs]);

    const shortenAddress = (address) => {
        if (!address || typeof address !== 'string') return 'N/A';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const customConfirmTransaction = async (signature, conn) => {
        const MAX_CONFIRM_ATTEMPTS = 25; // زدت عدد المحاولات قليلاً
        const RETRY_DELAY_MS = 2500;    // زدت التأخير قليلاً
        let attempts = 0;

        console.log(`AtaManager (customConfirm): Starting confirmation for ${shortenAddress(signature)}...`);
        while (attempts < MAX_CONFIRM_ATTEMPTS) {
            attempts++;
            try {
                // استخدام getSignatureStatuses بدلاً من getSignatureStatus للحصول على معلومات أكثر تفصيلاً إذا أمكن
                // ولكن getSignatureStatus أبسط ومناسب هنا.
                const status = await conn.getSignatureStatus(signature, {
                    searchTransactionHistory: true,
                });

                console.log(`AtaManager (customConfirm): Attempt ${attempts}, Sig: ${shortenAddress(signature)}, Status Obj:`, status);

                if (status && status.value) {
                    if (status.value.err) {
                        console.error(`AtaManager (customConfirm): Transaction ${shortenAddress(signature)} failed on-chain (err object present). Error:`, status.value.err);
                        throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`);
                    }
                    // التحقق من confirmationStatus
                    if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
                        console.log(`AtaManager (customConfirm): Transaction ${shortenAddress(signature)} confirmed with status: ${status.value.confirmationStatus}`);
                        return { value: { err: null } }; // محاكاة استجابة confirmTransaction الناجحة
                    }
                    console.log(`AtaManager (customConfirm): Attempt ${attempts}, Sig: ${shortenAddress(signature)}, Current status: ${status.value.confirmationStatus || 'processing'}`);
                } else {
                    console.log(`AtaManager (customConfirm): Attempt ${attempts}, Sig: ${shortenAddress(signature)}, No status value yet or status is null.`);
                }
            } catch (error) {
                console.warn(`AtaManager (customConfirm): Error in getSignatureStatus (Attempt ${attempts}) for ${shortenAddress(signature)}: ${error.message}. Retrying...`);
                // لا ترمي الخطأ هنا مباشرة، دع الحلقة تستمر
            }

            if (attempts < MAX_CONFIRM_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
        console.error(`AtaManager (customConfirm): Transaction (Sig: ${shortenAddress(signature)}) could not be confirmed after ${MAX_CONFIRM_ATTEMPTS} attempts.`);
        throw new Error(`Transaction (Sig: ${shortenAddress(signature)}) could not be confirmed after ${MAX_CONFIRM_ATTEMPTS} attempts.`);
    };

    const handleCloseAccounts = useCallback(async () => {
        if (!publicKey || !signTransaction || !connected || selectedATAs.length === 0) {
            toast.error("Please connect wallet and select at least one account to close.");
            return;
        }
        if (isProcessing) {
            toast.warn("Close process already in progress.");
            return;
        }

        setIsProcessing(true);
        setLastSignature(''); // مسح التوقيع العام المعروض في الهيدر

        const atasToClose = [...selectedATAs];
        let preparedTxBase64 = '';
        let platformFeeFromBackend = '0';
        let localSignatureAttempt = ''; // لتخزين توقيع المحاولة الحالية

        const toastConfirmId = `confirm-${Date.now()}`; // معرف فريد لإشعار التأكيد

        try {
            console.log("AtaManager: Preparing transaction...");
            const requestData = {
                userPublicKeyString: publicKey.toBase58(),
                ataAddresses: atasToClose,
                referrerPublicKeyString: referrerFromUrl
            };
            const prepareResponse = await apiClient.post('/transactions/prepare-close', requestData);
            if (!prepareResponse.data?.success || !prepareResponse.data.transaction || prepareResponse.data.platformFeeLamports === undefined) {
                throw new Error(prepareResponse.data?.error || 'Invalid response from prepare transaction API.');
            }
            preparedTxBase64 = prepareResponse.data.transaction;
            platformFeeFromBackend = prepareResponse.data.platformFeeLamports;
            console.log("AtaManager: Transaction prepared by backend.");
        

            const transaction = Transaction.from(Buffer.from(preparedTxBase64, 'base64'));
            console.log("AtaManager: Requesting transaction signature from wallet...");
            const signedTx = await signTransaction(transaction);
            console.log("AtaManager: Transaction signed by user.");

            console.log("AtaManager: Sending signed transaction to network...");
            localSignatureAttempt = await connection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
            });
            setLastSignature(localSignatureAttempt);
            console.log(`AtaManager: Transaction sent. Signature: ${localSignatureAttempt}`);
            toast.info(`Transaction sent (Sig: ${shortenAddress(localSignatureAttempt)}). Confirming... Please wait.`, {
                toastId: toastConfirmId,
                autoClose: false, // لا تغلق تلقائيًا
                isLoading: true, // أظهر أيقونة التحميل
            });

            console.log(`AtaManager: Custom confirming transaction ${localSignatureAttempt}...`);
            await customConfirmTransaction(localSignatureAttempt, connection);
            toast.dismiss(toastConfirmId); // إزالة إشعار "Confirming..."

            console.log(`AtaManager: Transaction ${localSignatureAttempt} confirmed successfully (custom confirm).`);
	    // ===================================================================
            // === بداية كود تتبع التحويلات في إعلانات جوجل ===
            // ===================================================================
            if (window.gtag) {
		const conversionId = 'AW-17115275596/dmCzCL2s8tgaEMzCmeE_'; // <-- استبدل هذا بالمعرف من Google Ads
                console.log(`Sending 'conversion' event to Google Ads with ID: ${conversionId}`);
                window.gtag('event', 'conversion', {
                    'send_to': conversionId,
                    'transaction_id': localSignatureAttempt // (مهم جدًا) إرسال توقيع المعاملة لمنع حساب التحويلات المكررة
                });
            } else {
                console.warn("Google Tag (gtag.js) not found. Conversion event not sent.");
            }
            // ===================================================================
            // === نهاية كود تتبع التحويلات ===
            // ===================================================================
            toast.success(`Successfully closed ${atasToClose.length} account(s)! (Sig: ${shortenAddress(localSignatureAttempt)})`);
	    // --- !! بداية تتبع حدث Google Tag Manager / Google Analytics !! ---
            if (window.gtag) {
                window.gtag('event', 'atas_closed_successfully', {
                    'event_category': 'AtaManagement',
                    'event_label': `User ${publicKey ? publicKey.toBase58().substring(0,10) : 'Unknown'} closed ATAs`,
                    'value': atasToClose.length, // عدد الحسابات المغلقة
                    'transaction_id': localSignatureAttempt // (اختياري) توقيع المعاملة كمعرف
                });
                console.log("AtaManager: gtag event 'atas_closed_successfully' sent. Count:", atasToClose.length);
            }
            // --- !! نهاية تتبع حدث Google Tag Manager / Google Analytics !! ---
            try {
                const confirmationData = {
                    signature: localSignatureAttempt,
                    userPublicKeyString: publicKey.toBase58(),
                    referrerPublicKeyString: referrerFromUrl,
                    closedCount: atasToClose.length,
                    platformFeeLamportsString: platformFeeFromBackend
                };
                console.log("AtaManager: Sending confirmation to backend...", confirmationData);
                const dbUpdateResponse = await apiClient.post('/transactions/confirm-close', confirmationData);
                if (!dbUpdateResponse.data?.success) {
                    console.warn("AtaManager: Backend DB update failed:", dbUpdateResponse.data?.error);
                    toast.warn("Backend stats update might be delayed for this transaction.");
                } else {
                    console.log("AtaManager: Backend DB update successful.");
                }
            } catch (dbError) {
                console.error("AtaManager: Network error sending confirmation to backend:", dbError);
                toast.warn("Network error updating backend records for this transaction.");
            }

            if (onSuccessfulClose) onSuccessfulClose(true);
            setSelectedATAs([]);

        } catch (error) {
            toast.dismiss(toastConfirmId); // تأكد من إزالة إشعار التأكيد عند الخطأ أيضًا
            console.error("!!! AtaManager Error during close accounts process:", {
                message: error.message,
                name: error.name,
                currentAttemptSignature: localSignatureAttempt || "N/A"
            });

            let displayError = 'An error occurred during the closing process.';
            const isAlreadyProcessedError = error.message && error.message.includes("This transaction has already been processed");
            const isSimulationFailedButAlreadyProcessed = error.message && error.message.includes("Transaction simulation failed") && error.message.includes("already been processed");

            if (isAlreadyProcessedError || isSimulationFailedButAlreadyProcessed) {
                displayError = "Action seems complete or is processing. Refreshing data to reflect latest state...";
                toast.info(displayError, { autoClose: 7000 });
                if (onSuccessfulClose) onSuccessfulClose(true);
                if (localSignatureAttempt) setLastSignature(localSignatureAttempt);
                else setLastSignature('');
            } else if (localSignatureAttempt && (error.message.includes("Transaction confirmation failed") || error.message.includes("could not be confirmed after"))) {
                displayError = `Transaction (Sig: ${shortenAddress(localSignatureAttempt)}) failed to confirm after several attempts. It might process later. Please check an explorer. Refreshing local data.`;
                toast.warn(displayError, { autoClose: 15000 });
                setLastSignature(localSignatureAttempt);
                if (onSuccessfulClose) onSuccessfulClose(false);
            } else if (error.name === 'WalletSignTransactionError' || (error.message && error.message.toLowerCase().includes('user rejected'))) {
                displayError = `Wallet signing was rejected. Please approve the transaction in your wallet.`;
                toast.error(displayError);
                setLastSignature('');
            } else if (axios.isAxiosError(error)) {
                displayError = `Network/Backend Error (${error.response?.status || 'N/A'}): ${error.response?.data?.error || error.message}`;
                toast.error(displayError);
                setLastSignature(localSignatureAttempt || '');
            } else {
                displayError = `Error: ${error.message || 'Unknown error during close process.'}`;
                toast.error(displayError);
                setLastSignature(localSignatureAttempt || '');
            }
        } finally {
            setIsProcessing(false);
            console.log("AtaManager: Finished close accounts process attempt.");
        }
    }, [
        publicKey, connection, connected, signTransaction, selectedATAs, isProcessing,
        setLastSignature, referrerFromUrl, onSuccessfulClose,
        RENT_PER_EMPTY_ATA_SOL, PLATFORM_FEE_PERCENT
    ]);


    if (!connected || !publicKey) {
        return null;
    }

    return (
        <div className={`${styles.ataContainer} glass-effect container`}>
            <h2 className={`${styles.title} gradient-text-bold`}>Select Empty Accounts to Close</h2>

            {isLoadingAtas && <p className={styles.loadingText}>Scanning for accounts...</p>}

            {!isLoadingAtas && emptyATAs.length === 0 && (
                <p className={styles.noAtasText}>
                Looks like you don't have any empty token accounts currently. Remember to check back after your trading sessions or token activities to recover any newly locked SOL rent.
            </p>
            )}

            {!isLoadingAtas && emptyATAs.length > 0 && (
                <div className={styles.columnsWrapper}>
                    <div className={`${styles.column} ${styles.columnLeft}`}>
                        <div className={styles.listHeader}>
                            <h4 className={`${styles.listTitle} gradient-text-bold`}>
                                Available ATAs ({availableATAs.length})
                            </h4>
                            <button
                                onClick={handleSelectAll}
                                disabled={availableATAs.length === 0 || isProcessing || selectedATAs.length >= MAX_SELECTION_LIMIT}
                                className={styles.actionButton}
                            >
                                {availableATAs.length > MAX_SELECTION_LIMIT ? `Select ${MAX_SELECTION_LIMIT}` : 'Select All'}
                            </button>
                            {selectedATAs.length >= MAX_SELECTION_LIMIT && (
                                <p className={styles.selectionLimitText}>
                                    Maximum selection of {MAX_SELECTION_LIMIT} accounts per transaction reached.
                                </p>
                            )}
                        </div>
                        <ul className={styles.ataList}>
                            {availableATAs.map(ata => (
                                <li key={`avail-${ata}`} className={styles.ataListItem}>
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        onChange={() => handleCheckboxChange(ata)}
                                        id={`checkbox-available-${ata}`}
                                        className={styles.ataCheckbox}
                                        disabled={isProcessing || selectedATAs.length >= MAX_SELECTION_LIMIT}
                                    />
                                    <label htmlFor={`checkbox-available-${ata}`} className={styles.ataLabel}>
                                        {ata}
                                    </label>
                                </li>
                            ))}
                            {availableATAs.length === 0 && selectedATAs.length > 0 && (
                                 <p style={{ textAlign: 'center', color: '#888', marginTop: '1rem' }}>All available accounts are selected.</p>
                            )}
                        </ul>
                    </div>

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
                         <button
                             className={styles.claimButton}
                             onClick={handleCloseAccounts}
                             disabled={isLoadingAtas || isProcessing || selectedATAs.length === 0}
                         >
                             {isProcessing ? 'Processing...' : `Claim ~${netSolForSelected.toFixed(6)} SOL (${selectedATAs.length} Accs)`}
                         </button>
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
