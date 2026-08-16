# منصة المحادثات والأتمتة الموحدة

منصة داخلية ذات علامة تجارية خاصة تستخدم Chatwoot كمحرّك لصندوق المحادثات والدعم البشري، وTypebot كمحرّك لبناء التدفقات، مع Control Plane مركزي يملك العملاء وجهات الاتصال والأتمتة والصلاحيات.

## المكونات

| المجلد | المسؤولية |
| --- | --- |
| `control-plane/` | المصدر المركزي للعملاء والعضويات وجهات الاتصال وتعريفات الأتمتة |
| `dashboard/` | واجهة المشغلين الموحدة وتسجيل الدخول عبر Keycloak |
| `bridge/` | جسر Chatwoot إلى Typebot في مرحلة MVP |
| `chatwoot-develop/` | مصدر Chatwoot 4.16.2 |
| `typebot.io-main/` | مصدر Typebot 3.17.2 |
| `infra/` | PostgreSQL وKeycloak وإعدادات البنية التحتية |
| `scripts/` | توليد الإعدادات وتسجيل Webhooks ومزامنة المصادر |

تفاصيل الملكية والقرارات المعمارية موجودة في [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

## تفعيل جسر الرسائل

بعد إنشاء حساب Chatwoot ونشر تدفق Typebot، حدّث `CHATWOOT_API_TOKEN` و`TYPEBOT_PUBLIC_ID` في `.env` ثم نفّذ:

```powershell
.\scripts\register-webhook.ps1 -AccountId 1
```

## اختبارات سريعة

```powershell
cd control-plane
npm install
npm test

cd ..\bridge
npm test

cd ..\dashboard
npm run build

cd ..
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.source-build.yml config --quiet
```

## ملاحظة قواعد البيانات

خدمة `postgres-init` تنشئ قواعد `chatwoot` و`typebot` و`keycloak` و`control_plane` بصورة idempotent، لذلك تعمل أيضاً عند ترقية تثبيت لديه volume قديم.
