// backend/__tests__/transactionFlow.integration.test.js

const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
// --- استيراد Keypair و PublicKey و Transaction بعد المحاكاة ---

const solanaConfig = require('../config/solana');
const axios = require('axios');

let app;

const Referral = require('../models/Referral');
const PlatformEarning = require('../models/PlatformEarning');

// --- !! عرف الثابت هنا في النطاق الأعلى !! ---
const { PublicKey: Web3PublicKey } = require('@solana/web3.js'); // استيراد مبكر لـ PublicKey
const DUMMY_VALID_BLOCKHASH_INTEGRATION = Web3PublicKey.default.toBase58();
// ---------------------------------------------

function decryptDataLocalForTest(encryptedDataWithMeta) {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'; // استخدم نفس المفتاح الوهمي
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) return encryptedDataWithMeta;
    if (!encryptedDataWithMeta || typeof encryptedDataWithMeta !== 'string' || !encryptedDataWithMeta.includes(':')) return encryptedDataWithMeta;
    try {
        const parts = encryptedDataWithMeta.split(':');
        if (parts.length !== 3) return encryptedDataWithMeta;
        const [ivHex, authTagHex, encryptedHex] = parts;
        if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedHex)) return encryptedDataWithMeta;
        const { Buffer: NodeBuffer } = require('buffer'); // استيراد Buffer هنا
        const { webcrypto } = require('node:crypto'); // استيراد webcrypto هنا

        const iv = NodeBuffer.from(ivHex, 'hex');
        const authTag = NodeBuffer.from(authTagHex, 'hex');
        const algorithm = 'aes-256-gcm';
        // لاستخدام webcrypto.subtle، يجب أن يكون المفتاح CryptoKey
        // هذه الخطوة قد تكون معقدة قليلاً هنا للاختبار المباشر
        // البديل هو استخدام crypto.createDecipheriv إذا كان متاحًا في بيئة Jest
        const cryptoNode = require('crypto');
        const decipher = cryptoNode.createDecipheriv(algorithm, NodeBuffer.from(ENCRYPTION_KEY, 'hex'), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("TEST_DECRYPT_FAIL for data:", encryptedDataWithMeta, "Error:", error.message);
        return encryptedDataWithMeta;
    }
}
// -------------------------------------------------------------------------------------------------



