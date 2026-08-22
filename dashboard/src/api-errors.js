const messages = {
  tenant_chatwoot_account_not_configured: 'هذه الشركة غير مرتبطة بحساب Chatwoot بعد. اربط حساب المحادثات من إعدادات القنوات ثم أعد المحاولة.',
  chatwoot_sso_not_configured: 'خدمة الدخول إلى Chatwoot غير مهيأة على الخادم.',
  chatwoot_platform_unavailable: 'تعذر الاتصال بخدمة Chatwoot الآن. أعد المحاولة بعد قليل.',
  chatwoot_platform_request_failed: 'رفض Chatwoot إنشاء جلسة الدخول. تحقق من إعدادات الحساب ثم أعد المحاولة.',
  meta_oauth_not_configured: 'ربط Meta غير مهيأ على الخادم بعد.',
  meta_asset_owned_by_another_tenant: 'هذا الحساب مرتبط مسبقاً بشركة أخرى داخل My AI Desk.',
  meta_page_access_token_missing: 'لم تُرجع Meta رمز الصفحة المطلوب. تحقق من صلاحيات الحساب والصفحة.',
  meta_webhook_subscription_failed: 'وافقت Meta على الحساب لكن تعذر الاشتراك في الرسائل. تحقق من الصلاحيات وإعداد Webhooks.',
  meta_channel_not_found: 'قناة Meta غير موجودة أو أُلغي ربطها مسبقاً.',
};

export function apiErrorMessage(code, status) {
  if (messages[code]) return messages[code];
  return code || `تعذر إكمال الطلب (${status}).`;
}
