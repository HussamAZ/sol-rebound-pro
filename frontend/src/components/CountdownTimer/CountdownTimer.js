// src/components/CountdownTimer/CountdownTimer.js
import React, { useState, useEffect, useCallback } from 'react';
import styles from './CountdownTimer.module.css';

const CountdownTimer = () => {
    // دالة لحساب وقت الهدف القادم (السبت 23:40 GMT)
    const calculateNextTargetTime = useCallback(() => {
        const now = new Date();
        const currentDayUTC = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const currentHoursUTC = now.getUTCHours();
        const currentMinutesUTC = now.getUTCMinutes();

        let daysUntilNextSaturday = (6 - currentDayUTC + 7) % 7; // الأيام حتى السبت القادم

        // إذا كان اليوم هو السبت، تحقق من الوقت
        if (currentDayUTC === 6) {
            // إذا كان الوقت الحالي قبل 23:40 GMT يوم السبت
            if (currentHoursUTC < 23 || (currentHoursUTC === 23 && currentMinutesUTC < 40)) {
                // الهدف هو هذا السبت
                daysUntilNextSaturday = 0;
            } else {
                // فات الموعد هذا الأسبوع، الهدف هو السبت القادم
                daysUntilNextSaturday = 7;
            }
        }

        const nextSaturday = new Date(now);
        // اضبط التاريخ ليوم السبت القادم
        nextSaturday.setUTCDate(now.getUTCDate() + daysUntilNextSaturday);
        // اضبط الوقت المستهدف (23:40:00 GMT)
        nextSaturday.setUTCHours(23, 40, 0, 0);

        // console.log("Calculated Next Target UTC:", nextSaturday.toISOString());
        return nextSaturday;
    }, []);

    // دالة لحساب الوقت المتبقي
    const calculateTimeLeft = useCallback(() => {
        const targetTime = calculateNextTargetTime();
        const difference = targetTime.getTime() - new Date().getTime(); // الفرق بالمللي ثانية

        let timeLeft = {
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            isTimeUp: true, // افتراضيًا، الوقت قد حان
        };

        if (difference > 0) {
            timeLeft = {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
                isTimeUp: false, // الوقت لم يحن بعد
            };
        }

        return timeLeft;
    }, [calculateNextTargetTime]);

    // حالة لتخزين الوقت المتبقي
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    // useEffect لتحديث العداد كل ثانية
    useEffect(() => {
        // console.log("CountdownTimer Mounted. Initial time left:", timeLeft);
        // التحديث الفوري الأول (اختياري، لأن useState يقوم به)
        // setTimeLeft(calculateTimeLeft());

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        // تنظيف المؤقت عند إلغاء تحميل المكون
        return () => clearInterval(timer);
    }, [calculateTimeLeft]); // أعد تشغيل المؤقت إذا تغيرت دالة الحساب (نظريًا لا تتغير)

    // تنسيق الأرقام بإضافة صفر بادئ إذا كانت أقل من 10
    const formatNumber = (num) => num.toString().padStart(2, '0');

    return (
        <div className={`${styles.timerContainer} glass-effect container`}>
            <h3 className={styles.timerTitle}>
                ⏳ <span className="gradient-text-bold">Next Weekly Rewards In:</span>
            </h3>
            {timeLeft.isTimeUp ? (
                <p className={styles.timerEnded}>Calculating next rewards cycle...</p>
            ) : (
                <div className={styles.timerDisplay}>
                    <div className={styles.timeBlock}>
                        <span className={styles.timeValue}>{formatNumber(timeLeft.days)}</span>
                        <span className={styles.timeLabel}>Days</span>
                    </div>
                    <span className={styles.separator}>:</span>
                    <div className={styles.timeBlock}>
                        <span className={styles.timeValue}>{formatNumber(timeLeft.hours)}</span>
                        <span className={styles.timeLabel}>Hours</span>
                    </div>
                    <span className={styles.separator}>:</span>
                    <div className={styles.timeBlock}>
                        <span className={styles.timeValue}>{formatNumber(timeLeft.minutes)}</span>
                        <span className={styles.timeLabel}>Mins</span>
                    </div>
                    <span className={styles.separator}>:</span>
                    <div className={styles.timeBlock}>
                        <span className={styles.timeValue}>{formatNumber(timeLeft.seconds)}</span>
                        <span className={styles.timeLabel}>Secs</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CountdownTimer;