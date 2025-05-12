// src/components/AtaManager/AtaManager.test.js
import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Polyfill for crypto (يفترض أنه موجود في setupTests.js ويعمل بشكل صحيح)
// إذا كنت لا تزال تواجه مشاكل مع crypto، تأكد من أن setupTests.js يتم استيراده
// بشكل صحيح في jest.config.js أو package.json تحت قسم jest.setupFilesAfterEnv

// --- محاكاة الوحدات ---

// apiClient (axios instance)
jest.mock('../../api/axiosInstance', () => ({
    post: jest.fn(), // سيتم تحديد ما يرجعه لكل استدعاء في beforeEach أو داخل الاختبار
}));

// @solana/wallet-adapter-react
const mockSignTransaction = jest.fn(); // دالة وهمية لـ signTransaction
const mockUseWallet = jest.fn();       // دالة وهمية لـ hook useWallet
const mockUseConnection = jest.fn();  // دالة وهمية لـ hook useConnection

jest.mock('@solana/wallet-adapter-react', () => ({
    useWallet: () => mockUseWallet(),
    useConnection: () => mockUseConnection(), // استخدام mockUseConnection هنا
}));

// react-toastify (النمط الصحيح للمحاكاة)
jest.mock('react-toastify', () => {
    const mockSuccessFnInternal = jest.fn();
    const mockErrorFnInternal = jest.fn();
    const mockWarnFnInternal = jest.fn();
    return {
        toast: {
            success: mockSuccessFnInternal,
            error: mockErrorFnInternal,
            warn: mockWarnFnInternal,
        },
        ToastContainer: () => <div data-testid="toast-container" />, // مكون وهمي لـ ToastContainer
    };
});

// --- استيراد المكون والوحدات المحاكاة بعد تعريف jest.mock ---
import AtaManager from './AtaManager';
import apiClient from '../../api/axiosInstance'; // سيحصل على النسخة المحاكاة
import { useConnection, useWallet } from '@solana/wallet-adapter-react'; // سيحصل على النسخ المحاكاة
import { toast } from 'react-toastify'; // سيحصل على النسخة المحاكاة

// --- بيانات وهمية للاختبار ---
const MOCK_USER_PUBKEY = new PublicKey("User111111111111111111111111111111111111111");
const MOCK_REFERRER_FROM_URL = "ReferrerABCXYZ12345678901234567890123456789";
const MOCK_ATA1_STR = "ATA1PublicKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXAAA";
const MOCK_ATA2_STR = "ATA2PublicKeyYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYBBB";
const MOCK_ATA3_STR = "ATA3PublicKeyZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZCCC";
const MOCK_INITIAL_ATAS_LIST = [MOCK_ATA1_STR, MOCK_ATA2_STR, MOCK_ATA3_STR];

const RENT_PER_EMPTY_ATA_SOL_TEST = 0.00203928;
const PLATFORM_FEE_PERCENT_TEST = 0.25;
const NET_RECOVERY_PER_ATA_TEST = RENT_PER_EMPTY_ATA_SOL_TEST * (1 - PLATFORM_FEE_PERCENT_TEST);

// --- دالة مساعدة لتقديم المكون مع props افتراضية وقابلة للتجاوز ---
const renderAtaManager = (props = {}) => {
    const defaultProps = {
        setError: jest.fn(),
        setLastSignature: jest.fn(),
        referrerFromUrl: MOCK_REFERRER_FROM_URL,
        onSuccessfulClose: jest.fn(),
        initialEmptyAtas: MOCK_INITIAL_ATAS_LIST,
        isLoadingAtas: false,
    };
    return render(<AtaManager {...defaultProps} {...props} />);
};

