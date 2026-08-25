const messages = {
  tenant_chatwoot_account_not_configured: 'صندوق المحادثات غير مهيأ لهذه الشركة بعد. أكمل إعداد القناة ثم أعد المحاولة.',
  chatwoot_sso_not_configured: 'خدمة صندوق المحادثات غير مهيأة حالياً.',
  chatwoot_platform_unavailable: 'تعذر فتح صندوق المحادثات الآن. أعد المحاولة بعد قليل.',
  chatwoot_platform_request_failed: 'تعذر إنشاء جلسة صندوق المحادثات. تحقق من إعداد الشركة ثم أعد المحاولة.',
  meta_oauth_not_configured: 'إعداد ربط الحسابات غير مكتمل.',
  meta_asset_owned_by_another_tenant: 'هذا الحساب مرتبط مسبقاً بشركة أخرى داخل My AI Desk.',
  meta_page_access_token_missing: 'تعذر إكمال صلاحية الصفحة. تحقق من الحساب والصفحة المختارين.',
  meta_webhook_subscription_failed: 'تم اختيار الحساب، لكن تعذر تفعيل استقبال الرسائل. تحقق من الصلاحيات ثم أعد المحاولة.',
  meta_channel_not_found: 'القناة غير موجودة أو أُلغي ربطها مسبقاً.',
};

export function apiErrorMessage(code, status) {
  if (messages[code]) return messages[code];
  return code || `تعذر إكمال الطلب (${status}).`;
}
