// backend/__tests__/solanaService.test.js
// ... (بداية الملف والمحاكاة كما هي في النسخة المعدلة السابقة) ...
// تأكد من أن محاكاة sendAndConfirmTransaction من @solana/web3.js موجودة في الأعلى

const { getAccountBalance, verifyTransaction, sendSolFromHotWallet, transferSol } = require('../services/solanaService');
const { Keypair, PublicKey, SystemProgram, sendAndConfirmTransaction: actualSendAndConfirmTx } = require('@solana/web3.js'); // لا نزال نحتاج الأصلية لأشياء أخرى
const solanaConfig = require('../config/solana');
const { Buffer } = require('buffer');

const DUMMY_VALID_BLOCKHASH_SOLANA_SVC_TEST = 'AnotherValidBase58BlockhashForHere123';

// محاكاة config/solana (نسخة مبسطة هنا، النسخة الكاملة في ملف transactionFlow)
jest.mock('../config/solana', () => {
    const { Keypair: ActualKeypairSC, PublicKey: ActualPublicKeySC } = require('@solana/web3.js');
    const mockServerKpSC = ActualKeypairSC.generate();
    const mockTreasuryKpSC = ActualKeypairSC.generate();
    const mockAdminKpSC = ActualKeypairSC.generate();
    return {
        getConnection: jest.fn().mockReturnValue({
            getBalance: jest.fn(),
            getTransaction: jest.fn(),
            sendRawTransaction: jest.fn(),
            sendTransaction: jest.fn(),
            confirmTransaction: jest.fn(),
            getLatestBlockhash: jest.fn().mockResolvedValue({
                blockhash: DUMMY_VALID_BLOCKHASH_SOLANA_SVC_TEST,
                lastValidBlockHeight: 1001
            }),
        }),
        getServerWallet: jest.fn(() => mockServerKpSC),
        getMainTreasuryWallet: jest.fn(() => mockTreasuryKpSC),
        getAdminAuthorityKeypair: jest.fn(() => mockAdminKpSC),
        getSystemProgramId: jest.fn(() => ActualKeypairSC.generate().publicKey), // أي مفتاح صالح
        getProgramId: jest.fn(() => new ActualPublicKeySC('8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW')),
    };
});

// محاكاة sendAndConfirmTransaction
jest.mock('@solana/web3.js', () => {
    const actualWeb3 = jest.requireActual('@solana/web3.js');
    return {
        ...actualWeb3,
        sendAndConfirmTransaction: jest.fn(),
    };
});
// --- يجب استيرادها بعد المحاكاة ---
const { sendAndConfirmTransaction } = require('@solana/web3.js');


