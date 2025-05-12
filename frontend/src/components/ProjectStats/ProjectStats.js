// src/components/ProjectStats/ProjectStats.js
import React, { useState, useEffect } from 'react';
import styles from './ProjectStats.module.css';
import apiClient from '../../api/axiosInstance'; // استيراد axios instance

const ProjectStats = () => {
    const [stats, setStats] = useState({
        totalClosedAccounts: 0,
        totalSolRecoveredForUsers: 0,
        totalSolPaidToReferrers: 0,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            setError('');
            try {
                console.log("ProjectStats: Fetching overall stats...");
                const response = await apiClient.get('/stats/overall'); // استدعاء API
                if (response.data?.success && response.data.data) {
                    setStats({
                        totalClosedAccounts: response.data.data.totalClosedAccounts || 0,
                        totalSolRecoveredForUsers: response.data.data.totalSolRecoveredForUsers || 0,
                        totalSolPaidToReferrers: response.data.data.totalSolPaidToReferrers || 0,
                    });
                    console.log("ProjectStats: Stats fetched successfully:", response.data.data);
                } else {
                    throw new Error(response.data?.error || 'Failed to fetch stats');
                }
            } catch (err) {
                console.error("ProjectStats Error fetching stats:", err);
                setError('Could not load project statistics.');
                // إبقاء القيم الافتراضية صفر
                setStats({ totalClosedAccounts: 0, totalSolRecoveredForUsers: 0, totalSolPaidToReferrers: 0 });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();

        // اختياري: تحديث دوري للإحصائيات كل دقيقة أو أكثر
        const intervalId = setInterval(fetchStats, 60000 * 5); // كل 5 دقائق

        // تنظيف المؤقت عند إلغاء تحميل المكون
        return () => clearInterval(intervalId);

    }, []); // يعمل مرة واحدة عند التحميل + التحديث الدوري

    // دالة لتنسيق الأرقام الكبيرة (اختياري)
    const formatNumber = (num) => {
        if (isLoading) return '...';
        if (typeof num !== 'number') return '0';
        // تقريب SOL لأقرب 4 خانات عشرية مثلاً
        if (num < 1000 && num !== Math.floor(num)) { // إذا كان الرقم أقل من 1000 وبه كسور (نفترض أنه SOL)
            return num.toFixed(4);
        }
        return num.toLocaleString(); // للأعداد الصحيحة الكبيرة (مثل عدد الحسابات)
    };

    return (
        <div className={`${styles.statsContainer} glass-effect container`}>
            {/* يمكنك إضافة عنوان إذا أردت */}
            {/* <h3 className={styles.statsTitle}>Project Impact</h3> */}
            {error && <p className={styles.errorText}>{error}</p>}
            <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                    <span className={`${styles.statLabel} gradient-text-bold`}>Total Accounts Closed</span>
                    <span className={styles.statValue}>{isLoading ? '...' : formatNumber(stats.totalClosedAccounts)}</span>
                </div>
                <div className={styles.statItem}>
                    <span className={`${styles.statLabel} gradient-text-bold`}>Total SOL Recovered (Users)</span>
                    <span className={`${styles.statValue} ${styles.solValue}`}>
                         {isLoading ? '...' : `~${formatNumber(stats.totalSolRecoveredForUsers)} SOL`}
                    </span>
                </div>
                <div className={styles.statItem}>
                    <span className={`${styles.statLabel} gradient-text-bold`}>Total SOL Paid (Referrers)</span>
                    <span className={`${styles.statValue} ${styles.solValue}`}>
                         {isLoading ? '...' : `~${formatNumber(stats.totalSolPaidToReferrers)} SOL`}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProjectStats;