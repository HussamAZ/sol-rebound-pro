use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, system_instruction, program::invoke};
use anchor_spl::token::{self, Token, TokenAccount, CloseAccount};

// --- تعريف الثوابت ---
// استبدل هذا بالمعرف الفعلي الذي حصلت عليه بعد النشر الأخير (إذا تغير)
// إذا لم يتغير، يمكنك تركه كما هو.
declare_id!("8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW");

// تأكد من أن هذا العنوان هو السلطة الصحيحة إذا كنت ستستخدمها لاحقًا لـ distribute_rewards
const ADMIN_AUTHORITY: Pubkey = pubkey!("2UrhEmCmL7BUheGdECDePZFB24mPbipqYXk2wPqbXa6f");

// قيمة الإيجار المتوقعة لحساب ATA فارغ (بالـ lamports)
const RENT_PER_EMPTY_ATA: u64 = 2039280;
// نسبة رسوم المنصة
const PLATFORM_FEE_PERCENT: u64 = 25; // 25%
// نسبة عمولة الإحالة (من رسوم المنصة)
const REFERRAL_COMMISSION_PERCENT: u64 = 25; // 25% of the platform fee

// --- بداية تعريف البرنامج ---
#[program]
pub mod ata_claim {
    use super::*; // استيراد العناصر من النطاق الأعلى

