-- Give every real company a safe, tenant-scoped AI policy.
-- The reply pipeline still requires products or indexed knowledge before it answers.

ALTER TABLE ai_handoff_policies
  ALTER COLUMN fallback_reply SET DEFAULT 'لا أملك معلومات مؤكدة كافية للإجابة الآن. سأحوّل المحادثة إلى موظف لمساعدتك.',
  ALTER COLUMN custom_system_prompt SET DEFAULT 'أنت وكيل خدمة عملاء دقيق ومختصر. أجب بلغة العميل، واعتمد فقط على منتجات ومعرفة الشركة المرفقة. لا تخمّن سعراً أو مخزوناً أو سياسة، وحوّل المحادثة إلى موظف عندما لا تكفي المعلومات.';

INSERT INTO ai_handoff_policies (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;
