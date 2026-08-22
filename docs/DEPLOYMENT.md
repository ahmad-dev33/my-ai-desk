# نشر My AI Desk على خادم

## الحد الأدنى المقترح للبداية

- Ubuntu 24.04 LTS، مع Docker Engine وDocker Compose v2.
- 4 vCPU و8 GB RAM و80 GB SSD للحسابات الأولى.
- عنوان IPv4 ثابت ونطاق تملكه.
- فتح 80 و443 للعامة، وحصر SSH بعنوان المدير قدر الإمكان.
- نسخ احتياطي خارجي مشفر؛ النسخة الموجودة على الخادم وحدها لا تكفي.

عند نمو الحمل إلى مئات الشركات، تُفصل PostgreSQL والتخزين والنسخ الاحتياطي
إلى خدمات مُدارة، ثم تُزاد عُقد المعالجة وفق القياسات الفعلية.

## DNS المطلوب

أنشئ سجلات `A` تشير إلى عنوان الخادم لكل من:

`dashboard`, `api`, `inbox`, `flows`, `bot`, `auth`, `hooks`, `assets`.

## الإعداد الأول

```bash
git clone <repository> my-ai-desk
cd my-ai-desk
./scripts/bootstrap.sh example.com admin@example.com "My AI Desk" --no-start
```

عدّل `.env` وأدخل SMTP ومفاتيح Meta، واجعل:

```env
PUBLIC_SCHEME=https
PUBLIC_PORT_SUFFIX=
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_TLS=true
CHATWOOT_FORCE_SSL=true
TYPEBOT_DISABLE_SIGNUP=true
META_OAUTH_REDIRECT_URI=https://hooks.example.com/oauth/meta/callback
```

لا تنقل `.env` عبر Git، ولا تستخدم قيم بيئة التطوير على الخادم. افحص الملف:

```powershell
./scripts/check-production-readiness.ps1
```

ثم شغّل وضع الإنتاج؛ هذا الوضع لا يشغّل ngrok:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose ps
```

## Meta

- Callback: `https://hooks.<domain>/webhooks/meta`
- OAuth redirect: `https://hooks.<domain>/oauth/meta/callback`
- ضع قيمة `META_VERIFY_TOKEN` نفسها في نموذج Webhooks داخل Meta.
- لا تضع كلمة مرور Facebook أو Instagram في `.env`؛ تسجيل الدخول يتم في صفحة Meta الرسمية.

## النسخ الاحتياطي

على Windows أو قبل النقل:

```powershell
./scripts/backup.ps1
```

ينشئ السكربت نسخ PostgreSQL بصيغة `custom` داخل `backups/` ويحذف النسخ
المحلية الأقدم من 14 يومًا. انقلها دوريًا إلى تخزين خارجي مشفر واختبر الاستعادة.

## بوابة الإطلاق

- نجاح فاحص الإنتاج والاختبارات.
- نجاح HTTPS لكل النطاقات الفرعية.
- نجاح رسالة Instagram واردة، رد آلي، ظهورها في Chatwoot، ثم رد يدوي.
- تفعيل النسخ الاحتياطي والتنبيه عند فشل Outbox أو Webhook.
- إبقاء ManyChat دون ردود آلية أثناء اختبار التحويل، ثم فصله بعد نجاح المسار الكامل.