    /// Closes multiple empty Associated Token Accounts (ATAs) for the user,
    /// recovers the rent lamports, transfers a platform fee to the treasury,
    /// and optionally transfers a referral commission to the referrer.
    ///
    /// Accounts expected in `ctx.remaining_accounts`:
    /// - The ATAs to be closed (must be writable, owned by token_program, belong to the user, and be empty).
    /// - If `referrer_key` argument is Some(key), the account corresponding to `key` must also be present and writable.
    pub fn close_multiple_atas<'info>(
        ctx: Context<'_, '_, 'info, 'info, CloseMultipleATAs<'info>>,
        referrer_key: Option<Pubkey>, // الوسيط الاختياري لمفتاح المحيل (تمت استعادته)
    ) -> Result<()> {
        msg!("Executing close_multiple_atas instruction...");

        // --- الحصول على المفاتيح والحسابات الأساسية ---
        let user_account_info = ctx.accounts.user.to_account_info();
        let user_key = user_account_info.key();
        let token_program_info = ctx.accounts.token_program.to_account_info();
        let token_program_key = token_program_info.key();
        let treasury_info = ctx.accounts.treasury.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();

        msg!("User: {}", user_key);
        msg!("Treasury: {}", treasury_info.key);

        // --- التعامل مع حساب المحيل المحتمل (تمت استعادته) ---
        let mut referrer_info_option: Option<&AccountInfo<'info>> = None; // لتخزين مرجع لحساب المحيل إن وجد

        // ابحث عن المحيل المحتمل أولاً ضمن ctx.remaining_accounts
        if let Some(ref_key) = referrer_key {
            require_keys_neq!(ref_key, user_key, ErrorCode::ReferrerCannotBeUser); // تحقق أن المحيل ليس المستخدم
            referrer_info_option = ctx.remaining_accounts.iter().find(|acc| acc.key == &ref_key);

            if referrer_info_option.is_none() {
                msg!("Error: Referrer key ({}) provided but account not found in transaction accounts.", ref_key);
                return err!(ErrorCode::ReferrerAccountNotFound);
            }
            // تأكد أن حساب المحيل الموجود قابل للكتابة لاستقبال العمولة
            require!(referrer_info_option.unwrap().is_writable, ErrorCode::ReferrerAccountNotWritable);
            msg!("Referral key provided ({}) and account found and writable.", ref_key);
        } else {
            msg!("No referrer key provided.");
        }

        // --- التحقق من حسابات ATA وإغلاقها (مع فلترة المحيل) ---
        let mut total_rent_to_recover: u64 = 0;
        let mut actual_ata_count: usize = 0;

        msg!("Iterating through remaining accounts (count: {})...", ctx.remaining_accounts.len());
        // المرور على ctx.remaining_accounts مباشرة
        for (index, acc_info) in ctx.remaining_accounts.iter().enumerate() {
            // تخطى حساب المحيل إذا كان موجودًا وتم تحديده كـ referrer_key
            if let Some(ref_info) = referrer_info_option {
                if ref_info.key == acc_info.key {
                    msg!("Skipping referrer account at index {}: {}", index, acc_info.key());
                    continue; // انتقل إلى الحساب التالي
                }
            }

            // الآن نعلم أن acc_info هو ATA محتمل يجب إغلاقه
            msg!("Processing potential ATA account {}: {}", index + 1, acc_info.key());

            // التحقق من صلاحيات وشروط ATA
            require!(acc_info.is_writable, ErrorCode::AccountNotWritable);
            require_keys_eq!(*acc_info.owner, token_program_key, ErrorCode::IncorrectAccountOwner);

            // محاولة قراءة بيانات الحساب كـ TokenAccount
            // استخدام try_borrow_data لتجنب استهلاك الحساب إذا كان مستعارًا بالفعل
            // let ata_data = acc_info.try_borrow_data()?;
            // let ata_account = TokenAccount::try_deserialize(&mut &ata_data[..])?;
            // طريقة أسهل باستخدام Account Deserializer
            let ata_account = Account::<TokenAccount>::try_from(acc_info)?;


            require_keys_eq!(ata_account.owner, user_key, ErrorCode::AtaOwnerMismatch); // تأكد أنه مملوك للمستخدم
            require!(ata_account.amount == 0, ErrorCode::AtaIsNotEmpty); // تأكد أنه فارغ
            // يمكنك إضافة تحقق من الـ Lamports إذا أردت دقة أكبر:
            // require!(acc_info.lamports() == RENT_PER_EMPTY_ATA, ErrorCode::IncorrectAtaLamports);

            msg!("ATA Checks Passed for: {}. Attempting close...", acc_info.key());

            // تحضير وإجراء استدعاء CPI لإغلاق الحساب
            let cpi_accounts = CloseAccount {
                account: acc_info.clone(), // استنساخ للـ CPI
                destination: user_account_info.clone(), // إعادة الإيجار للمستخدم
                authority: user_account_info.clone(), // المستخدم هو السلطة
            };
            let cpi_context = CpiContext::new(token_program_info.clone(), cpi_accounts);
            token::close_account(cpi_context)?;

            // زيادة مجموع الإيجار المسترد
            total_rent_to_recover = total_rent_to_recover
                .checked_add(RENT_PER_EMPTY_ATA) // استخدم الثابت
                .ok_or(ErrorCode::MathOverflow)?;

            msg!("Successfully closed account {}: {}", index + 1, acc_info.key());
            actual_ata_count += 1;
        }

        // تأكد من أنه تم إغلاق حساب واحد على الأقل
        require!(actual_ata_count > 0, ErrorCode::NoAccountsToClose);
        msg!("Successfully closed {} ATA accounts in total.", actual_ata_count);

        // --- حساب وتوزيع الرسوم (تمت استعادة منطق الإحالة) ---
        msg!("Total estimated rent recovered: {}", total_rent_to_recover);

        // 1. حساب رسوم المنصة (25% من الإيجار المسترد)
        let platform_fee = total_rent_to_recover
            .checked_mul(PLATFORM_FEE_PERCENT)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::MathOverflow)?;
        msg!("Calculated platform fee: {}", platform_fee);

        // 2. حساب عمولة الإحالة (25% من رسوم المنصة، فقط إذا كان هناك محيل)
        let mut referral_fee: u64 = 0;
        if referrer_key.is_some() && platform_fee > 0 { // تأكد من وجود محيل ورسوم لحساب العمولة منها
             referral_fee = platform_fee
                 .checked_mul(REFERRAL_COMMISSION_PERCENT)
                 .ok_or(ErrorCode::MathOverflow)?
                 .checked_div(100)
                 .ok_or(ErrorCode::MathOverflow)?;
        }
        msg!("Calculated referral fee: {}", referral_fee);

        // 3. حساب المبلغ الصافي للخزينة
        let fee_to_treasury = platform_fee
            .checked_sub(referral_fee)
            .ok_or(ErrorCode::MathOverflow)?;
        msg!("Net fee to treasury: {}", fee_to_treasury);

        // --- إجراء التحويلات (باستخدام CPI لبرنامج النظام) ---
        // أ. تحويل المبلغ الصافي إلى الخزينة
        if fee_to_treasury > 0 {
            invoke(
                &system_instruction::transfer(&user_key, treasury_info.key, fee_to_treasury),
                &[
                    user_account_info.clone(),
                    treasury_info.clone(),
                    system_program_info.clone() // برنامج النظام مطلوب للتحويل
                ],
            )?;
            msg!("Transferred {} lamports to treasury {}", fee_to_treasury, treasury_info.key);
        } else {
            msg!("No net fee to transfer to treasury.");
        }

        // ب. تحويل عمولة الإحالة إلى المحيل (إذا كانت محسوبة ويوجد حساب محيل)
        if referral_fee > 0 {
             if let Some(ref_acc_info) = referrer_info_option {
                 invoke(
                     &system_instruction::transfer(&user_key, ref_acc_info.key, referral_fee),
                     &[
                        user_account_info.clone(),
                        ref_acc_info.clone(), // حساب المحيل
                        system_program_info.clone()
                    ],
                 )?;
                 msg!("Transferred {} lamports to referrer {}", referral_fee, ref_acc_info.key);
             } else {
                   // هذا لا يجب أن يحدث إذا كان referrer_fee > 0، ولكنه تحقق أمان إضافي
                   msg!("Internal Error: Referral fee is positive but referrer account info is missing.");
                   return err!(ErrorCode::ReferrerAccountNotFound); // أو خطأ داخلي آخر
             }
        } else {
            msg!("No referral fee to transfer.");
        }

        msg!("Finished close_multiple_atas successfully.");
        Ok(())
    }


    // --- دالة توزيع المكافآت (لم تتغير، تبقى كما هي) ---
    pub fn distribute_rewards<'info>(
        ctx: Context<'_, '_, 'info, 'info, DistributeRewards<'info>>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ADMIN_AUTHORITY, ErrorCode::Unauthorized);
        msg!("Distribute rewards authorized for: {}", ctx.accounts.authority.key());

        let recipient_accounts = ctx.remaining_accounts;
        let num_recipients = recipient_accounts.len();
        let num_amounts = amounts.len();

        require!(num_recipients == num_amounts, ErrorCode::MismatchRewardAmounts);
        require!(num_recipients > 0, ErrorCode::NoRecipients);
        msg!("Distributing rewards to {} recipients.", num_recipients);

        let total_reward_amount = amounts.iter().try_fold(0u64, |acc, &amount| acc.checked_add(amount))
                                    .ok_or(ErrorCode::MathOverflow)?;
        require!(ctx.accounts.treasury.to_account_info().lamports() >= total_reward_amount, ErrorCode::InsufficientTreasuryBalance);
        msg!("Total reward amount: {}. Treasury balance: {}", total_reward_amount, ctx.accounts.treasury.to_account_info().lamports());

        let treasury_info = ctx.accounts.treasury.to_account_info();
        let authority_info = ctx.accounts.authority.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();

        for (i, recipient_info) in recipient_accounts.iter().enumerate() {
            let amount = amounts[i];
            msg!("Attempting to send {} lamports to recipient {}: {}", amount, i + 1, recipient_info.key());

            require!(recipient_info.is_writable, ErrorCode::AccountNotWritable);

            if amount > 0 {
                 // هنا نستخدم treasury كـ signer ضمنيًا لأنه PDA أو حساب نظام يتم التحكم فيه
                 // ولكن السلطة الخارجية (authority) يجب أن تكون signer صريح في المعاملة
                 // التحويل يتم من treasury إلى recipient
                 // السلطة على التحويل هي treasury نفسه إذا كان system account، أو authority إذا كان PDA
                 // بما أن treasury هو SystemAccount، يحتاج إلى توقيع السلطة (authority)
                 // ===> يبدو أن invoke بحاجة لتوقيع السلطة هنا وليس الخزينة
                 invoke(
                     &system_instruction::transfer(treasury_info.key, recipient_info.key, amount),
                     &[
                         treasury_info.clone(), // المصدر
                         recipient_info.clone(), // الوجهة
                         authority_info.clone(), // السلطة الموقعة على الخزينة (Admin)
                         system_program_info.clone(), // برنامج النظام
                     ],
                     // لا نحتاج signers إضافيين هنا لأن authority هو signer في سياق الحسابات
                 )?;
                 msg!("Successfully sent {} lamports to recipient {}", amount, recipient_info.key());
            }
        }
        msg!("Finished distribute_rewards successfully.");
        Ok(())
    }

} // نهاية mod ata_claim


