// src/components/ProjectStats/ProjectStats.test.js

import React from 'react';
// استورد الأدوات اللازمة
import { render, screen, waitFor } from '@testing-library/react';
import ProjectStats from './ProjectStats';
// استورد apiClient لمحاكاته
import apiClient from '../../api/axiosInstance';

// --- محاكاة وحدة apiClient ---
jest.mock('../../api/axiosInstance');

describe('ProjectStats Component', () => {

    beforeEach(() => {
        // مسح جميع المحاكاة قبل كل اختبار
        // مهم بشكل خاص لأننا سنغير سلوك apiClient.get
        jest.clearAllMocks();
    });

    // --- اختبار حالة التحميل الأولية ---
    test('renders loading state initially', () => {
        apiClient.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
        render(<ProjectStats />);
        const loadingIndicators = screen.queryAllByText('...');
        expect(loadingIndicators.length).toBeGreaterThan(0);

        // --- !! تعديل التأكيد !! ---
        // تأكد من عدم وجود قيمة عددية (مثل التي تظهر عند النجاح)
        expect(screen.queryByText('12,345')).not.toBeInTheDocument();
        expect(screen.queryByText(/~25.1235 SOL/i)).not.toBeInTheDocument();
        // ------------------------
    });

    // --- اختبار حالة النجاح في جلب وعرض البيانات ---
    test('fetches and displays overall stats successfully', async () => {
        // أ. إعداد بيانات وهمية للاستجابة
        const mockStatsData = {
            totalClosedAccounts: 12345,
            totalSolRecoveredForUsers: 25.12345678,
            totalSolPaidToReferrers: 1.23456789,
        };
        // ب. تكوين المحاكاة: apiClient.get('/stats/overall') يرجع البيانات الوهمية
        apiClient.get.mockResolvedValueOnce({
            data: { success: true, data: mockStatsData }
        });

        // ج. عرض المكون
        render(<ProjectStats />);

        // د. الانتظار والتحقق: انتظر حتى تظهر البيانات المتوقعة
        //    استخدم findByText للانتظار حتى يظهر العنصر
        //    تحقق من القيم المنسقة كما يعرضها المكون
        expect(await screen.findByText('12,345')).toBeInTheDocument(); // Total Accounts (مع فاصل الآلاف)
        expect(await screen.findByText(/~25.1235 SOL/i)).toBeInTheDocument(); // Recovered SOL (مُقربة ومُنسقة)
        expect(await screen.findByText(/~1.2346 SOL/i)).toBeInTheDocument(); // Paid SOL (مُقربة ومُنسقة)

        // هـ. التأكد من أن apiClient.get تم استدعاؤها بالمسار الصحيح
        expect(apiClient.get).toHaveBeenCalledTimes(1);
        expect(apiClient.get).toHaveBeenCalledWith('/stats/overall');
    });

    // --- اختبار حالة الفشل في جلب البيانات ---
    test('displays an error message if fetching stats fails', async () => {
        const errorMessage = "Network Error";
        apiClient.get.mockRejectedValueOnce(new Error(errorMessage));
        render(<ProjectStats />);

        // التحقق من ظهور رسالة الخطأ (باستخدام findByText للانتظار)
        expect(await screen.findByText(/Could not load project statistics./i)).toBeInTheDocument();

        // التحقق من استدعاء API
        expect(apiClient.get).toHaveBeenCalledTimes(1);
        expect(apiClient.get).toHaveBeenCalledWith('/stats/overall');

        // --- !! إزالة التأكيد الخاطئ !! ---
        // expect(screen.queryByText(/SOL/i)).not.toBeInTheDocument(); // <-- احذف هذا السطر

        // تأكد من عدم عرض قيمة رقمية محددة من حالة النجاح
        expect(screen.queryByText('12,345')).not.toBeInTheDocument();
    });


});