jest.mock('../config/solana', () => {
    const { Keypair: ActualKeypair, PublicKey: ActualPublicKey } = require('@solana/web3.js');
    const { Buffer: ActualBuffer } = require('buffer');

    // --- !! عرف قيمة blockhash هنا مباشرة كقيمة حرفية !! ---
    const MOCK_BLOCKHASH_FOR_INTEGRATION_TESTS = '11111111111111111111111111111111'; // أو أي سلسلة base58 صالحة
    // ---------------------------------------------------------

    const mockServerKp = ActualKeypair.generate();
    const mockTreasuryKp = ActualKeypair.generate();
    const mockAdminKp = ActualKeypair.generate();

    return {
        getConnection: jest.fn().mockReturnValue({
            getTransaction: jest.fn(),
            sendRawTransaction: jest.fn(),
            sendTransaction: jest.fn(),
            confirmTransaction: jest.fn(),
            getBalance: jest.fn(),
            getLatestBlockhash: jest.fn().mockResolvedValue({
                blockhash: MOCK_BLOCKHASH_FOR_INTEGRATION_TESTS, // <--- استخدم القيمة المعرفة هنا
                lastValidBlockHeight: 999
            }),
        }),
        getServerWallet: jest.fn(() => mockServerKp),
        // ... (باقي محاكاة config/solana كما هي) ...
        getMainTreasuryWallet: jest.fn(() => mockTreasuryKp),
        getAdminAuthorityKeypair: jest.fn(() => mockAdminKp),

        getProgramId: jest.fn(() => new ActualPublicKey('8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW')),
        getTreasuryPublicKey: jest.fn(() => mockTreasuryKp.publicKey),
        getAdminAuthorityPublicKey: jest.fn(() => mockAdminKp.publicKey),
        getFinalStoragePublicKey: jest.fn(() => ActualKeypair.generate().publicKey),
        getTokenProgramId: jest.fn(() => new ActualPublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')),
        getSystemProgramId: jest.fn(() => new ActualPublicKey('11111111111111111111111111111111')),

        initializeSolana: jest.fn().mockResolvedValue(),
        getProgram: jest.fn().mockReturnValue({
             coder: {
                instruction: {
                    encode: jest.fn().mockReturnValue(ActualBuffer.from([]))
                }
             }
        }),
    };
});

jest.mock('axios');

jest.mock('@solana/web3.js', () => {
    const actualWeb3 = jest.requireActual('@solana/web3.js');
    return {
        ...actualWeb3,
        sendAndConfirmTransaction: jest.fn(),
    };
});

// --- استيرادها بعد المحاكاة ---
const { Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { Buffer } = require('buffer');


const MOCK_USER_KEYPAIR = Keypair.generate();
const MOCK_USER_KEY_STR = MOCK_USER_KEYPAIR.publicKey.toBase58();
const MOCK_REF_KEYPAIR = Keypair.generate();
const MOCK_REF_KEY_STR = MOCK_REF_KEYPAIR.publicKey.toBase58();
const MOCK_ATA1_KEY_STR = Keypair.generate().publicKey.toBase58();
const MOCK_ATA2_KEY_STR = Keypair.generate().publicKey.toBase58();

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGO_URI = mongoUri;
    const serverModule = require('../server');
    app = serverModule;
    await mongoose.connect(mongoUri);
    const { sendAndConfirmTransaction } = require('@solana/web3.js');
    sendAndConfirmTransaction.mockReset();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    const mockConnection = solanaConfig.getConnection();
    mockConnection.getTransaction.mockReset();
    mockConnection.sendRawTransaction.mockReset();
    mockConnection.sendTransaction.mockReset();
    mockConnection.confirmTransaction.mockReset();
    mockConnection.getBalance.mockReset();
    // mockConnection.getLatestBlockhash.mockReset(); // <--- يمكن إزالة هذا إذا كان ثابتًا
    solanaConfig.getServerWallet.mockClear();
    solanaConfig.getMainTreasuryWallet.mockClear();
    solanaConfig.getAdminAuthorityKeypair.mockClear();
    axios.post.mockClear();
    const { sendAndConfirmTransaction } = require('@solana/web3.js');
    sendAndConfirmTransaction.mockReset();

    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

// ... (باقي الاختبارات كما هي) ...
describe('Read Endpoints Integration Tests', () => {
    // ... (الاختبارات كما هي)
     describe('GET /api/referrals/info', () => {
         const testUserKey = Keypair.generate().publicKey.toBase58();

         test('should return default referral info for a new user', async () => {
             const res = await request(app)
                 .get(`/api/referrals/info?user=${testUserKey}`)
                 .expect(200);
             expect(res.body.success).toBe(true);
             expect(res.body.data.user).toBe(testUserKey);
             expect(res.body.data.isNewUser).toBe(true);
         });
     });
     describe('GET /api/leaderboards/top-referrers', () => {
         test('should return an empty array when no referrers exist', async () => {
             const res = await request(app)
                 .get('/api/leaderboards/top-referrers')
                 .expect(200);
             expect(res.body.success).toBe(true);
             expect(res.body.data).toEqual([]);
         });
     });
     describe('GET /api/stats/overall', () => {
         test('should return zeros when there is no data', async () => {
             const res = await request(app)
                 .get('/api/stats/overall')
                 .expect(200);
             expect(res.body.data.totalClosedAccounts).toBe(0);
         });
     });
});


describe('Transaction Flow Integration Test (Close ATAs)', () => {
    jest.setTimeout(20000);

    test('should successfully initialize user, prepare, and confirm close transaction', async () => {
        // ... (خطوات الإعداد واستدعاء initializeUser كما هي) ...
        const initializePayload = {
            userPublicKeyString: MOCK_USER_KEY_STR,
            potentialReferrer: MOCK_REF_KEY_STR
        };
        const initRes = await request(app)
            .post('/api/users/initialize')
            .send(initializePayload)
            .expect(200);
        expect(initRes.body.success).toBe(true);
        expect(initRes.body.wasCreated).toBe(true);

        // ... (محاكاة getTransaction و axios.post كما هي) ...
        const mockSignature = 'mockIntegrationSignature' + Date.now();
        const mockSuccessfulTxData = {
            meta: { err: null },
            transaction: {
                message: { accountKeys: [MOCK_USER_KEYPAIR.publicKey, MOCK_REF_KEYPAIR.publicKey, solanaConfig.getTreasuryPublicKey()] },
                signatures: [mockSignature]
            }
        };
        solanaConfig.getConnection().getTransaction.mockResolvedValue(mockSuccessfulTxData);
        axios.post.mockResolvedValue({ data: { ok: true } });

        // ... (استدعاء prepare-close و confirm-close كما هو) ...
        const preparePayload = {
            userPublicKeyString: MOCK_USER_KEY_STR,
            ataAddresses: [MOCK_ATA1_KEY_STR, MOCK_ATA2_KEY_STR],
            referrerPublicKeyString: MOCK_REF_KEY_STR
        };
        const prepareRes = await request(app)
            .post('/api/transactions/prepare-close')
            .send(preparePayload)
            .expect(200);
        expect(prepareRes.body.success).toBe(true);
        const platformFeeFromPrepare = prepareRes.body.platformFeeLamports;

        const confirmPayload = {
            signature: mockSignature,
            userPublicKeyString: MOCK_USER_KEY_STR,
            referrerPublicKeyString: MOCK_REF_KEY_STR,
            closedCount: preparePayload.ataAddresses.length,
            platformFeeLamportsString: platformFeeFromPrepare
        };
        const confirmRes = await request(app)
            .post('/api/transactions/confirm-close')
            .send(confirmPayload)
            .expect(200);
        expect(confirmRes.body.success).toBe(true);


        // --- !! التعديل هنا !! ---
        const userRecordRaw = await Referral.findOne({ user: MOCK_USER_KEY_STR }).lean();
        expect(userRecordRaw).not.toBeNull();
        expect(userRecordRaw.closedAccounts).toBe(2);

        // فك تشفير حقل المحيل يدويًا قبل التأكيد
        const decryptedReferrerInUserRecord = userRecordRaw.referrer ? decryptDataLocalForTest(userRecordRaw.referrer) : null;
        expect(decryptedReferrerInUserRecord).toBe(MOCK_REF_KEY_STR);
        // -------------------------

        const referrerRecord = await Referral.findOne({ user: MOCK_REF_KEY_STR }).lean();
        expect(referrerRecord).not.toBeNull();
        expect(referrerRecord.referralsCount).toBe(1);
        expect(referrerRecord.weeklyReferralsCount).toBe(1);
        expect(referrerRecord.totalEarnings).toBeGreaterThan(0);

        const earningRecord = await PlatformEarning.findOne({ transactionSignature: mockSignature }).lean();
        expect(earningRecord).not.toBeNull();
    });

    test('should return 400 if transaction verification fails (fee payer mismatch)', async () => {
        await request(app).post('/api/users/initialize').send({ userPublicKeyString: MOCK_USER_KEY_STR, potentialReferrer: null }).expect(200);

        const preparePayload = { userPublicKeyString: MOCK_USER_KEY_STR, ataAddresses: [MOCK_ATA1_KEY_STR], referrerPublicKeyString: null };
        const prepareRes = await request(app).post('/api/transactions/prepare-close').send(preparePayload).expect(200);
        const platformFeeFromPrepare = prepareRes.body.platformFeeLamports;

        const mockSignatureFail = 'mockFailSigFeePayer' + Date.now();
        const wrongFeePayer = Keypair.generate().publicKey;
        const mockFailTxData = {
            meta: { err: null },
            transaction: { message: { accountKeys: [wrongFeePayer] }, signatures: [mockSignatureFail] }
        };
        solanaConfig.getConnection().getTransaction.mockResolvedValue(mockFailTxData);

        const confirmPayload = {
            signature: mockSignatureFail,
            userPublicKeyString: MOCK_USER_KEY_STR,
            referrerPublicKeyString: null,
            closedCount: 1,
            platformFeeLamportsString: platformFeeFromPrepare
        };
        const confirmRes = await request(app)
            .post('/api/transactions/confirm-close')
            .send(confirmPayload)
            .expect(400);
        expect(confirmRes.body.success).toBe(false);
        expect(confirmRes.body.error).toContain('Transaction verification failed: Transaction fee payer mismatch.');

        const userRecord = await Referral.findOne({ user: MOCK_USER_KEY_STR }).lean();
        expect(userRecord).not.toBeNull(); // المستخدم تم إنشاؤه بواسطة initializeUser
        expect(userRecord.closedAccounts).toBe(0); // ولكن لم يتم تحديث إغلاقاته
    });
});

describe('POST /api/transactions/confirm-close failure cases (verifyTransaction)', () => {
    const testUserKey = Keypair.generate().publicKey.toBase58();
    const mockSignature = 'mockFailureCaseSignature' + Date.now();
    const confirmPayload = {
        signature: mockSignature, userPublicKeyString: testUserKey,
        referrerPublicKeyString: null, closedCount: 1, platformFeeLamportsString: '500000'
    };

    test('should return 400 if transaction is not found (getTransaction returns null)', async () => {
        solanaConfig.getConnection().getTransaction.mockResolvedValue(null);
        const res = await request(app).post('/api/transactions/confirm-close').send(confirmPayload).expect(400);
        expect(res.body.error).toMatch(/not found or not confirmed yet/i);
    }, 15000); // زيادة المهلة لهذا الاختبار

    test('should return 400 if transaction failed on-chain (meta.err)', async () => {
        const mockTxError = { InstructionError: [0, { Custom: 6009 }] };
        const mockFailedTxData = {
            meta: { err: mockTxError },
            transaction: { message: { accountKeys: [new PublicKey(testUserKey)] }, signatures: [mockSignature] }
        };
        solanaConfig.getConnection().getTransaction.mockResolvedValue(mockFailedTxData);
        const res = await request(app).post('/api/transactions/confirm-close').send(confirmPayload).expect(400);
        expect(res.body.error).toMatch(/failed on-chain/i);
        expect(res.body.error).toContain(JSON.stringify(mockTxError));
    }, 15000); // زيادة المهلة لهذا الاختبار
});