// --- هياكل الحسابات (Account Structs) ---

#[derive(Accounts)]
#[instruction(amounts: Vec<u64>)] // تحديد أن الوسيط amounts خاص بهذه التعليمة
pub struct DistributeRewards<'info> {
    #[account(mut)] // الخزينة يجب أن تكون قابلة للتعديل (لسحب الأموال منها)
    pub treasury: SystemAccount<'info>, // حساب نظام بسيط لتخزين SOL
    #[account(signer)] // السلطة (Admin) يجب أن توقع على المعاملة لتفويض السحب
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>, // برنامج النظام مطلوب للتحويلات
    // المستلمون يتم تمريرهم في remaining_accounts
}

#[derive(Accounts)]
// لا نحتاج #[instruction] هنا لأن الوسيط referrer_key يُمرر كمتغير عادي
pub struct CloseMultipleATAs<'info> {
    #[account(mut)] // المستخدم يجب أن يوقع ويكون قابل للتعديل لاستقبال الإيجار
    pub user: Signer<'info>,
    #[account(mut)] // الخزينة يجب أن تكون قابلة للتعديل لاستقبال الرسوم
    pub treasury: SystemAccount<'info>, // حساب نظام بسيط لتخزين SOL
    pub token_program: Program<'info, Token>, // برنامج SPL Token لإغلاق الحسابات
    pub system_program: Program<'info, System>, // برنامج النظام لتحويل الرسوم
    // ATAs والمحيل (إذا وجد) يتم تمريرهم في remaining_accounts
    // ويتم التحقق منهم داخل كود الدالة
}


