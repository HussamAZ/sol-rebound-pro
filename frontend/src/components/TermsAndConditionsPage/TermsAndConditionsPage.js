// src/components/TermsAndConditionsPage/TermsAndConditionsPage.js
import React from 'react';
// استخدم نفس ملف الأنماط لسياسة الخصوصية إذا كان التصميم متشابهًا، أو أنشئ واحدًا جديدًا
import styles from '../PrivacyPolicyPage/PrivacyPolicyPage.module.css'; // إعادة استخدام الأنماط

const TermsAndConditionsPage = () => {
    return (
        <div className={`${styles.pageContainer} glass-effect container`}>
            <h1 className={`${styles.pageTitle} gradient-text-bold`}>Terms and Conditions</h1>
            <p className={styles.lastUpdated}>Last Updated: May 13, 2025</p>

            <p>Please read these Terms and Conditions ("Terms", "Terms and Conditions") carefully before using the Sol Rebound Pro decentralized application (the "Service") operated by the Sol Rebound Pro team" ("us", "we", or "our").</p>
            <p>Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users, and others who access or use the Service. By accessing or using the Service you agree to be bound by these Terms. If you disagree with any part of the terms then you may not access the Service.</p>

            <h2 className={styles.sectionTitle}>1. The Service</h2>
            <p>Sol Rebound Pro provides a tool to help users identify and close empty Associated Token Accounts (ATAs) on the Solana blockchain to recover SOL paid for rent. The Service also includes a referral program and weekly rewards based on platform activity.</p>
            <p>The Service interacts directly with the Solana blockchain. All transactions initiated through the Service (e.g., closing ATAs) are executed on the Solana network and require your explicit authorization via your connected Solana wallet. You are solely responsible for managing your wallet, private keys, and any transactions you authorize.</p>

            <h2 className={styles.sectionTitle}>2. Eligibility</h2>
            <p>You must be of legal age in your jurisdiction to use this Service. By using the Service, you represent and warrant that you meet this requirement.</p>

            <h2 className={styles.sectionTitle}>3. Risks and Disclaimers</h2>
            <p><strong>No Financial Advice:</strong> The information and tools provided by Sol Rebound Pro are for informational and utility purposes only and do not constitute financial, investment, or any other form of advice. You should conduct your own research and consult with a qualified professional before making any financial decisions.</p>
            <p><strong>Blockchain Risks:</strong> You understand and acknowledge the inherent risks associated with cryptographic systems, blockchain technology, and decentralized applications. These risks include, but are not limited to, smart contract vulnerabilities, network congestion, and the volatility of digital assets. We are not responsible for any losses incurred due to these inherent risks.</p>
            <p><strong>Smart Contract Security:</strong> While we have made efforts to ensure the security and correctness of our smart contract, including automated testing, the smart contract code should be considered "as is" and "as available." We strongly encourage users to review the smart contract code (if technically proficient) or rely on community audits if available. Interacting with any smart contract carries inherent risk.</p>
            <p><strong>No Guarantees:</strong> We do not guarantee that the Service will be error-free, uninterrupted, or that all empty ATAs will be successfully closed or that any specific amount of SOL will be recovered. The recovery amount depends on the Solana network's rent-exempt minimum at the time of closing and network fees.</p>
            <p><strong>Fees:</strong> The Service charges a platform fee (currently 25% of the recovered rent) for closing ATAs. A portion of this fee may be distributed as a referral commission. You are also responsible for all Solana network transaction fees. Fee structures are subject to change, and any changes will be communicated through the platform or our official channels.</p>

            <h2 className={styles.sectionTitle}>4. User Responsibilities</h2>
            <ul>
                <li>You are responsible for the security of your wallet, private keys, and any connected accounts.</li>
                <li>You are responsible for verifying the details of any transaction before authorizing it in your wallet.</li>
                <li>You agree not to use the Service for any illegal or unauthorized purpose.</li>
                <li>You are responsible for complying with all applicable laws and regulations in your jurisdiction.</li>
            </ul>

            <h2 className={styles.sectionTitle}>5. Referral Program and Rewards</h2>
            <p>The referral program and weekly rewards are offered at our discretion and are subject to change or termination at any time. The specific rules, eligibility criteria, and reward amounts will be detailed on the platform. We reserve the right to disqualify any user from participating in these programs for any reason, including suspected fraudulent activity or abuse of the system.</p>
            <p>All rewards are paid out in SOL or other tokens as specified by the platform. You are responsible for any tax implications arising from receiving these rewards.</p>

            <h2 className={styles.sectionTitle}>6. Intellectual Property</h2>
            <p>The Service and its original content (excluding user-generated content or on-chain data), features, and functionality are and will remain the exclusive property of Sol Rebound Pro and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.</p>
            <p>The smart contract code, if made public, may be subject to its own open-source or specific license terms. Please refer to the smart contract repository for such details.</p>

            <h2 className={styles.sectionTitle}>7. Limitation of Liability</h2>
            <p>To the fullest extent permitted by applicable law, in no event shall Sol Rebound Pro, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the Service; (ii) any conduct or content of any third party on the Service; (iii) any content obtained from the Service; and (iv) unauthorized access, use, or alteration of your transmissions or content, whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.</p>
            <p>Our total liability to you for all claims arising out of or relating to these Terms or your use of the Service will not exceed the amount of platform fees you paid to us for the use of the Service in the [e.g., 12 months] period preceding the event giving rise to the claim, or [e.g., $100 USD] if no fees have been paid.</p>

            <h2 className={styles.sectionTitle}>8. Indemnification</h2>
            <p>You agree to defend, indemnify, and hold harmless Sol Rebound Pro and its licensee and licensors, and their employees, contractors, agents, officers, and directors, from and against any and all claims, damages, obligations, losses, liabilities, costs or debt, and expenses (including but not limited to attorney's fees), resulting from or arising out of a) your use and access of the Service, or b) a breach of these Terms.</p>

            <h2 className={styles.sectionTitle}>9. Nature of Service, Governing Law, and Dispute Resolution</h2>
            <p><strong>Nature of Service and "As-Is" Provision:</strong> Sol Rebound Pro (the "Service") is provided as a software tool designed to facilitate user interaction with the Solana blockchain, specifically for identifying and managing Associated Token Accounts (ATAs). The Service is offered on an "as-is" and "as-available" basis without any warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance. We do not warrant that the Service will be uninterrupted, secure, or error-free.</p>

            <p><strong>User Responsibility for Actions and Legal Compliance:</strong> You acknowledge and agree that you are solely responsible for all actions you take while using the Service and for ensuring your compliance with all applicable local, state, national, and international laws, rules, and regulations in connection with your use thereof. We make no representation or warranty that the Service is appropriate, lawful, or available for use in all jurisdictions. Accessing or using the Service is strictly prohibited from any territory where its content or use is deemed illegal. If you choose to access or use the Service from such locations, you do so at your own initiative and risk.</p>

            <p><strong>Governing Principles and Interpretation:</strong> These Terms and your use of the Service will be interpreted in good faith and in accordance with generally accepted principles of international commercial law and digital service provision, with a view to upholding the intended functionality of the Service. This shall be without regard to any specific national or state conflict of law provisions if the application of such provisions would fundamentally restrict, prohibit, or alter the core functionalities of the Service as described or intended.</p>

            <p><strong>Dispute Resolution:</strong> We are committed to user satisfaction and encourage you to contact us directly at support@solrebound.com to resolve any concerns or disputes you may have. Should a dispute arise that cannot be resolved amicably through direct negotiation within a reasonable timeframe (e.g., 30 days), both you and we agree to first explore confidential mediation with a mutually agreed-upon neutral mediator. If mediation is unsuccessful, any unresolved dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be definitively settled by binding arbitration. The arbitration shall be conducted by a single arbitrator, administered by a recognized international arbitration institution (to be mutually agreed upon, such as the ICC International Court of Arbitration or a similar reputable body), and governed by its rules for commercial arbitration. The language of the arbitration shall be English, and the seat (or legal place) of arbitration shall be a mutually agreed neutral jurisdiction. This agreement to arbitrate shall survive the termination of these Terms. Notwithstanding the foregoing, claims qualifying for small claims court may be pursued in such courts.</p>

            <p><strong>Waiver of Class Action:</strong> To the fullest extent permitted by applicable law, all disputes shall be resolved by arbitration on an individual basis. You and we agree that no dispute shall be arbitrated on a class-action basis or a consolidated basis, and you hereby waive all rights to have any dispute arbitrated on a class-action or consolidated basis.</p>

            <h2 className={styles.sectionTitle}>10. Changes to Terms</h2>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.</p>

            <h2 className={styles.sectionTitle}>11. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at: support@solrebound.com</p>
        </div>
    );
};

export default TermsAndConditionsPage;