describe('AtaManager Component', () => {
    let mockConnectionObject; // لتخزين كائن الاتصال المحاكى
    let transactionFromSpy;   // للتجسس على Transaction.from

    beforeEach(() => {
        // مسح جميع المحاكاة قبل كل اختبار
        jest.clearAllMocks();
        apiClient.post.mockReset(); // مهم لإعادة تعيين استدعاءات apiClient.post
        mockSignTransaction.mockReset(); // إعادة تعيين دالة التوقيع الوهمية

        // مسح دوال toast الوهمية
        toast.success.mockClear();
        toast.error.mockClear();
        toast.warn.mockClear();

        // إعداد القيم المرتجعة الافتراضية للمحاكاة
        mockUseWallet.mockReturnValue({
            publicKey: MOCK_USER_PUBKEY,
            connected: true,
            signTransaction: mockSignTransaction, // استخدام الدالة الوهمية المعرفة أعلاه
            wallet: { adapter: { name: 'MockPhantomForTest' } },
            connecting: false,
            disconnecting: false,
            sendTransaction: jest.fn(), // قد لا نحتاجها مباشرة، ولكن جيد أن تكون موجودة
        });

        mockConnectionObject = {
            sendRawTransaction: jest.fn(),
            confirmTransaction: jest.fn(),
            getLatestBlockhash: jest.fn().mockResolvedValue({
                blockhash: 'TestBlockhash1234567890abcdefghijklmnop',
                lastValidBlockHeight: 12345,
            }),
        };
        mockUseConnection.mockReturnValue({ connection: mockConnectionObject });

        // التجسس على Transaction.from وإعادة تطبيق المحاكاة
        transactionFromSpy = jest.spyOn(Transaction, 'from').mockImplementation((buffer) => {
            const tx = new Transaction();
            tx.recentBlockhash = 'TestBlockhash1234567890abcdefghijklmnop';
            tx.feePayer = MOCK_USER_PUBKEY;
            tx.signatures = []; // محاكاة signatures
            tx.instructions = []; // محاكاة instructions
            tx.add = jest.fn();    // محاكاة add
            tx.serialize = jest.fn(() => buffer); // إرجاع الـ buffer الأصلي أو واحد وهمي
            return tx;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks(); // استعادة جميع الـ spies والمحاكاة لحالتها الأصلية
    });

    test('renders correctly when connected and ATAs are available', () => {
        renderAtaManager();
        expect(screen.getByText(/Select Empty Accounts to Close/i)).toBeInTheDocument();
        expect(screen.getByText(`Available ATAs (${MOCK_INITIAL_ATAS_LIST.length})`)).toBeInTheDocument();
        MOCK_INITIAL_ATAS_LIST.forEach(ata => {
            expect(screen.getByLabelText(ata)).toBeInTheDocument();
        });
        const claimButton = screen.getByRole('button', { name: /Claim ~0.000000 SOL \(0 Accs\)/i });
        expect(claimButton).toBeInTheDocument();
        expect(claimButton).toBeDisabled();
    });

    test('selecting and deselecting ATAs updates list and claim button', async () => {
        const user = userEvent.setup();
        renderAtaManager({ initialEmptyAtas: [MOCK_ATA1_STR, MOCK_ATA2_STR] }); // استخدام قائمتنا المخصصة هنا

        const checkbox1 = screen.getByLabelText(MOCK_ATA1_STR);
        const checkbox2 = screen.getByLabelText(MOCK_ATA2_STR);
        const claimButton = screen.getByRole('button', { name: /Claim/i });
        const selectedList = screen.getByTestId('selected-ata-list');

        // اختيار الأول
        await user.click(checkbox1);
        let expectedSol = NET_RECOVERY_PER_ATA_TEST.toFixed(6);
        await waitFor(() => expect(claimButton).toHaveTextContent(new RegExp(`Claim ~${expectedSol} SOL \\(1 Accs\\)`, 'i')));
        expect(within(selectedList).getByText(MOCK_ATA1_STR)).toBeInTheDocument();

        // اختيار الثاني
        await user.click(checkbox2);
        expectedSol = (NET_RECOVERY_PER_ATA_TEST * 2).toFixed(6);
        await waitFor(() => expect(claimButton).toHaveTextContent(new RegExp(`Claim ~${expectedSol} SOL \\(2 Accs\\)`, 'i')));
        expect(within(selectedList).getByText(MOCK_ATA2_STR)).toBeInTheDocument();

        // إزالة الأول من القائمة المختارة
        const removeButton1 = within(selectedList).getByRole('button', { name: `Remove ${MOCK_ATA1_STR}` });
        await user.click(removeButton1);
        expectedSol = NET_RECOVERY_PER_ATA_TEST.toFixed(6);
        await waitFor(() => expect(claimButton).toHaveTextContent(new RegExp(`Claim ~${expectedSol} SOL \\(1 Accs\\)`, 'i')));
        expect(within(selectedList).queryByText(MOCK_ATA1_STR)).not.toBeInTheDocument();
        // التأكد من أن checkbox الأول أصبح متاحًا مرة أخرى (إذا كان هذا هو السلوك)
        expect(screen.getByLabelText(MOCK_ATA1_STR)).toBeInTheDocument();
    });

    test('handles successful account closing process for one ATA', async () => {
        const user = userEvent.setup();
        const mockProps = {
            setError: jest.fn(),
            setLastSignature: jest.fn(),
            onSuccessfulClose: jest.fn(),
            initialEmptyAtas: [MOCK_ATA1_STR], // اختبار لـ ATA واحد فقط
            referrerFromUrl: MOCK_REFERRER_FROM_URL,
        };

        // 1. محاكاة استجابة /prepare-close
        const mockTxBase64 = Buffer.from('mock-prepared-transaction-data').toString('base64');
        const mockPlatformFeeString = '500000'; // مثال
        apiClient.post.mockResolvedValueOnce({
            data: { success: true, transaction: mockTxBase64, platformFeeLamports: mockPlatformFeeString }
        });

        // 2. محاكاة signTransaction
        const mockSignedTxBuffer = Buffer.from('mock-signed-transaction-data');
        mockSignTransaction.mockImplementation(async (transaction) => {
            // تأكد أننا نرجع كائنًا له دالة serialize
            return { serialize: () => mockSignedTxBuffer };
        });

        // 3. محاكاة sendRawTransaction
        const mockSignatureStr = 'TestSignatureForSuccessfulClose12345';
        mockConnectionObject.sendRawTransaction.mockResolvedValue(mockSignatureStr);

        // 4. محاكاة confirmTransaction
        mockConnectionObject.confirmTransaction.mockResolvedValue({ value: { err: null } });

        // 5. محاكاة استجابة /confirm-close
        apiClient.post.mockResolvedValueOnce({
            data: { success: true, message: 'Database updated successfully.' }
        });

        renderAtaManager(mockProps);

        // اختيار ATA والضغط على زر الإغلاق
        const checkbox1 = screen.getByLabelText(MOCK_ATA1_STR);
        await user.click(checkbox1);
        const claimButton = screen.getByRole('button', { name: /Claim/i });
        await act(async () => { await user.click(claimButton); });

        // التأكيدات
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2)); // استدعاء لـ prepare و confirm

        expect(apiClient.post).toHaveBeenNthCalledWith(1, '/transactions/prepare-close', {
            userPublicKeyString: MOCK_USER_PUBKEY.toBase58(),
            ataAddresses: [MOCK_ATA1_STR],
            referrerPublicKeyString: MOCK_REFERRER_FROM_URL
        });
        expect(transactionFromSpy).toHaveBeenCalledWith(Buffer.from(mockTxBase64, 'base64'));
        expect(mockSignTransaction).toHaveBeenCalledTimes(1);
        expect(mockConnectionObject.sendRawTransaction).toHaveBeenCalledWith(mockSignedTxBuffer);
        expect(mockProps.setLastSignature).toHaveBeenCalledWith(mockSignatureStr);
        expect(mockConnectionObject.confirmTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ signature: mockSignatureStr }),
            'confirmed'
        );
        expect(toast.success).toHaveBeenCalledWith('Successfully closed 1 account(s)!');
        expect(apiClient.post).toHaveBeenNthCalledWith(2, '/transactions/confirm-close', {
            signature: mockSignatureStr,
            userPublicKeyString: MOCK_USER_PUBKEY.toBase58(),
            referrerPublicKeyString: MOCK_REFERRER_FROM_URL,
            closedCount: 1,
            platformFeeLamportsString: mockPlatformFeeString
        });
        expect(mockProps.onSuccessfulClose).toHaveBeenCalledTimes(1);
        expect(mockProps.setError).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();
    });

    test('handles error from /prepare-close API call', async () => {
        const user = userEvent.setup();
        // *** تعديل هنا: إضافة setLastSignature كدالة محاكاة ***
        const mockProps = {
            setError: jest.fn(),
            setLastSignature: jest.fn(), // <-- إضافة هذه
            initialEmptyAtas: [MOCK_ATA1_STR]
        };
        // ----------------------------------------------------
        const prepareErrorMessage = "Backend prepare error";
        apiClient.post.mockReset(); // تأكد من إعادة التعيين هنا إذا لم تكن في beforeEach لهذا الاختبار
        apiClient.post.mockRejectedValueOnce({
            isAxiosError: true,
            response: { status: 500, data: { success: false, error: prepareErrorMessage } }
        });

        renderAtaManager(mockProps);
        await user.click(screen.getByLabelText(MOCK_ATA1_STR));
        await act(async () => { await user.click(screen.getByRole('button', { name: /Claim/i })); });

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(`Network/Backend Error (500): ${prepareErrorMessage}`));
        });
        expect(mockProps.setError).not.toHaveBeenCalled();
        expect(mockProps.setLastSignature).toHaveBeenCalledWith(''); // الآن يجب أن تعمل
    });

    test('handles user rejecting transaction signing', async () => {
        const user = userEvent.setup();
        const mockProps = {
            setError: jest.fn(),
            setLastSignature: jest.fn(), // <-- إضافة هذه
            initialEmptyAtas: [MOCK_ATA1_STR]
        };
        apiClient.post.mockResolvedValueOnce({ // /prepare-close ينجح
            data: { success: true, transaction: Buffer.from('mock-tx').toString('base64'), platformFeeLamports: '123' }
        });
        const signError = new Error("User rejected request");
        signError.name = 'WalletSignTransactionError'; // اسم خطأ شائع من Wallet Adapter
        mockSignTransaction.mockRejectedValueOnce(signError);

        renderAtaManager(mockProps);
        await user.click(screen.getByLabelText(MOCK_ATA1_STR));
        await act(async () => { await user.click(screen.getByRole('button', { name: /Claim/i })); });

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Wallet signing was rejected"));
        });
        expect(mockConnectionObject.sendRawTransaction).not.toHaveBeenCalled();
        expect(mockProps.setLastSignature).toHaveBeenCalledWith(''); // الآن يجب أن تعمل
    });

    test('handles error from sendRawTransaction', async () => {
        const user = userEvent.setup();
        const mockProps = { setError: jest.fn(), setLastSignature: jest.fn(), initialEmptyAtas: [MOCK_ATA1_STR] };
        apiClient.post.mockResolvedValueOnce({
            data: { success: true, transaction: Buffer.from('mock-tx').toString('base64'), platformFeeLamports: '123' }
        });
        mockSignTransaction.mockResolvedValue({ serialize: () => Buffer.from('signed-tx') });
        const sendError = new Error("Failed to send transaction");
        mockConnectionObject.sendRawTransaction.mockRejectedValueOnce(sendError);

        renderAtaManager(mockProps);
        await user.click(screen.getByLabelText(MOCK_ATA1_STR));
        await act(async () => { await user.click(screen.getByRole('button', { name: /Claim/i })); });

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(`Error: Failed to send transaction`));
        });
        expect(mockProps.setLastSignature).toHaveBeenCalledWith(''); // تأكد من هذا السطر إذا كان هذا هو السلوك المتوقع
        expect(mockConnectionObject.confirmTransaction).not.toHaveBeenCalled();
    });

    test('handles error from confirmTransaction (on-chain failure)', async () => {
        const user = userEvent.setup();
        const mockProps = { setError: jest.fn(), setLastSignature: jest.fn(), initialEmptyAtas: [MOCK_ATA1_STR] };
        const mockSignature = "OnChainFailureSignature123";
        apiClient.post.mockResolvedValueOnce({
            data: { success: true, transaction: Buffer.from('mock-tx').toString('base64'), platformFeeLamports: '123' }
        });
        mockSignTransaction.mockResolvedValue({ serialize: () => Buffer.from('signed-tx') });
        mockConnectionObject.sendRawTransaction.mockResolvedValue(mockSignature);
        const confirmError = { value: { err: {InstructionError: [0, 'Custom error']} }}; // خطأ وهمي من السلسلة
        mockConnectionObject.confirmTransaction.mockResolvedValue(confirmError); // Resolved with error object

        renderAtaManager(mockProps);
        await user.click(screen.getByLabelText(MOCK_ATA1_STR));
        await act(async () => { await user.click(screen.getByRole('button', { name: /Claim/i })); });

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(`Transaction failed on-chain. Signature: ${mockSignature}`));
        });
        expect(mockProps.setLastSignature).toHaveBeenCalledWith(mockSignature); // يتم تعيينه حتى لو فشل التأكيد
        expect(apiClient.post).toHaveBeenCalledTimes(1); // فقط prepare-close، لا يتم استدعاء confirm-close للـ backend
    });

    test('handles error from /confirm-close API (backend DB update failure)', async () => {
        const user = userEvent.setup();
        const mockProps = { onSuccessfulClose: jest.fn(), initialEmptyAtas: [MOCK_ATA1_STR] };
        const mockSignature = "DBUpdateFailSignature789";
        // محاكاة جميع الخطوات الناجحة حتى استدعاء /confirm-close
        apiClient.post.mockResolvedValueOnce({ // prepare-close
            data: { success: true, transaction: Buffer.from('mock-tx').toString('base64'), platformFeeLamports: '123' }
        });
        mockSignTransaction.mockResolvedValue({ serialize: () => Buffer.from('signed-tx') });
        mockConnectionObject.sendRawTransaction.mockResolvedValue(mockSignature);
        mockConnectionObject.confirmTransaction.mockResolvedValue({ value: { err: null } }); // التأكيد على السلسلة ينجح

        const dbErrorMessage = "Backend DB update failed";
        apiClient.post.mockResolvedValueOnce({ // /confirm-close يفشل
            data: { success: false, error: dbErrorMessage }
        });

        renderAtaManager(mockProps);
        await user.click(screen.getByLabelText(MOCK_ATA1_STR));
        await act(async () => { await user.click(screen.getByRole('button', { name: /Claim/i })); });

        await waitFor(() => {
            // يجب أن ينجح إغلاق الحسابات (toast.success)
            expect(toast.success).toHaveBeenCalledWith('Successfully closed 1 account(s)!');
            // ولكن يجب أن يظهر تحذير حول فشل تحديث الـ backend
            expect(toast.warn).toHaveBeenCalledWith("Backend stats update might be delayed.");
        });
        // onSuccessfulClose يجب أن يتم استدعاؤها لأن العملية على السلسلة نجحت
        expect(mockProps.onSuccessfulClose).toHaveBeenCalledTimes(1);
        expect(apiClient.post).toHaveBeenCalledTimes(2);
    });


    // --- اختبارات الحالات الحافية ---

    test('does not render if wallet is not connected', () => {
        mockUseWallet.mockReturnValue({ publicKey: null, connected: false }); // محفظة غير متصلة
        const { container } = renderAtaManager();
        expect(container.firstChild).toBeNull(); // لا يجب أن يتم عرض المكون
    });

    test('shows loading state when isLoadingAtas is true', () => {
        renderAtaManager({ isLoadingAtas: true });
        expect(screen.getByText(/Scanning for accounts.../i)).toBeInTheDocument();
        expect(screen.queryByText(/Available ATAs/i)).not.toBeInTheDocument();
    });

    test('shows no ATAs message when initialEmptyAtas is empty and not loading', () => {
        renderAtaManager({ initialEmptyAtas: [] });
        expect(screen.getByText(/Looks like you don't have any empty token accounts currently/i)).toBeInTheDocument();
    });

    test('claim button is disabled if no ATAs are selected', () => {
        renderAtaManager();
        const claimButton = screen.getByRole('button', { name: /Claim/i });
        expect(claimButton).toBeDisabled();
    });

    test('claim button is disabled while processing', async () => {
        const user = userEvent.setup();
        // جعل apiClient.post يُرجع Promise لا يتم حله أبدًا لمحاكاة المعالجة الطويلة
        apiClient.post.mockReturnValue(new Promise(() => {}));

        renderAtaManager({ initialEmptyAtas: [MOCK_ATA1_STR] });
        await user.click(screen.getByLabelText(MOCK_ATA1_STR));
        const claimButton = screen.getByRole('button', { name: /Claim/i });

        // لا نستخدم act هنا لأننا لا ننتظر اكتمال العملية
        user.click(claimButton);

        // تحقق من أن نص الزر تغير وأن الزر معطل
        await waitFor(() => expect(claimButton).toHaveTextContent(/Processing.../i));
        expect(claimButton).toBeDisabled();
    });

    // يمكنك إضافة المزيد من حالات الاختبار مثل:
    // - test('handles error from /prepare-close API')
    // - test('handles user rejecting transaction signing')
    // - test('handles error from sendRawTransaction')
    // - test('handles error from confirmTransaction (on-chain failure)')
    // - test('handles error from /confirm-close API')
    // - test('does not render if wallet is not connected')
    // - test('shows loading state correctly')
    // - test('shows no ATAs message correctly')
});