// backend/config/vault.js
const vaultClient = require('node-vault');

// تهيئة عميل Vault مرة واحدة
const vaultOptions = {
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
    token: process.env.VAULT_TOKEN || 'your_root_token' // استخدم توكن الجذر للتطوير، ستحتاج لتوكن أكثر تحديدًا للإنتاج
};

console.log("Initializing Vault client with options:", { apiVersion: vaultOptions.apiVersion, endpoint: vaultOptions.endpoint, token: vaultOptions.token ? '******' : 'Not Set' });

const vaultInstance = vaultClient(vaultOptions);

module.exports = vaultInstance;