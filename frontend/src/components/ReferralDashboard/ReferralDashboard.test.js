// src/components/ReferralDashboard/ReferralDashboard.test.js

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react'; // استيراد act
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import ReferralDashboard from './ReferralDashboard';
import apiClient from '../../api/axiosInstance'; // استيراد apiClient لمحاكاته

// --- محاكاة react-toastify ---
jest.mock('react-toastify', () => {
    const mockSuccessFn = jest.fn();
    const mockErrorFn = jest.fn();
    return {
        toast: {
            success: mockSuccessFn,
            error: mockErrorFn,
        },
        ToastContainer: () => <div data-testid="toast-container"></div>, // يجب أن يكون مكونًا صالحًا
    };
});
import { toast } from 'react-toastify'; // استيراد toast (المحاكى)

// --- محاكاة useWallet ---
const mockPublicKey = { toBase58: () => 'MockWalletPublicKey123456789' };
const mockUseWallet = jest.fn();
jest.mock('@solana/wallet-adapter-react', () => ({
    useWallet: () => mockUseWallet()
}));

// --- محاكاة navigator.clipboard ---
const mockWriteText = jest.fn();
if (typeof navigator !== 'undefined') {
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });
} else {
    global.navigator = { clipboard: { writeText: mockWriteText } };
}

// --- محاكاة apiClient ---
jest.mock('../../api/axiosInstance'); // محاكاة الوحدة بأكملها

