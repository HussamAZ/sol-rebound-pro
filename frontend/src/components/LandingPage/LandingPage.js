// frontend/src/components/LandingPage/LandingPage.js
import React, { useState, useEffect, useCallback } from 'react';
import styles from './LandingPage.module.css'; // سننشئ هذا الملف لاحقًا
import { ReactComponent as TelegramIcon } from '../../assets/icons/telegram.svg'; // تأكد من صحة المسار

// وقت الإطلاق المستهدف (مثال، يجب تعديله لوقتك الفعلي)
const NEW_TARGET_LAUNCH_TIMESTAMP_UTC = "2025-06-12T21:00:00.000Z"; // <-- عدّل هذا التاريخ والوقت!
const TELEGRAM_CHANNEL_LINK = "https://t.me/SolRebound"; // <-- عدّل هذا إذا كان مختلفًا

const CountdownTimerLanding = ({ targetDate }) => {
    const calculateTimeLeft = useCallback(() => {
        const difference = +new Date(targetDate) - +new Date();
        let timeLeft = {};

        if (difference > 0) {
            timeLeft = {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
                isTimeUp: false,
            };
        } else {
            timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0, isTimeUp: true };
        }
        return timeLeft;
    }, [targetDate]);

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setTimeout(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);
        return () => clearTimeout(timer);
    }, [timeLeft, calculateTimeLeft]); // أضفت calculateTimeLeft للاعتماديات

    const formatNumber = (num) => num.toString().padStart(2, '0');

    if (timeLeft.isTimeUp) {
        return <div className={styles.timerEnded}>We are LIVE! Refresh or navigate to the app.</div>;
    }

    return (
        <div className={styles.countdownDisplay}>
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
    );
};

const LandingPage = () => {
    return (
        <div className={styles.landingContainer}>
            {/* الشعار يمكن وضعه في الأعلى إذا أردت */}
            <div className={styles.logoContainer}>
                <img src="/sol_reb.png" alt="Sol Rebound Pro Logo" className={styles.logo} />
            </div>
            <h1 className={`${styles.headline} gradient-text-bold`}>
                EXPECT US!
            </h1>

            <p className={styles.subHeadline}>
                Something <span className="gradient-text-bold">BIG</span> is launching on the Solana ecosystem.
                <br />
                No token. No presale. Just <span className="gradient-text-bold">pure utility</span> to help you manage your assets better and <span className="gradient-text-bold">get your SOL back</span>.
            </p>

            <div className={styles.countdownContainer}>
                <h2 className={styles.countdownTitle}>Launching In:</h2>
                <CountdownTimerLanding targetDate={NEW_TARGET_LAUNCH_TIMESTAMP_UTC} />
            </div>

            <div className={styles.ctaContainer}>
                <a href={TELEGRAM_CHANNEL_LINK} target="_blank" rel="noopener noreferrer" className={styles.ctaButton}>
                  onClick={() => {
     		       if (window.gtag) {
               		 window.gtag('event', 'join_telegram_click_landing', { // اسم حدث مميز لصفحة الهبوط
                   		 'event_category': 'LandingPageCTA',
                   		 'event_label': 'Telegram Button'
               		 });
               		 console.log("LandingPage: gtag event 'join_telegram_click_landing' sent.");
           	       }
     		 }}
   	      > 
		   <TelegramIcon className={styles.ctaIcon} />
                    Join Telegram for Launch Updates & Giveaway Info!
                </a>
                <p className={styles.giveawayTeaser}>
                    ...and get a chance to be one of our <strong className="gradient-text-bold">100 founding user winners!</strong>
                </p>
            </div>

            <footer className={styles.landingFooter}>
                Sol Rebound © {new Date().getFullYear()}
            </footer>
        </div>
    );
};

export default LandingPage;
