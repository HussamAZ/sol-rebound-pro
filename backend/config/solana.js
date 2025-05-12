// backend/config/solana.js
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
// *** استورد مكتبة node-vault مباشرة ***
const vaultFactory = require('node-vault');
const { PROGRAM_ID_STRING, TREASURY_PUBLIC_KEY_STRING, FINAL_STORAGE_PUBLIC_KEY_STRING, 
    TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, ADMIN_AUTHORITY_STRING } = require('./constants');

// متغيرات سيتم تصديرها بعد التهيئة
let connection;
let provider;
let program;
let serverWalletKeypair; // للمحفظة الساخنة
let mainTreasuryKeypair; // للخزانة الرئيسية التي سترسل الأموال
let adminAuthorityKeypair; // لسلطة الإدارة التي توقع على distribute_rewards
let idl;
let programId;
let treasuryPublicKey; // المفتاح العام للخزانة الرئيسية (من constants)
let finalStoragePublicKey;
let adminAuthorityPublicKey; // المفتاح العام لسلطة الإدارة (من constants)

// دالة مساعدة لمعالجة وقراءة المفتاح السري من Vault
async function loadKeypairFromVault(vaultInstance, secretPath, walletName) {
    console.log(`Attempting to read secret from Vault for ${walletName} at path: ${secretPath}`);
    const secret = await vaultInstance.read(secretPath);

    if (!secret || !secret.data || !secret.data.data || typeof secret.data.data.secretKey === 'undefined') {
        throw new Error(`Invalid secret structure received from Vault for ${walletName} at ${secretPath}. Expected 'secretKey' field.`);
    }

    const secretKeyValueFromVault = secret.data.data.secretKey;
    let secretKeyArray;

    if (typeof secretKeyValueFromVault === 'string') {
        try {
            secretKeyArray = JSON.parse(secretKeyValueFromVault);
        } catch (parseError) {
            throw new Error(`Failed to parse secretKey JSON string from Vault for ${walletName}: ${parseError.message}`);
        }
    } else if (Array.isArray(secretKeyValueFromVault)) {
        secretKeyArray = secretKeyValueFromVault;
    } else {
        throw new Error(`Unexpected type for secretKey value from Vault for ${walletName}: ${typeof secretKeyValueFromVault}`);
    }

    if (!Array.isArray(secretKeyArray) || !secretKeyArray.every(num => typeof num === 'number' && num >= 0 && num <= 255)) {
        throw new Error(`Processed secretKeyArray for ${walletName} is invalid (not an array of bytes). Length: ${secretKeyArray?.length}`);
    }

    const secretKeyUint8 = Uint8Array.from(secretKeyArray);
    // عادةً مفتاح Solana الخاص هو 64 بايت (أول 32 بايت هي المفتاح السري الفعلي، والـ 32 التالية هي المفتاح العام المشتق)
    // Keypair.fromSecretKey تتوقع الـ 64 بايت
    if (secretKeyUint8.length !== 64) {
        throw new Error(`Incorrect secret key size for ${walletName} after Uint8Array.from. Expected 64, got ${secretKeyUint8.length}. Ensure the full 64-byte secret (private + public part) is stored.`);
    }
    const keypair = Keypair.fromSecretKey(secretKeyUint8);
    console.log(`${walletName} loaded successfully from Vault. Public Key: ${keypair.publicKey.toBase58()}`);
    return keypair;
}