// --- بداية مجموعة الاختبارات ---
describe('ReferralDashboard Component', () => {

    // بيانات وهمية للـ props
    const mockSetError = jest.fn(); // دالة setError وهمية
    let mockOnSuccessfulWithdraw; // دالة وهمية للسحب الناجح

    // --- بيانات وهمية مختلفة لحالات الرصيد ---
    const mockReferralInfoSufficient = {
        user: 'MockWalletPublicKey123456789', referrer: null,
        totalEarnings: 100000000, // 0.1 SOL (أعلى من الحد الأدنى 0.05)
        referralsCount: 2, closedAccounts: 10, weeklyEarnings: 10000000,
        weeklyClosedAccounts: 3, weeklyReferralsCount: 1,
        totalEarningsSol: 0.1, weeklyEarningsSol: 0.01,
        totalEarningsLamports: 100000000, weeklyEarningsLamports: 10000000,
    };
    const mockReferralInfoInsufficient = {
        ...mockReferralInfoSufficient,
        totalEarnings: 40000000, // 0.04 SOL (أقل من الحد الأدنى)
        totalEarningsSol: 0.04,
        totalEarningsLamports: 40000000,
    };

    beforeEach(() => {
        // مسح جميع المحاكاة
        jest.clearAllMocks();
        // إعداد الحالة الافتراضية لـ useWallet
        mockUseWallet.mockReturnValue({
            publicKey: mockPublicKey,
            connected: true,
        });
        // إعادة تعيين دالة السحب الوهمية
        mockOnSuccessfulWithdraw = jest.fn();
        // إعادة تعيين محاكاة apiClient.post إذا كانت ممكنة
        if (apiClient && typeof apiClient.post === 'function' && typeof apiClient.post.mockClear === 'function') {
             apiClient.post.mockClear();
        }
    });

    // --- اختبار عرض الرابط الأولي (يبقى كما هو) ---
    test('renders the referral link correctly', () => {
        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoSufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        const expectedLink = `${window.location.origin}/?ref=${mockPublicKey.toBase58()}`;
        expect(screen.getByText(expectedLink)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    });

    // --- اختبار النسخ الناجح (يبقى كما هو) ---
    test('calls clipboard.writeText and shows success toast on successful copy', async () => {
        mockWriteText.mockResolvedValueOnce(undefined);
        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoSufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        const linkBox = screen.getByTitle('Click to copy');
        const copyButton = screen.getByRole('button', { name: /copy/i });
        await userEvent.click(linkBox);
        await waitFor(() => { expect(copyButton).toHaveClass('copyButtonSuccess'); });
        expect(mockWriteText).toHaveBeenCalledTimes(1);
        expect(toast.success).toHaveBeenCalledWith("Referral link copied to clipboard!");
    });

    // --- اختبار النسخ الفاشل (يبقى كما هو) ---
    test('shows error toast and logs error on failed copy', async () => {
        const copyError = new Error("Clipboard write failed");
        mockWriteText.mockRejectedValue(copyError);
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoSufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        const linkBox = screen.getByTitle('Click to copy');
        const copyButton = screen.getByRole('button', { name: /copy/i });
        await userEvent.click(linkBox);
        await waitFor(() => { expect(copyButton).toHaveClass('copyButtonError'); });
        expect(mockWriteText).toHaveBeenCalledTimes(1);
        expect(toast.error).toHaveBeenCalledWith("Failed to copy link!");
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    // --- اختبار عدم الاتصال (يبقى كما هو) ---
    test('does not render if wallet is not connected', () => {
        mockUseWallet.mockReturnValue({ publicKey: null, connected: false });
        const { container } = render(<ReferralDashboard setError={mockSetError} referralInfo={null} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        expect(container.firstChild).toBeNull();
    });

    // --- اختبار عرض حالة التحميل ---
    test('renders loading state when loadingInfo is true', () => {
        render(<ReferralDashboard setError={mockSetError} referralInfo={null} loadingInfo={true} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        expect(screen.getByText(/Loading referral data.../i)).toBeInTheDocument();
    });

    // --- اختبار عرض رسالة الخطأ عندما تكون البيانات null ---
    test('renders error/info message when referralInfo is null after loading', () => {
        render(<ReferralDashboard setError={mockSetError} referralInfo={null} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        expect(screen.getByText(/Could not load your referral data/i)).toBeInTheDocument();
    });

    // --- اختبار عرض البيانات بشكل صحيح ---
    test('displays referral stats correctly when info is provided', () => {
        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoSufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        // تحقق من بعض القيم الرئيسية
        expect(screen.getByText('3')).toBeInTheDocument(); // Weekly Closed
        expect(screen.getByText('1')).toBeInTheDocument(); // Weekly Referrals
        expect(screen.getByText('10')).toBeInTheDocument(); // Lifetime Closed
        expect(screen.getByText('2')).toBeInTheDocument(); // Lifetime Referrals
        expect(screen.getByText(/0\.10000000 SOL/i)).toBeInTheDocument(); // Lifetime Earnings
        expect(screen.getByText(/\(100,000,000 Lamports\)/i)).toBeInTheDocument();
    });

    // --- اختبار تعطيل زر السحب عند عدم كفاية الرصيد ---
    test('withdraw button is disabled when earnings are below minimum', () => {
        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoInsufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        const withdrawButton = screen.getByRole('button', { name: /withdraw earnings/i });
        expect(withdrawButton).toBeDisabled();
        expect(screen.getByText(/\(Insufficient balance to withdraw\)/i)).toBeInTheDocument();
    });

    // --- اختبار السحب الناجح ---
    test('handles successful withdrawal process', async () => {
        const user = userEvent.setup();
        const withdrawnAmountSol = mockReferralInfoSufficient.totalEarningsSol;
        const mockWithdrawResponse = {
            data: {
                success: true,
                message: `Successfully withdrew ${withdrawnAmountSol.toFixed(8)} SOL.`,
                amountSol: withdrawnAmountSol,
                signature: 'mockWithdrawSignatureXYZ'
            }
        };
        // محاكاة apiClient.post لترجع الاستجابة الناجحة
        apiClient.post.mockResolvedValueOnce(mockWithdrawResponse);

        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoSufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        const withdrawButton = screen.getByRole('button', { name: /withdraw earnings/i });
        expect(withdrawButton).toBeEnabled(); // تأكد أنه ممكن

        // استخدام act لتغليف التفاعل غير المتزامن
        await act(async () => {
            await user.click(withdrawButton);
        });

        // الانتظار والتحقق
        await waitFor(() => {
            // التأكد من استدعاء API
            expect(apiClient.post).toHaveBeenCalledTimes(1);
            expect(apiClient.post).toHaveBeenCalledWith('/referrals/withdraw', {
                userPublicKeyString: mockPublicKey.toBase58()
            });
        });
        await waitFor(() => {
            // التأكد من استدعاء toast.success
            expect(toast.success).toHaveBeenCalledWith(`Successfully withdrew ${withdrawnAmountSol.toFixed(8)} SOL!`);
        });
        await waitFor(() => {
             // التأكد من استدعاء onSuccessfulWithdraw callback
             expect(mockOnSuccessfulWithdraw).toHaveBeenCalledTimes(1);
        });

        // التأكد من عدم استدعاء toast.error
        expect(toast.error).not.toHaveBeenCalled();
    });

    // --- اختبار السحب الفاشل (فشل API) ---
    test('handles failed withdrawal process (API error)', async () => {
        const user = userEvent.setup();
        const apiErrorMessage = "Backend withdrawal failed";
        const mockWithdrawError = {
            isAxiosError: true,
            response: {
                status: 500,
                data: { success: false, error: apiErrorMessage }
            }
        };
        // محاكاة apiClient.post لترجع الخطأ
        apiClient.post.mockRejectedValueOnce(mockWithdrawError);

        render(<ReferralDashboard setError={mockSetError} referralInfo={mockReferralInfoSufficient} loadingInfo={false} onSuccessfulWithdraw={mockOnSuccessfulWithdraw} />);
        const withdrawButton = screen.getByRole('button', { name: /withdraw earnings/i });
        expect(withdrawButton).toBeEnabled();

        // استخدام act
        await act(async () => {
            await user.click(withdrawButton);
        });

        // الانتظار والتحقق
        await waitFor(() => {
            expect(apiClient.post).toHaveBeenCalledTimes(1);
            expect(apiClient.post).toHaveBeenCalledWith('/referrals/withdraw', expect.anything());
        });
        await waitFor(() => {
            // التأكد من استدعاء toast.error بالرسالة الصحيحة
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(`Withdrawal Failed (500): ${apiErrorMessage}`));
        });

        // التأكد من عدم استدعاء toast.success أو callback النجاح
        expect(toast.success).not.toHaveBeenCalled();
        expect(mockOnSuccessfulWithdraw).not.toHaveBeenCalled();
    });

});