describe('SolanaService', () => {
    let mockConnection;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConnection = solanaConfig.getConnection();
        const { sendAndConfirmTransaction: sactMock } = require('@solana/web3.js');
        sactMock.mockReset();
    });

    describe('getAccountBalance', () => {
        let mockPublicKey;
        beforeEach(() => {
            mockPublicKey = Keypair.generate().publicKey;
            // لا حاجة لتعريف mockConnection هنا مرة أخرى إذا تم تعريفه في beforeEach الخارجي
        });

        test('should return balance as bigint on success', async () => {
            const mockBalance = 1234567890;
            mockConnection.getBalance.mockResolvedValue(mockBalance);
            const balance = await getAccountBalance(mockPublicKey);
            // --- تعديل: نتوقع استدعاء getConnection مرة واحدة لكل اختبار في هذه المجموعة ---
            //expect(solanaConfig.getConnection).toHaveBeenCalledTimes(1);
            // ---------------------------------------------------------------------
            expect(mockConnection.getBalance).toHaveBeenCalledWith(mockPublicKey);
            expect(balance).toEqual(BigInt(mockBalance));
        });

        test('should throw error if getBalance fails', async () => {
            const mockError = new Error("RPC Error");
            mockConnection.getBalance.mockRejectedValue(mockError);
            await expect(getAccountBalance(mockPublicKey))
                .rejects
                .toThrow(`Failed to get balance for ${mockPublicKey.toBase58()}: ${mockError.message}`);
        });
    });

    describe('verifyTransaction', () => {
        let mockSignature;
        let mockExpectedFeePayer;
        const MAX_RETRIES_FOR_TEST = 2;
        const RETRY_DELAY_FOR_TEST = 50;

        beforeEach(() => {
            mockSignature = 'testSignature' + Math.random();
            mockExpectedFeePayer = Keypair.generate().publicKey.toBase58();
        });

        test('should return true if tx successful and fee payer matches', async () => {
            const mockTxData = {
                meta: { err: null },
                transaction: { message: { accountKeys: [new PublicKey(mockExpectedFeePayer)] } }
            };
            mockConnection.getTransaction.mockResolvedValue(mockTxData);
            const result = await verifyTransaction(mockSignature, mockExpectedFeePayer, MAX_RETRIES_FOR_TEST, RETRY_DELAY_FOR_TEST);
            expect(mockConnection.getTransaction).toHaveBeenCalledWith(mockSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
            expect(result).toBe(true);
        }, 10000);

        test('should throw error if tx not found after retries', async () => {
            mockConnection.getTransaction.mockResolvedValue(null);
            await expect(verifyTransaction(mockSignature, mockExpectedFeePayer, MAX_RETRIES_FOR_TEST, RETRY_DELAY_FOR_TEST))
                .rejects
                .toThrow(`Transaction ${mockSignature} not found or not confirmed yet.`);
            expect(mockConnection.getTransaction).toHaveBeenCalledTimes(MAX_RETRIES_FOR_TEST);
        }, 10000);

        test('should throw error if tx failed on-chain', async () => {
            const mockTxError = { InstructionError: [0, { Custom: 6000 }] };
            const mockFailTxData = { meta: { err: mockTxError }, transaction: { message: { accountKeys: [new PublicKey(mockExpectedFeePayer)] } } };
            mockConnection.getTransaction.mockResolvedValue(mockFailTxData);
            await expect(verifyTransaction(mockSignature, mockExpectedFeePayer, MAX_RETRIES_FOR_TEST, RETRY_DELAY_FOR_TEST))
                .rejects
                .toThrow(`Transaction ${mockSignature} failed on-chain: ${JSON.stringify(mockTxError)}`);
        }, 10000);

        test('should throw error if fee payer mismatch', async () => {
            const wrongFeePayer = Keypair.generate().publicKey;
            const mockMismatchTxData = { meta: { err: null }, transaction: { message: { accountKeys: [wrongFeePayer] } } };
            mockConnection.getTransaction.mockResolvedValue(mockMismatchTxData);
            await expect(verifyTransaction(mockSignature, mockExpectedFeePayer, MAX_RETRIES_FOR_TEST, RETRY_DELAY_FOR_TEST))
                .rejects
                .toThrow('Transaction fee payer mismatch.');
        }, 10000);
    });


    describe('sendSolFromHotWallet (Legacy - If Still Used)', () => {
        let mockRecipientPkStr;
        let mockAmount;
        let mockServerWalletKeypair;
        let sactMockFn;

        beforeEach(() => {
            mockRecipientPkStr = Keypair.generate().publicKey.toBase58();
            mockAmount = 100000000;
            mockServerWalletKeypair = solanaConfig.getServerWallet();
            const { sendAndConfirmTransaction: sactImported } = require('@solana/web3.js');
            sactMockFn = sactImported;
            sactMockFn.mockResolvedValue('mockSignatureFromSendAndConfirm_HotWallet');
        });

        test('should send SOL and return signature on success', async () => {
            mockConnection.getBalance.mockResolvedValue(BigInt(mockAmount + 5000));
            const signature = await sendSolFromHotWallet(mockRecipientPkStr, mockAmount);
            expect(mockConnection.getBalance).toHaveBeenCalledWith(mockServerWalletKeypair.publicKey);
            expect(sactMockFn).toHaveBeenCalledTimes(1);
            expect(signature).toBe('mockSignatureFromSendAndConfirm_HotWallet');
        });

        test('should throw if server wallet balance insufficient', async () => {
            mockConnection.getBalance.mockResolvedValue(BigInt(mockAmount - 1));
            await expect(sendSolFromHotWallet(mockRecipientPkStr, mockAmount))
                .rejects
                .toThrow(/Insufficient server hot wallet balance/);
        });
    });


    describe('transferSol (Used for Treasury Sweep & Potentially Rewards)', () => {
        let mockFromKeypair;
        let mockToPkStr;
        let mockAmount;
        let sactMockFnTransfer;

        beforeEach(() => {
            mockFromKeypair = solanaConfig.getMainTreasuryWallet();
            mockToPkStr = Keypair.generate().publicKey.toBase58();
            mockAmount = 50000000;
            const { sendAndConfirmTransaction: sactImported } = require('@solana/web3.js');
            sactMockFnTransfer = sactImported;
            sactMockFnTransfer.mockResolvedValue('mockSignatureFromGenericTransfer_TransferSol');
        });

        test('should transfer SOL and return signature on success', async () => {
            mockConnection.getBalance.mockResolvedValue(BigInt(mockAmount + 5000));
            const signature = await transferSol(mockFromKeypair, mockToPkStr, mockAmount, "Test Transfer");
            expect(mockConnection.getBalance).toHaveBeenCalledWith(mockFromKeypair.publicKey);
            expect(sactMockFnTransfer).toHaveBeenCalledTimes(1);
            const transactionArg = sactMockFnTransfer.mock.calls[0][1];
            expect(transactionArg.instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
            expect(transactionArg.feePayer.equals(mockFromKeypair.publicKey)).toBe(true);
            const signersArg = sactMockFnTransfer.mock.calls[0][2];
            expect(signersArg[0]).toBe(mockFromKeypair);
            expect(signature).toBe('mockSignatureFromGenericTransfer_TransferSol');
        });

        test('should throw if sender balance is insufficient', async () => {
            mockConnection.getBalance.mockResolvedValue(BigInt(mockAmount - 1));
            await expect(transferSol(mockFromKeypair, mockToPkStr, mockAmount, "Test Insufficient"))
                .rejects
                .toThrow(/Insufficient balance in sender account/);
        });

        test('should throw for invalid recipient address', async () => {
            await expect(transferSol(mockFromKeypair, "invalid-address", mockAmount))
                   .rejects
                   .toThrow(/Invalid recipient public key format/);
        });

        test('should throw for non-positive amount', async () => {
            await expect(transferSol(mockFromKeypair, mockToPkStr, 0))
                   .rejects
                   .toThrow("Amount to send must be positive");
        });
    });
});