// دالة التهيئة غير المتزامنة
async function initializeSolana() {
    console.log("Initializing Solana configuration...");

    // --- *** 1. تهيئة Vault Client الأساسي (بدون توكن مبدئيًا) *** ---
    const vaultOptions = {
        apiVersion: 'v1',
        endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
        // لا نضع توكن هنا
    };
    // *** استخدم vaultFactory المستورد ***
    const vaultInstance = vaultFactory(vaultOptions);

    // --- *** 2. المصادقة باستخدام AppRole *** ---
    let clientToken; // لا نحتاج هذا المتغير خارج نطاق try
    try {
        const roleId = process.env.VAULT_ROLE_ID;
        const secretId = process.env.VAULT_SECRET_ID;

        if (!roleId || !secretId) {
            throw new Error("VAULT_ROLE_ID or VAULT_SECRET_ID not found in environment variables.");
        }

        console.log("Attempting Vault AppRole login...");
        const result = await vaultInstance.approleLogin({
            role_id: roleId,
            secret_id: secretId,
        });

        if (!result.auth || !result.auth.client_token) {
             throw new Error("AppRole login failed or did not return a client token.");
        }
        // *** تعيين التوكن المؤقت مباشرة لـ vaultInstance ***
        vaultInstance.token = result.auth.client_token;
        console.log("Vault AppRole login successful. Client token obtained.");

    } catch (approleError) {
        console.error("!!! CRITICAL: Vault AppRole Authentication Failed:", approleError.message);
        console.error(approleError.response?.data || approleError); // طباعة تفاصيل الخطأ من Vault إن وجدت
        throw approleError; // إيقاف التهيئة
    }

    // --- 3. تهيئة الاتصال (كما كانت) ---
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
    console.log(`Solana connection initialized to: ${rpcUrl}`);

    // --- 4. تحميل IDL (كما كان) ---
    try {
        const idlPath = path.resolve(__dirname, '../ata_claim.json');
        if (!fs.existsSync(idlPath)) { throw new Error(`IDL file not found at path: ${idlPath}`); }
        idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
        console.log("IDL loaded successfully.");
    } catch (idlError) {
        console.error("!!! CRITICAL: Failed to load or parse IDL file.", idlError);
        throw idlError;
    }

    // --- 5. تحويل المفاتيح العامة من الثوابت (كما كان) ---
    try {
        programId = new PublicKey(PROGRAM_ID_STRING);
        treasuryPublicKey = new PublicKey(TREASURY_PUBLIC_KEY_STRING);
        finalStoragePublicKey = new PublicKey(FINAL_STORAGE_PUBLIC_KEY_STRING);
        adminAuthorityPublicKey = new PublicKey(ADMIN_AUTHORITY_STRING);
        console.log(`Program ID: ${programId.toBase58()}`);
        console.log(`Treasury Key: ${treasuryPublicKey.toBase58()}`);
        console.log(`Final Storage Key: ${finalStoragePublicKey.toBase58()}`);
        console.log(`Admin Authority Key: ${adminAuthorityPublicKey.toBase58()}`);
    } catch (keyError) {
        console.error("!!! CRITICAL: Failed to parse one or more public keys from constants.", keyError);
        throw keyError;
    }

    // --- 6. تحميل مفتاح المحفظة الساخنة من Vault (باستخدام التوكن المؤقت) ---
    let secret;
    try {
        // تحميل المفاتيح الخاصة من Vault
        serverWalletKeypair = await loadKeypairFromVault(vaultInstance, 'secret/data/server-hot-wallet', 'Server Hot Wallet');
        mainTreasuryKeypair = await loadKeypairFromVault(vaultInstance, 'secret/data/main-treasury-wallet', 'Main Treasury Wallet');
        adminAuthorityKeypair = await loadKeypairFromVault(vaultInstance, 'secret/data/admin-authority-wallet', 'Admin Authority Wallet');

        // *** تحقق إضافي: تأكد أن المفاتيح العامة المشتقة من المفاتيح الخاصة في Vault تطابق العناوين في constants.js ***
        if (!mainTreasuryKeypair.publicKey.equals(treasuryPublicKey)) {
            throw new Error(`Mismatch: Main Treasury public key from Vault (${mainTreasuryKeypair.publicKey.toBase58()}) does not match constant (${treasuryPublicKey.toBase58()}).`);
        }
        if (!adminAuthorityKeypair.publicKey.equals(adminAuthorityPublicKey)) {
            throw new Error(`Mismatch: Admin Authority public key from Vault (${adminAuthorityKeypair.publicKey.toBase58()}) does not match constant (${adminAuthorityPublicKey.toBase58()}).`);
        }
        // لا يوجد تحقق للمحفظة الساخنة لأن عنوانها غير ثابت في constants.js

    } catch (vaultKeyError) {
        console.error(`!!! CRITICAL: Error loading one or more keypairs from Vault: ${vaultKeyError.message}`);
        throw vaultKeyError;
    }

    // --- 7. تهيئة Anchor Provider و Program (كما كان) ---
    if (!serverWalletKeypair) { // هذا التحقق قد لا يكون ضروريًا إذا كان loadKeypairFromVault يرمي خطأ
        const errorMsg = "!!! CRITICAL: serverWalletKeypair is not defined before creating Wallet interface.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    const defaultWalletForProvider = new anchor.Wallet(serverWalletKeypair);
    provider = new anchor.AnchorProvider(connection, defaultWalletForProvider, {
        preflightCommitment: "confirmed",
        commitment: "confirmed",
    });
    console.log(`Anchor Provider initialized. Default Wallet (Hot Wallet): ${defaultWalletForProvider.publicKey.toBase58()}`);

    if (!idl) {
        const errorMsg = "!!! CRITICAL: IDL is not loaded before creating Program.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    program = new anchor.Program(idl, programId, provider);
    console.log(`Anchor Program initialized successfully.`);
    console.log("Solana configuration initialized successfully using AppRole and all required keypairs loaded.");
}

// تصدير دالة التهيئة والمتغيرات التي سيتم ملؤها
module.exports = {
    initializeSolana,
    getConnection: () => connection,
    getProvider: () => provider,
    getProgram: () => program,
    getServerWallet: () => serverWalletKeypair,        // مفتاح المحفظة الساخنة
    getMainTreasuryWallet: () => mainTreasuryKeypair,  // مفتاح الخزانة الرئيسية (للتوقيع)
    getAdminAuthorityKeypair: () => adminAuthorityKeypair, // مفتاح سلطة الإدارة (للتوقيع)
    getProgramId: () => programId,
    getTreasuryPublicKey: () => treasuryPublicKey,          // عنوان الخزانة الرئيسية (للاستخدام كوجهة/مصدر)
    getFinalStoragePublicKey: () => finalStoragePublicKey,
    getAdminAuthorityPublicKey: () => adminAuthorityPublicKey, // عنوان سلطة الإدارة (للتحقق في العقد)
    getTokenProgramId: () => TOKEN_PROGRAM_ID,
    getSystemProgramId: () => SYSTEM_PROGRAM_ID,
};