// --- رموز الأخطاء المخصصة (Custom Error Codes - النسخة الكاملة) ---
#[error_code]
pub enum ErrorCode {
    #[msg("Calculation overflowed or underflowed.")]
    MathOverflow, // 6000
    #[msg("Referrer cannot be the same as the user.")]
    ReferrerCannotBeUser, // 6001
    #[msg("Unauthorized: The signer is not the designated admin authority.")]
    Unauthorized, // 6002
    #[msg("The number of recipient accounts does not match the number of amounts provided.")]
    MismatchRewardAmounts, // 6003
    #[msg("Cannot distribute rewards because the recipient list is empty.")]
    NoRecipients, // 6004
    #[msg("The treasury account does not have enough balance to distribute the rewards.")]
    InsufficientTreasuryBalance, // 6005
    #[msg("Provided account is not writable.")]
    AccountNotWritable, // 6006
    #[msg("Provided account has an incorrect owner.")]
    IncorrectAccountOwner, // 6007
    #[msg("The ATA owner does not match the user signing the transaction.")]
    AtaOwnerMismatch, // 6008
    #[msg("The ATA is not empty and cannot be closed.")]
    AtaIsNotEmpty, // 6009
    #[msg("The ATA lamport balance is not the expected rent-exempt minimum.")]
    IncorrectAtaLamports, // 6010 (قد لا تحتاج إليه إذا لم تتحقق منه بدقة)
    #[msg("No accounts provided to close.")]
    NoAccountsToClose, // 6011
    #[msg("Referrer account provided as argument was not found in the transaction's accounts.")]
    ReferrerAccountNotFound, // 6012
    #[msg("Referrer account provided must be writable to receive commission.")]
    ReferrerAccountNotWritable, // 6013
}