// src/components/Leaderboards/TopReferrersTable.js
import React from 'react';
import styles from './Leaderboards.module.css'; // استخدام نفس ملف الأنماط المشترك للمتصدرين
// تعريف ثابت للتحويل
const LAMPORTS_PER_SOL = 1000000000;

// تعريف Props التي سيستقبلها المكون
const TopReferrersTable = ({ data, isLoading, error }) => {
    console.log("TopReferrersTable Props:", { data, isLoading, error }); // <-- أضف هذا
    // ... باقي الكود

    // دالة مساعدة لعرض أيقونة أو رقم الترتيب
    const getRankContent = (rank) => {
        if (rank === 1) return <>🥇</>;
        if (rank === 2) return <>🥈</>;
        if (rank === 3) return <>🥉</>;
        return rank; // يعرض الرقم للمراكز الأخرى
    }

    // عرض رسالة التحميل
    if (isLoading) {
        return (
            <div className={`${styles.leaderboardContainer} glass-effect container`}>
                <h3 className={`${styles.title}`}>🏆 <span className="gradient-text-bold">Top Referrers (Weekly)</span></h3>
                <p className={styles.subtitle}>Top 10 wallets share 1% of weekly platform profits!</p>
                <p className={styles.loadingText}>Loading Top Referrers...</p>
            </div>
        );
    }

    // عرض رسالة الخطأ
    if (error) {
         return (
            <div className={`${styles.leaderboardContainer} glass-effect container`}>
                <h3 className={`${styles.title}`}>🏆 <span className="gradient-text-bold">Top Referrers (Weekly)</span></h3>
                <p className={styles.subtitle}>Top 10 wallets share 1% of weekly platform profits!</p>
                <p className={styles.errorText}>Warning: Could not load leaderboard data.</p>
            </div>
         );
    }

    // العرض الرئيسي للجدول أو رسالة "لا يوجد بيانات"
    return (
        <div className={`${styles.leaderboardContainer} glass-effect container`}>
            <h3 className={`${styles.title}`}>🏆 <span className="gradient-text-bold">Top Referrers (Weekly)</span></h3>
            <p className={styles.subtitle}>🚀 Bring new users this week! The Top 10 with the most new referrals earn SOL prizes. Keep the momentum!</p>

            {error && <p className={styles.errorText}>Warning: Could not load leaderboard data.</p>}

            <div style={{ overflowX: 'auto' }}>
                <table className={styles.leaderboardTable}>
                    <thead>
                    <tr>
                            <th className={styles.rankCell}>Rank</th>
                            <th className={styles.walletCell}>Wallet</th>
                            {/* *** تعديل عنوان العمود الأساسي *** */}
                            <th className={styles.scoreCell}>New Referrals (Week)</th>
                            <th className={styles.scoreCell}>Weekly Earnings (SOL)</th>
                            <th className={styles.scoreCell}>Total Referrals (All Time)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr>
                                {/* *** تحديث colSpan *** */}
                                <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#eee' }}>
                                    Loading Top Referrers...
                                </td>
                            </tr>
                        )}
                        {!isLoading && !error && data.length > 0 && (
                            data.slice(0, 15).map(user => ( // لا يزال يعرض أفضل 15
                                <tr key={user.publicKey || user.rank} className={user.rank <= 10 ? styles.topTenRow : ''}>
                                    <td className={styles.rankCell}>{getRankContent(user.rank)}</td>
                                    <td
                                        className={styles.walletCell}
                                        title={user.publicKey} // كان user.user
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigator.clipboard.writeText(user.publicKey)}
                                    >
                                        {user.shortKey}
                                    </td>
                                    {/* *** عرض weeklyReferrals كـ "score" أساسي *** */}
                                    <td className={styles.scoreCell}>
                                        <span className={user.rank <= 10 ? styles.topTenScoreHighlight : ''}>
                                            {(user.weeklyReferrals || 0).toLocaleString()}
                                        </span>
                                    </td>
                                    <td className={`${styles.scoreCell} ${styles.earningsScore}`}>
                                        {((user.weeklyEarnings || 0) / LAMPORTS_PER_SOL).toFixed(6)}
                                    </td>
                                    <td className={styles.scoreCell}>
                                        {(user.totalReferrals || 0).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                        {!isLoading && !error && data.length === 0 && (
                            <tr>
                            {/* *** تحديث colSpan *** */}
                            <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#aaa' }}>
                                No new referrals recorded yet this week. Be the first to lead!
                            </td>
                        </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TopReferrersTable;