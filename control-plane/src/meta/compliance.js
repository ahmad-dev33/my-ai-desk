import crypto from 'node:crypto';
import { Router, urlencoded } from 'express';

const formParser = urlencoded({ extended: false, limit: '32kb' });

export function parseMetaSignedRequest(value, secrets) {
  const [encodedSignature, encodedPayload] = String(value || '').split('.', 2);
  if (!encodedSignature || !encodedPayload) return null;
  for (const secret of [...new Set(secrets.filter(Boolean))]) {
    const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest();
    const actual = Buffer.from(encodedSignature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) continue;
    let payload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (String(payload.algorithm || 'HMAC-SHA256').toUpperCase() !== 'HMAC-SHA256') return null;
    return payload;
  }
  return null;
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function legalPage(config, title, english, arabic) {
  const entity = escapeHtml(config.LEGAL_ENTITY_NAME);
  const email = escapeHtml(config.PRIVACY_CONTACT_EMAIL || 'Privacy contact is configured before production launch');
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | ${entity}</title><style>body{margin:0;background:#f4f1ea;color:#17211d;font:17px/1.75 Georgia,serif}main{max-width:900px;margin:48px auto;padding:42px;background:#fff;border:1px solid #d8d2c5;border-radius:18px}h1,h2{font-family:Arial,sans-serif;line-height:1.25}a{color:#075f4f}section{margin-top:32px}.ar{direction:rtl;text-align:right;border-top:1px solid #ddd;padding-top:28px}footer{margin-top:40px;color:#58635e;font-size:14px}@media(max-width:700px){main{margin:0;padding:24px;border:0;border-radius:0}}</style></head><body><main><h1>${escapeHtml(title)}</h1>${english}<section class="ar" lang="ar">${arabic}</section><footer>${entity} · ${email} · Last updated: 24 August 2026</footer></main></body></html>`;
}

function publicOrigin(config) {
  return config.META_OAUTH_REDIRECT_URI ? new URL(config.META_OAUTH_REDIRECT_URI).origin : new URL(config.CORS_ORIGIN).origin;
}

async function removeConnectedAccountData(db, accountId, mode) {
  const confirmationCode = crypto.randomBytes(24).toString('base64url');
  const accountHash = crypto.createHash('sha256').update(String(accountId)).digest('hex');
  const channels = await db.query(
    `SELECT id, tenant_id, credential_ref FROM channel_connections
     WHERE provider IN ('instagram', 'messenger') AND external_account_id = $1`,
    [String(accountId)],
  );
  const ids = channels.rows.map((row) => row.id);
  const credentialRefs = channels.rows.map((row) => row.credential_ref).filter(Boolean);
  await db.transaction(async (client) => {
    if (ids.length) {
      if (mode === 'delete') {
        await client.query(
          `DELETE FROM contact_profiles WHERE id IN (
             SELECT contact_id FROM contact_identities
             WHERE provider IN ('instagram','messenger')
               AND metadata->>'channelConnectionId' = ANY($1::text[])
           )`,
          [ids.map(String)],
        );
        await client.query('DELETE FROM channel_connections WHERE id = ANY($1::uuid[])', [ids]);
      } else {
        await client.query(
          `UPDATE channel_connections SET status = 'disabled', credential_ref = NULL,
             config = config || $2::jsonb, updated_at = now()
           WHERE id = ANY($1::uuid[])`,
          [ids, JSON.stringify({ deauthorizedAt: new Date().toISOString() })],
        );
      }
    }
    if (credentialRefs.length) await client.query('DELETE FROM provider_credentials WHERE credential_ref = ANY($1::text[])', [credentialRefs]);
    await client.query(
      `INSERT INTO meta_data_deletion_requests (confirmation_code, account_hash, status, completed_at)
       VALUES ($1, $2, $3, now())`,
      [confirmationCode, accountHash, mode === 'delete' ? 'completed' : 'deauthorized'],
    );
  });
  return confirmationCode;
}

export function metaComplianceRoutes({ db, config }) {
  const router = Router();
  const htmlHeaders = (_req, res, next) => {
    res.header('Content-Type', 'text/html; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=300');
    res.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    next();
  };
  router.get('/legal/privacy', htmlHeaders, (_req, res) => res.send(legalPage(config, 'Privacy Policy',
    `<p>${escapeHtml(config.LEGAL_ENTITY_NAME)} processes only the data needed to connect an authorized Instagram professional account and provide customer messaging.</p><h2>Data and purposes</h2><p>We process professional-account identifiers, usernames, access credentials stored with authenticated encryption, customer messages and identifiers, delivery events, timestamps, and operator audit records. We use them only to receive and answer customer requests, show conversations to authorized staff, secure the service, and satisfy deletion requests.</p><h2>Sharing and retention</h2><p>Data is handled by the service infrastructure and its configured processors, including Chatwoot for the human inbox and Typebot for conversation execution. AI processing is used only when enabled by the operator. Message payloads in operational logs are redacted after ${config.DATA_RETENTION_DAYS} days. We do not sell personal data.</p><h2>Control</h2><p>The professional-account owner can disconnect the channel at any time. Data subjects may request access or deletion using the contact shown below or the Data Deletion page.</p>`,
    `<p>تعالج ${escapeHtml(config.LEGAL_ENTITY_NAME)} البيانات الضرورية فقط لربط حساب Instagram احترافي مصرح به وتقديم خدمة محادثات العملاء.</p><h2>البيانات والغرض</h2><p>نعالج معرفات الحساب واسم المستخدم، ورموز الوصول المشفرة، ورسائل العملاء ومعرفاتهم، وحالات التسليم، والطوابع الزمنية، وسجلات التدقيق. تستخدم هذه البيانات لاستقبال طلبات العملاء والرد عليها وعرضها للموظفين المخولين وتأمين الخدمة وتنفيذ طلبات الحذف.</p><h2>المشاركة والاحتفاظ</h2><p>تعالج البنية التحتية البيانات، ويستخدم Chatwoot كصندوق المحادثات وTypebot لتنفيذ التدفقات. لا تستخدم خدمات الذكاء الاصطناعي إلا عند تفعيلها. تحجب محتويات الرسائل من السجلات التشغيلية بعد ${config.DATA_RETENTION_DAYS} يومًا، ولا نبيع البيانات الشخصية.</p>`)));
  router.get('/legal/terms', htmlHeaders, (_req, res) => res.send(legalPage(config, 'Terms of Service',
    '<p>This service is an authorized customer-support workspace for Instagram professional accounts. Account owners must have authority to connect each account, use the service only for legitimate support interactions, protect operator access, and follow Meta Platform Terms and applicable law.</p><p>The service does not permit unsolicited bulk messaging, credential sharing, impersonation, scraping, or attempts to bypass platform limits. Automated replies start from customer-initiated conversations and may be handed to a human operator.</p>',
    '<p>هذه الخدمة مساحة معتمدة لدعم العملاء عبر حسابات Instagram الاحترافية. يجب أن يملك صاحب الحساب صلاحية ربطه، وأن يستخدم الخدمة للمحادثات المشروعة فقط، ويحمي وصول الموظفين، ويلتزم بشروط منصة Meta والقوانين المطبقة.</p><p>لا تسمح الخدمة بالرسائل الجماعية غير المطلوبة أو مشاركة كلمات المرور أو انتحال الهوية أو جمع البيانات آليًا أو تجاوز حدود المنصة. تبدأ الردود التلقائية من محادثات بدأها العميل ويمكن تحويلها إلى موظف.</p>')));
  router.get('/legal/data-deletion', htmlHeaders, (_req, res) => res.send(legalPage(config, 'Data Deletion',
    `<p>Disconnecting an Instagram channel immediately revokes its operational credential in this service. To request full deletion, use Instagram's app-removal controls or email ${escapeHtml(config.PRIVACY_CONTACT_EMAIL || 'the privacy contact configured for production')} with the professional account username. Verified requests remove the channel credential, provider events, conversation links, and channel-derived customer records. A confirmation code is returned for requests sent by Meta.</p>`,
    `<p>يؤدي فصل قناة Instagram إلى إلغاء رمز تشغيلها فورًا داخل الخدمة. لطلب الحذف الكامل استخدم أدوات إزالة التطبيق في Instagram أو راسل ${escapeHtml(config.PRIVACY_CONTACT_EMAIL || 'جهة الخصوصية التي ستحدد قبل الإنتاج')} مع اسم مستخدم الحساب الاحترافي. بعد التحقق تحذف بيانات القناة ورمزها وأحداث المزود وروابط المحادثات وسجلات العملاء الناتجة عنها، ويصدر رمز تأكيد للطلبات المرسلة من Meta.</p>`)));

  const signedRequestHandler = (mode) => async (req, res) => {
    const payload = parseMetaSignedRequest(req.body?.signed_request, [config.META_INSTAGRAM_APP_SECRET, config.META_APP_SECRET]);
    if (!payload?.user_id) return res.status(400).json({ error: 'invalid_signed_request' });
    const confirmationCode = await removeConnectedAccountData(db, payload.user_id, mode);
    if (mode === 'delete') {
      const url = new URL('/webhooks/meta/data-deletion/status', publicOrigin(config));
      url.searchParams.set('code', confirmationCode);
      return res.json({ url: url.toString(), confirmation_code: confirmationCode });
    }
    return res.status(200).json({ success: true });
  };
  router.post('/webhooks/meta/data-deletion', formParser, signedRequestHandler('delete'));
  router.post('/webhooks/meta/deauthorize', formParser, signedRequestHandler('deauthorize'));
  router.get('/webhooks/meta/data-deletion/status', htmlHeaders, async (req, res) => {
    const result = await db.query(
      'SELECT status FROM meta_data_deletion_requests WHERE confirmation_code = $1',
      [String(req.query.code || '')],
    );
    if (!result.rowCount) return res.status(404).send(legalPage(config, 'Deletion request not found', '<p>The confirmation code is invalid or expired.</p>', '<p>رمز التأكيد غير صالح أو منتهي.</p>'));
    return res.send(legalPage(config, 'Deletion request completed', '<p>The verified deletion request has been completed.</p>', '<p>اكتمل تنفيذ طلب الحذف المتحقق منه.</p>'));
  });
  return router;
}
