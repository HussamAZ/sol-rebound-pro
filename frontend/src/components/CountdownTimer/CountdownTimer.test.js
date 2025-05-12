// src/components/CountdownTimer/CountdownTimer.test.js

import React from 'react';
// src/setupTests.js

// استورد دوال jest-dom المساعدة مثل toBeInTheDocument()
import '@testing-library/jest-dom';
// استورد أدوات الاختبار من React Testing Library
import { render, screen, act } from '@testing-library/react';
// استورد المكون الذي نريد اختباره
import CountdownTimer from './CountdownTimer';

jest.useFakeTimers();

// وصف مجموعة الاختبارات للمكون
describe('CountdownTimer Component', () => {

    // --- !! تأكد من تنظيف المؤقتات بعد كل اختبار !! ---
    afterEach(() => {
        jest.clearAllTimers();
    });
    // ------------------------------------------------

    test('renders the countdown timer title', () => {
        render(<CountdownTimer />);
        const titleElement = screen.getByText(/Next Weekly Rewards In:/i);
        expect(titleElement).toBeInTheDocument();
    });

    test('renders time labels (Days, Hours, Mins, Secs)', () => {
        render(<CountdownTimer />);
        expect(screen.getByText('Days')).toBeInTheDocument();
        expect(screen.getByText('Hours')).toBeInTheDocument();
        expect(screen.getByText('Mins')).toBeInTheDocument();
        expect(screen.getByText('Secs')).toBeInTheDocument();
    });

    // --- !! اختبار جديد للتحقق من القيم الأولية بناءً على وقت وهمي !! ---
    test('displays the correct initial time left based on a specific date', () => {
        const fakeNow = new Date('2024-05-16T10:00:00.000Z');
        jest.setSystemTime(fakeNow);
        render(<CountdownTimer />);
        expect(screen.getByText('02')).toBeInTheDocument();
        expect(screen.getByText('13')).toBeInTheDocument();
        expect(screen.getByText('40')).toBeInTheDocument();
        expect(screen.getByText('00')).toBeInTheDocument(); // Seconds = 0

        // --- !! استخدام act لتغليف التقدم بالوقت !! ---
        act(() => {
            jest.advanceTimersByTime(1000); // تقدم ثانية واحدة
        });
        expect(screen.getByText('59')).toBeInTheDocument(); // Seconds = 59
        expect(screen.getByText('39')).toBeInTheDocument(); // Minutes = 39
    });

    test('displays the countdown to the next cycle when the time is past the last target', () => {
        // أ. تحديد وقت "حالي" وهمي بعد موعد المكافآت (الأحد 12:00 GMT)
        const fakeNow = new Date('2024-05-19T12:00:00.000Z'); // الأحد
        jest.setSystemTime(fakeNow);

        // ب. عرض المكون
        render(<CountdownTimer />);

        // ج. التحقق من عرض العد التنازلي للسبت القادم (6 أيام، 11 ساعة، 40 دقيقة)
        //    (تأكد من الأرقام بناءً على fakeNow الذي اخترته)
        expect(screen.getByText('06')).toBeInTheDocument(); // Days
        expect(screen.getByText('11')).toBeInTheDocument(); // Hours
        expect(screen.getByText('40')).toBeInTheDocument(); // Minutes
        expect(screen.getByText('00')).toBeInTheDocument(); // Seconds

        // د. تأكد من *عدم* وجود رسالة "Calculating..."
        expect(screen.queryByText(/Calculating next rewards cycle.../i)).not.toBeInTheDocument();
    });



});
