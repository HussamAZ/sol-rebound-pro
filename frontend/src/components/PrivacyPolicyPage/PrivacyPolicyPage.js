// src/components/PrivacyPolicyPage/PrivacyPolicyPage.js
import React from 'react';
import styles from './PrivacyPolicyPage.module.css'; // ستحتاج لإنشاء هذا الملف

const PrivacyPolicyPage = () => {
    return (
        <div className={`${styles.pageContainer} glass-effect container`}>
            <h1 className={`${styles.pageTitle} gradient-text-bold`}>Privacy Policy</h1>
            <p className={styles.lastUpdated}>Last Updated: May 13, 2025</p>

            <p>Welcome to Sol Rebound Pro ("we," "us," or "our"). We are committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our decentralized application (dApp) and services (collectively, the "Service").</p>
            <p>By using our Service, you agree to the collection and use of information in accordance with this policy. If you do not agree with the terms of this policy, please do not use the Service.</p>

            <h2 className={styles.sectionTitle}>1. Information We Do Not Collect</h2>
            <p>Sol Rebound Pro is designed with user privacy as a priority. We **DO NOT** collect, store, or have access to:</p>
            <ul>
                <li>Your private keys.</li>
                <li>Your IP address (beyond standard server logs which are not tied to your wallet activity).</li>
                <li>Any personal identifiable information (PII) such as your name, email address, or physical address, unless you voluntarily provide it to us through support channels (which is separate from the dApp usage).</li>
                <li>Transaction history beyond what is publicly available on the Solana blockchain and necessary for the dApp's functionality (e.g., confirming ATA closures for statistical purposes).</li>
            </ul>

            <h2 className={styles.sectionTitle}>2. Information We Process (Blockchain Data)</h2>
            <p>Our Service interacts with the Solana blockchain. When you connect your wallet and use our Service, we process the following information, which is inherently public on the blockchain or necessary for the dApp's operation:</p>
            <ul>
                <li>**Your Solana Wallet Public Key (Address):** This is necessary to identify your Associated Token Accounts (ATAs), facilitate transactions you authorize, and record your activity for features like leaderboards and referral tracking.</li>
                <li>**Associated Token Account (ATA) Addresses:** We scan for your ATAs to identify empty ones eligible for closing.</li>
                <li>**Transaction Data:** When you close ATAs, details of these transactions (signatures, amounts, involved accounts) are recorded on the Solana blockchain. Our backend may query this public data to confirm successful closures and update platform statistics or referral earnings.</li>
                <li>**Referral Data:** If you are referred by another user, or if you refer others, your public wallet address and the referrer's/referee's public wallet address will be linked in our database to calculate and track referral commissions and counts. The referrer's address might be stored in an encrypted format in our database for operational security related to the referral system.</li>
            </ul>
            <p>This information is primarily used to provide the core functionality of the Service, including ATA closing, referral rewards, and weekly leaderboards. All blockchain transaction data is, by nature, public and immutable.</p>

            <h2 className={styles.sectionTitle}>3. How We Use Blockchain Data</h2>
            <p>The blockchain-related data we process is used solely for the following purposes:</p>
            <ul>
                <li>To enable you to identify and close your empty ATAs.</li>
                <li>To facilitate the recovery of SOL rent to your wallet.</li>
                <li>To operate the referral system, including calculating and tracking referral commissions and counts.</li>
                <li>To operate the weekly rewards program, including identifying top referrers and top closers.
                </li>
                <li>To display public leaderboards and platform statistics.</li>
                <li>To troubleshoot and improve the Service.</li>
            </ul>

            <h2 className={styles.sectionTitle}>4. Data Storage and Security</h2>
            <p>While we do not collect PII through the dApp, any operational data related to your public key and referral activity (such as referral counts, earnings, and associations) is stored in our database. We take reasonable measures to protect this data from unauthorized access, use, or disclosure. This includes encryption of sensitive referral association data where applicable.</p>
            <p>Your interaction with the Solana network is secured by your own wallet and its private keys. We never have access to your private keys.</p>

            <h2 className={styles.sectionTitle}>5. Third-Party Services</h2>
            <p>We may use third-party services for analytics (e.g., website traffic, without tracking wallet activity) or to interact with the Solana blockchain (e.g., RPC providers). These services have their own privacy policies, and we encourage you to review them.</p>
            <p>Our Telegram notifications are sent via the Telegram Bot API. Your interaction with Telegram is subject to Telegram's privacy policy.</p>

            <h2 className={styles.sectionTitle}>6. Cookies and Tracking Technologies</h2>
            <p>Our frontend website may use standard web technologies like cookies for essential website functionality (e.g., session management for wallet connection state) or anonymous analytics to improve user experience. We do not use tracking cookies to profile your activity across other sites or to link your on-chain activity with off-chain identifiers without your explicit consent.</p>

            <h2 className={styles.sectionTitle}>7. Children's Privacy</h2>
            <p>Our Service is not intended for use by individuals under the age of 18 (or the age of legal majority in your jurisdiction). We do not knowingly collect any information from children.</p>

            <h2 className={styles.sectionTitle}>8. Changes to This Privacy Policy</h2>
            <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.</p>

            <h2 className={styles.sectionTitle}>9. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at: support@solrebound.com</p>
        </div>
    );
};

export default PrivacyPolicyPage;