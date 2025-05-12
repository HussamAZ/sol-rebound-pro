// src/components/Leaderboards/TopClosersTable.js
import React from 'react';
import styles from './Leaderboards.module.css'; // استخدام نفس ملف الأنماط

const TopClosersTable = ({ data, isLoading, error }) => {
    console.log("TopClosersTable Props:", { data, isLoading, error }); // <-- أضف هذا
    // ... باقي الكود

     const getRankContent = (rank) => {
        if (rank === 1) return <>🥇</>;
        if (rank === 2) return <>🥈</>;
        if (rank === 3) return <>🥉</>;
        return rank;
    }

    return (
        <div className={`${styles.leaderboardContainer} glass-effect container`}>
            <h3 className={`${styles.title}`}>
                ✨ <span className="gradient-text-bold">Top Closers (Weekly)</span>
            </h3>
            <p className={styles.subtitle}>🕹️ Level up your closing game! The Top 10 weekly high-scorers unlock SOL rewards. Go for the top! 🌟</p>

            {error && <p className={styles.errorText}>Warning: Could not load leaderboard data.</p>}
            {isLoading && <p className={styles.loadingText}>Loading Top Closers...</p>}
            {!isLoading && !error && (
                data.length > 0 ? (
                    <table className={styles.leaderboardTable}>
                        <thead>
                            <tr>
                                <th className={styles.rankCell}>Rank</th>
                                <th className={styles.walletCell}>Wallet</th>
                                <th className={styles.scoreCell}>Accounts Closed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.slice(0, 15).map(user => ( // <-- عرض أفضل 15
                                <tr key={user.publicKey || user.rank} className={user.rank <= 10 ? styles.topTenRow : ''}>
                                    <td className={styles.rankCell}>{getRankContent(user.rank)}</td>
                                    <td className={styles.walletCell}>{user.shortKey}</td>
                                    <td className={`${styles.scoreCell} ${styles.accountsScore}`}>
                                        {/* *** تطبيق فئة شرطية على الرقم *** */}
                                        <span className={user.rank <= 10 ? styles.topTenScoreHighlight : ''}>
                                            {user.weeklyClosedAccounts?.toLocaleString() ?? '0'}
                                        </span>
                                        {/* -------------------------------- */}
                                    </td>
                               </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className={styles.emptyText}>No accounts closed yet this week. Start claiming!</p>
                )
            )}
        </div>
    );
};

export default TopClosersTable;