# My AI Desk

**My AI Desk** منصة تشغيل داخلية لإدارة خدمة الرد الآلي والمحادثات لعدة شركات من واجهة تعمل على الحاسوب، مع خدمات خلفية دائمة على الخادم. يستخدمها مالك المنصة وموظفوه فقط؛ الشركات العميلة لا تحصل على حسابات دخول. يرى المدير جميع الشركات والأعمال، بينما يرى كل موظف الشركات المعيّن عليها فقط، ويمكن تعيين الموظف لعدة شركات. تستمر الخدمات الخلفية في استقبال رسائل القنوات والرد تلقائياً بالـAI وتحويل المحادثة إلى موظف بشري عند الحاجة حتى عند إغلاق الواجهة.

## المكونات

| المجلد | المسؤولية |
| --- | --- |
| `control-plane/` | المصدر المركزي للعملاء والعضويات وجهات الاتصال وتعريفات الأتمتة |
| `dashboard/` | واجهة المشغلين الموحدة وتسجيل الدخول عبر Keycloak |
| `control-plane/src/bridge/` | جسر الأحداث المدمج: استقبال Webhooks، الجلسات، والإعادة الآمنة للمعالجة |
| `chatwoot-develop/` | مصدر Chatwoot 4.16.2 |
| `typebot.io-main/` | مصدر Typebot 3.17.2 |
| `infra/` | PostgreSQL وKeycloak وإعدادات البنية التحتية |
| `scripts/` | توليد الإعدادات وتسجيل Webhooks ومزامنة المصادر |

تعريف المنتج ونموذج المستخدمين والعزل موجود في [`docs/PRODUCT_DEFINITION.md`](docs/PRODUCT_DEFINITION.md)، وهو المرجع المعتمد عند وجود أي وصف قديم أو غامض.
تفاصيل الملكية والقرارات المعمارية موجودة في [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
المهام المنجزة والمؤجلة وترتيب التنفيذ موجودة في [`docs/ROADMAP.md`](docs/ROADMAP.md).
دليل التشغيل وضبط وكيل الذكاء الاصطناعي وحالة كل ميزة موجود في [`docs/USER_GUIDE_AR.md`](docs/USER_GUIDE_AR.md).
دليل تجهيز الخادم وDNS وHTTPS والنسخ الاحتياطي موجود في [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## المتطلبات

- خادم Linux للإنتاج أو Docker Desktop للتطوير.
- Docker Engine مع Compose v2.
- نطاق يوجّه النطاقات الفرعية التالية إلى الخادم: `dashboard`, `api`, `inbox`, `flows`, `bot`, `auth`, `hooks`, `assets`.
- المنفذان 80 و443 متاحان.

## تشغيل أولي على Windows

```powershell
.\scripts\bootstrap.ps1 -Domain example.com -Email admin@example.com -Brand "My Brand"
```

لإنشاء الإعداد فقط دون تشغيل الحاويات:

```powershell
.\scripts\bootstrap.ps1 -Domain example.com -Email admin@example.com -Brand "My Brand" -NoStart
```

إذا كان ملف `.env` موجوداً بالفعل:

```powershell
docker compose up -d --build
docker compose ps
```

## البناء من المصادر المحمّلة

البناء الافتراضي يستخدم صوراً مثبتة الإصدارات. للبناء من مجلدي المصدر المحليين:

```powershell
docker compose -f docker-compose.yml -f docker-compose.source-build.yml up -d --build
```

## عناوين الخدمات

- لوحة التحكم: `https://dashboard.<domain>`
- API المركزي: `https://api.<domain>`
- Chatwoot: `https://inbox.<domain>`
- Typebot Builder: `https://flows.<domain>`
- Typebot Viewer: `https://bot.<domain>`
- Keycloak: `https://auth.<domain>`

## تفعيل استقبال الرسائل

بعد إنشاء حساب Chatwoot ونشر تدفق Typebot، حدّث `CHATWOOT_API_TOKEN` و`TYPEBOT_PUBLIC_ID` في `.env` ثم نفّذ:

```powershell
.\scripts\register-webhook.ps1 -AccountId 1
```

## اختبارات سريعة

```powershell
cd control-plane
npm install
npm test

cd ..\dashboard
npm run build

cd ..
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.source-build.yml config --quiet
```

## ملاحظة قواعد البيانات

خدمة `postgres-init` تنشئ قواعد `chatwoot` و`typebot` و`keycloak` و`control_plane` بصورة idempotent، لذلك تعمل أيضاً عند ترقية تثبيت لديه volume قديم.
