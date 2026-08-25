# خطة توحيد وتحديث مشروع My AI Desk

## 1. القرار التنفيذي

المشروع لا يحتاج إلى إعادة كتابة. بنيته الأساسية صحيحة وقابلة للتطوير:

- `control-plane` هو مصدر الحقيقة لبيانات الشركات والمستخدمين والمنتجات والمعرفة والأتمتة.
- Chatwoot هو صندوق المحادثات البشرية الوحيد.
- Typebot مسؤول عن تنفيذ مسارات المحادثة.
- PostgreSQL وRedis وMinIO وKeycloak وTraefik تؤدي أدوارا منفصلة وواضحة.
- منطق الربط المخصص موجود داخل `control-plane` ولا يكرر منطق Chatwoot أو Typebot.

المطلوب هو تسديد دين تقني متراكم في العقود بين المكونات، وليس تغيير المعمارية الأساسية. أفضل استراتيجية هي ترحيل تدريجي قابل للعكس، يبدأ بإصلاح التشغيل المحلي، ثم يوحد الإعدادات والأسماء، ثم يقسم الوحدات الكبيرة ويحسن الاختبارات والتشغيل الإنتاجي.

## 2. نطاق المراجعة

شملت المراجعة:

- الشفرة المملوكة للمشروع في `control-plane` و`dashboard`.
- Docker Compose وTraefik وNginx وKeycloak.
- عقود SSO وOAuth وwebhooks والروابط العامة.
- السكربتات وملفات البيئة والتوثيق.
- ترابط ملفات المصدر وقابلية الوصول إليها من نقاط التشغيل.
- الخدمات المتكررة أو غير المستخدمة.
- الأسماء التجريبية أو الغامضة أو المرتبطة بمنتج خارجي.
- الاختبارات والبناء وPWA والاستعداد المحلي والإنتاجي.

لا يشمل التعديل المباشر:

- كود Chatwoot وTypebot upstream.
- مجلدات `memory/` التاريخية كمصدر قرارات حالي.
- ملفات Omniroute التي طلب مالك المشروع تجاهلها.

## 3. تقييم الحالة الحالية

| المجال | التقييم | الملاحظة الأساسية |
|---|---:|---|
| حدود المعمارية | 8/10 | فصل جيد بين Control Plane والمحركات الخارجية |
| ترابط ملفات المصدر | 8/10 | ملفات المصدر المخصصة المستخدمة قابلة للوصول من نقاط التشغيل |
| توحيد الأسماء | 5/10 | الاسم التجاري حديث لكن معرّفات `unified` ما زالت منتشرة |
| الإعدادات | 5/10 | إعدادات البناء والتشغيل متداخلة وقد تنتج صورا قديمة |
| الأمن وSSO | 6/10 | الفكرة صحيحة لكن عقد headers بين المسارات غير مكتمل |
| قابلية الصيانة | 6/10 | `dashboard/src/main.jsx` كبير جدا وبعض أسماء الوحدات غامضة |
| الاختبارات | 7/10 | اختبارات الوحدات جيدة، لكن ينقص اختبار التكامل عبر proxy والمتصفح |
| التشغيل المحلي | 6/10 | الخدمات تعمل، لكن صورة الواجهة الحالية قديمة وiframe محجوب |
| الجاهزية الإنتاجية | 5/10 | تحتاج HTTPS حقيقي، أسرار مستقلة، وسياسة نشر وفحوص تشغيل |
| PWA | 7/10 | الأساس موجود، وتلزم أيقونات ومعايير تثبيت أوسع |

## 4. المعمارية الحالية المعتمدة

```text
Browser
  |
  v
Traefik edge proxy
  |-- dashboard.* ----> Dashboard / Nginx
  |-- api.* ----------> Control Plane
  |-- inbox.* --------> Chatwoot Web
  |-- flows.* --------> Typebot Builder
  |-- bot.* ----------> Typebot Viewer
  |-- auth.* ---------> Keycloak
  |-- hooks.* --------> Control Plane webhooks/OAuth
  `-- assets.* -------> MinIO

Control Plane
  |-- PostgreSQL: product and tenant source of truth
  |-- Redis: sessions, queues, idempotency
  |-- MinIO: documents and assets
  |-- Chatwoot API: human inbox integration
  `-- Typebot API: conversation execution integration
```

هذه المعمارية تبقى كما هي. لا ينقل CRM إلى Chatwoot أو Typebot، ولا تدمج المحركات في بعضها، ولا تعدل نسخ upstream لتضمين منطق المنتج.

## 5. المعمارية المستهدفة

```text
                    Canonical Environment Contract
                  /config/runtime.json + secrets store
                                  |
                                  v
Browser -> Edge Proxy -> Route/Frame Policy -> Product Services
                 |                 |
                 |                 `-> exact CSP/XFO rules
                 `-> request ID, health, readiness, access logs

Dashboard features                 Control Plane modules
  shell/auth                         identity/access
  tenants                            tenants/memberships
  contacts                           contacts
  products                           products
  knowledge                          knowledge/RAG
  automation                         engagement automation
  integrations                       integrations
  operations                         messaging bridge/jobs

External engines remain replaceable upstream services:
  Chatwoot | Typebot | Keycloak | PostgreSQL | Redis | MinIO
```

## 6. معيار التسمية الموحد

### 6.1 الأسماء القانونية

| النوع | الاسم المعتمد |
|---|---|
| اسم المنتج الظاهر | `My AI Desk` |
| المعرّف التقني الجديد | `my-ai-desk` |
| مساحة npm | `my-ai-desk-*` |
| Docker project | `my-ai-desk` |
| بادئة الصور | `my-ai-desk-*` |
| بادئة مفاتيح المتصفح | `my-ai-desk:*` |
| بادئة metrics/logs | `my_ai_desk_*` |

### 6.2 أسماء الخدمات

| المسؤولية | الاسم المعتمد |
|---|---|
| واجهة الإدارة | `dashboard` |
| منطق المنتج ومصدر الحقيقة | `control-plane` |
| صندوق المحادثات | `chatwoot-web` |
| مهام Chatwoot | `chatwoot-worker` |
| محرر المسارات | `typebot-builder` |
| مشغل المسارات | `typebot-viewer` |
| الهوية | `keycloak` |
| قاعدة البيانات | `postgres` |
| الحالة والصفوف | `redis` |
| تخزين الكائنات | `minio` |
| البوابة | `edge-proxy` |

خدمات `init` و`migrate` و`brand` ليست تكرارا؛ هي مهام تشغيل لمرة واحدة ويجب أن تسمى بحسب النتيجة التي تحققها، مثل `chatwoot-migrate` و`chatwoot-bootstrap`.

### 6.3 أسماء النطاقات

| الوظيفة | النطاق الفرعي |
|---|---|
| لوحة الإدارة | `dashboard` |
| API | `api` |
| Chatwoot | `inbox` |
| Typebot Builder | `flows` |
| Typebot Viewer | `bot` |
| Keycloak | `auth` |
| OAuth وwebhooks | `hooks` |
| الملفات | `assets` |

### 6.4 سياسة ترحيل `unified`

لا ينفذ بحث واستبدال شامل. بعض القيم هويات مخزنة وليست نصوص عرض، خصوصا Keycloak realm/client IDs وDocker resources ومفاتيح جلسة المتصفح.

1. إضافة الأسماء القانونية الجديدة إلى وثيقة عقد الإعدادات.
2. دعم قراءة المعرّفات القديمة والجديدة خلال إصدار انتقالي واحد على الأقل.
3. ترحيل session keys مع fallback للقديم ثم حذفه بعد انتهاء الجلسات السابقة.
4. إنشاء Keycloak clients الجديدة مع redirect URIs مزدوجة قبل تعطيل القديمة.
5. تغيير Docker project/image names في نافذة ترحيل مستقلة مع نسخ احتياطي للأحجام.
6. تغيير أسماء npm والتوثيق والسكربتات بعد فصلها عن الهويات المخزنة.
7. إزالة `unified` فقط بعد فحص آلي يمنع بقاء استخدامات تشغيلية غير موثقة.

استخدام كلمة "unified" كصفة إنجليزية عامة في التوثيق ليس خطأ. المحظور هو استخدامها كهوية تقنية قديمة غير موثقة.

## 7. مشاكل مؤكدة وأولوياتها

### P0: منع iframe الحالي

المسار `flows.../sso/typebot.html` يوجه إلى Nginx الخاص بالواجهة، والذي يضيف عالميا:

```text
X-Frame-Options: SAMEORIGIN
```

لكن الصفحة العليا تعمل على `dashboard...` وصفحة SSO تعمل على `flows...`، وهما origin مختلفان. لذلك يمنع Chromium الصفحة قبل تشغيل JavaScript.

الإصلاح الصحيح:

- عدم تطبيق `X-Frame-Options: SAMEORIGIN` على صفحات SSO المضمنة.
- تعيين `Content-Security-Policy: frame-ancestors` بقائمة origins دقيقة.
- إبقاء الحماية الصارمة على صفحات dashboard العادية.
- تطبيق العقد نفسه على Typebot SSO وChatwoot SSO.
- إضافة اختبار HTTP headers واختبار متصفح حقيقي يمنع عودة الخلل.

### P0: الصور التشغيلية القديمة

تشغيل `docker compose up -d` لا يعيد بناء الصور. الحاويات الحالية أقدم من آخر تغييرات المصدر، ولذلك نجاح تعديل الشفرة لا يعني أن الحاوية تشغله.

الإصلاح الصحيح:

- أمر تطوير رسمي واحد يعيد بناء الخدمات المملوكة للمشروع فقط.
- إظهار commit/build timestamp في `/health` أو `/version`.
- فحص يرفض اعتبار بيئة التشغيل حديثة إذا اختلف build metadata عن المصدر المطلوب.

### P1: تداخل build-time وruntime configuration

الواجهة تقرأ `VITE_*` أثناء البناء، بينما Docker Compose وسكربت البناء يمرران النطاقات والبروتوكول. النتيجة صورة مرتبطة ببيئة محددة واحتمال تشغيل صورة قديمة بعد تغيير `.env`.

الحل المستهدف:

- بناء Dashboard مرة واحدة.
- توليد `/runtime-config.json` أو `/runtime-config.js` عند بدء الحاوية.
- تحميل الإعدادات قبل bootstrap.
- التحقق من schema وإظهار خطأ تشغيلي واضح عند نقص قيمة.
- منع الأسرار نهائيا من runtime config العام.

### P1: عقد الأسرار غير واضح

بعض متغيرات البيئة تستخدم fallback إلى `WEBHOOK_SHARED_SECRET`. هذا مناسب للتطوير المؤقت لكنه غير مناسب للإنتاج لأنه يجمع صلاحيات مختلفة في سر واحد.

العقد المستهدف:

| السر | الغرض | سياسة الإنتاج |
|---|---|---|
| `META_APP_SECRET` | OAuth/Meta API | مستقل وإلزامي |
| `META_VERIFY_TOKEN` | تحقق webhook | مستقل وإلزامي |
| `CHATWOOT_API_TOKEN` | API داخلي | مستقل وإلزامي |
| `CHATWOOT_PLATFORM_API_TOKEN` | Platform API | مستقل وإلزامي |
| `BRIDGE_SERVICE_SECRET` | مصادقة bridge | مستقل وإلزامي |
| `KEYCLOAK_CONTROL_PLANE_CLIENT_SECRET` | OIDC service client | مستقل وإلزامي |
| `CREDENTIAL_ENCRYPTION_KEY` | تشفير الاعتمادات | مستقل، قوي، وقابل للتدوير |

يسمح بالـfallback فقط في profile محلي معلن، مع تحذير واضح عند الإقلاع.

### P1: local وproduction غير منفصلين بوضوح

فحص الجاهزية الإنتاجية يعامل خصائص التشغيل المحلي كأخطاء. المطلوب profile صريح:

- `Local`: HTTP و`.localhost` وsignup اختياري وأسرار تطوير.
- `Production`: HTTPS، نطاق عام، signup مغلق، أسرار مستقلة، reverse proxy موثوق، نسخ احتياطي ومراقبة.

لا ينبغي تحويل البيئة المحلية إلى إنتاج مصغر، ولا اعتبار نجاحها دليلا على الجاهزية الإنتاجية.

## 8. تحسين أسماء الوحدات وواجهات API

### 8.1 ManyChat

الأسماء `manychat` و`parity-engine` تربط منطق المنتج باسم منافس وبهدف تنفيذ غامض. الاسم المهني يجب أن يصف المجال.

الاقتراح:

| الحالي | المستهدف |
|---|---|
| `manychat` | `engagement-automation` |
| `parity-engine.js` | `automation-service.js` أو اسم أدق بحسب المسؤوليات |
| `/v1/tenants/:id/manychat` | `/v1/tenants/:id/engagement-automation` |
| dashboard alias `manychat` | `automation` |

يبقى المسار القديم alias موثقا ومعلما deprecated خلال فترة التوافق، مع metrics لمعرفة توقف العملاء عن استخدامه قبل الحذف.

### 8.2 مسارات الاختبار في API

`/keywords/test` ليس اختبار وحدة؛ هو تنفيذ preview/evaluation في وقت التشغيل. الاسم المقترح:

- `/keywords/evaluate` إذا كان يرجع قرار المطابقة.
- `/keywords/preview` إذا كان يعرض نتيجة متوقعة بلا آثار جانبية.

تبقى كلمة `test` في مجلدات الاختبارات وأسماء ملفات الاختبار؛ هذا معيار مهني طبيعي وليس اسما تجريبيا يجب حذفه.

### 8.3 Bridge

`bridge` مفهوم صحيح لكنه عام. تستخدم أسماء أدق في الطبقات:

- `messaging-bridge` للمجال العام.
- `chatwoot-typebot-bridge` للمحول المحدد.
- `webhook-dispatcher` لمعالجة webhook.
- `conversation-session-store` لحالة Redis.

المجلد الجذري `bridge/` الفارغ يزال بعد التأكد من عدم اعتماد أي سكربت خارجي عليه. لا ينشأ microservice جديد؛ التنفيذ يبقى داخل Control Plane.

### 8.4 Mock في تشغيل الإنتاج

الشرط الذي يعتمد على أن قيمة المفتاح تساوي `mock` يسرّب مفهوم الاختبار إلى إعدادات الإنتاج. يستبدل بـ:

- dependency injection في الاختبارات.
- provider mode صريح ومتحقق منه، مثل `AI_PROVIDER_MODE=live|stub`، على أن يسمح `stub` في Local/Test فقط.

## 9. عقد الأخطاء الموحد

الأخطاء الحالية خليط من `Error` خام، و`code/statusCode`، ورسائل نصية قد تتغير. العقد المستهدف:

```json
{
  "error": {
    "code": "WEBHOOK_TOKEN_INVALID",
    "message": "Webhook verification failed",
    "details": null,
    "requestId": "req_..."
  }
}
```

القواعد:

- `code` ثابت، إنجليزي، `UPPER_SNAKE_CASE`، ولا يحتوي مسافات.
- `message` آمن للمستخدم ولا يكشف أسرارا.
- الترجمة في Dashboard تعتمد على `code` لا على مقارنة النص.
- `details` اختيارية ومتحقق منها، ولا تظهر في production إلا إذا كانت آمنة.
- `requestId` يولد على الحافة ويمر عبر كل خدمة وسجل.
- الأخطاء المتوقعة لا تصبح 500.
- أخطاء المزود الخارجي تطبع في logs بعد تنقيح tokens وPII.

## 10. تفكيك Dashboard

`dashboard/src/main.jsx` أصبح نقطة تجمع كبيرة تقارب 1,270 سطرا. التفكيك يتم بعد تثبيت السلوك بالاختبارات، وعلى مراحل منفصلة عن إعادة التسمية.

```text
src/
  app/
    App.jsx
    routes.jsx
    runtime-config.js
  auth/
    auth-client.js
    AuthCallback.jsx
  features/
    tenants/
    contacts/
    products/
    knowledge/
    automation/
    integrations/
    operations/
  shared/
    api/
    errors/
    forms/
    hooks/
    ui/
```

القواعد:

- كل feature يملك views وAPI adapter واختباراته.
- لا تكرر منطق التحميل والأخطاء والإرسال؛ ينقل إلى shared hooks صغيرة.
- لا تنشأ طبقة abstractions قبل وجود استخدامين حقيقيين.
- يبقى tenant context في مكان واحد.
- لا تخلط نقل الملفات مع تغيير السلوك في نفس الحزمة.

## 11. PWA والتثبيت

الـmanifest وservice worker موجودان ويعملان كأساس. للوصول إلى واجهة تثبيت احترافية:

- إضافة PNG بحجمي `192x192` و`512x512`.
- إضافة `apple-touch-icon` بحجم `180x180`.
- إضافة maskable icon.
- ضبط `scope` و`start_url` و`id` على هوية المنتج القانونية.
- عدم cache لملف runtime config أو OAuth callbacks تخزينا طويلا.
- توفير صفحة offline مفهومة بدلا من خطأ شبكة خام.
- اختبار installability على Chrome desktop وAndroid، واختبار الإضافة إلى الشاشة على iOS.

جاهزية PWA لا تعني أن تكامل Instagram جاهز للإنتاج؛ هما مساران مستقلان.

## 12. نظافة المستودع والتوثيق

الإجراءات المطلوبة:

- تحديث `README.md` لأنه يشير إلى أسماء مجلدات upstream غير موجودة.
- جعل `SOURCE_MANIFEST.md` المرجع الوحيد لمصادر Chatwoot وTypebot الاختيارية.
- إزالة `bridge/` الفارغ بعد فحص الاعتماد الخارجي.
- عدم حفظ نسخة backup كاملة من upstream داخل شجرة المشروع؛ تستخدم tag/commit أو archive خارج المستودع.
- توحيد إصدارات الحزم أو توثيق سبب اختلافها.
- إضافة `ARCHITECTURE.md` مختصر يربط إلى تعريف المنتج وعقد التشغيل.
- إنشاء قاموس أسماء يمنع عودة `unified` أو `manychat` كمعرّفات جديدة.
- إبقاء الاختبارات باسم `test` أو `*.test.js`؛ هذه أسماء قياسية عالمية.

## 13. سجل حالات الفشل

| الحالة | الكشف | الاستجابة | منع التكرار |
|---|---|---|---|
| iframe محجوب | Browser E2E وheaders test | رسالة خطأ في dashboard وسجل proxy | عقد CSP/XFO آلي |
| صورة حاوية قديمة | build metadata mismatch | إيقاف أمر التشغيل مع توضيح | أمر build/start موحد |
| redirect URI غير مطابق | startup validation | تعطيل زر الربط مع سبب واضح | مقارنة config مع canonical public URL |
| سر ناقص | readiness check | الخدمة non-ready لا crash loop مبهم | schema للبيئة حسب profile |
| Chatwoot بطيء أول طلب | warm-up/readiness | retry محدود مع backoff | readiness فعلي قبل توجيه المرور |
| Meta webhook مكرر | idempotency key | إرجاع نجاح دون إعادة الأثر | اختبار تكرار متعدد الحسابات |
| مزود خارجي متوقف | timeout/circuit breaker | queue/retry أو degradation | metrics وتنبيه |
| Redis غير متاح | health dependency | رفض آمن للعمليات المعتمدة على الجلسة | reconnect وحدود retry |
| DB migration فاشلة | migration job status | منع بدء التطبيق | backup واختبار migration |
| runtime config غير صالح | schema validation | صفحة إعدادات غير صالحة | contract test لكل profile |

## 14. سجل الأخطاء والإنقاذ

| الطبقة | الخطأ | السلوك المطلوب |
|---|---|---|
| Edge | host غير معروف | 404 عام بلا كشف للخدمات |
| Auth | جلسة منتهية | refresh مرة واحدة ثم تسجيل دخول مع return URL آمن |
| Control Plane | validation | 400 مع code وfield details |
| Control Plane | unauthorized/forbidden | 401/403 منفصلان بلا كشف بيانات tenant |
| Integrations | upstream timeout | 504 أو 503 ثابت مع requestId |
| Worker | job retryable | backoff محدود ثم dead-letter |
| Worker | job permanent | لا retry، يسجل السبب ويظهر في operations |
| Dashboard | API expected error | رسالة عربية مفهومة تعتمد على code |
| Dashboard | unknown error | رسالة عامة وrequestId للدعم |

## 15. استراتيجية الاختبار

```text
                 Browser E2E
              SSO / OAuth / PWA
            ---------------------
             Compose smoke tests
          proxy / headers / health
        -----------------------------
           API integration tests
        DB / Redis / idempotency / ACL
      ---------------------------------
             Unit and contract tests
      config / naming / errors / adapters
    -------------------------------------
            Static repository checks
    forbidden names / dead paths / schemas
```

بوابات الاختبار المطلوبة:

- فحص أسماء يمنع معرّفات قديمة جديدة مع allowlist للترحيل.
- اختبار schema لمتغيرات Local وProduction.
- اختبار كل route عام عبر Traefik وليس الخدمة مباشرة فقط.
- اختبار headers لكل صفحة top-level ولكل صفحة iframe.
- اختبار SSO فعلي لـTypebot وChatwoot في متصفح.
- اختبار OAuth success/error/state mismatch دون إرسال أسرار في logs.
- اختبار عزل tenant والصلاحيات many-to-many.
- اختبار idempotency للwebhooks والjobs.
- اختبار manifest وicons وservice-worker caching.
- canary بعد النشر يختبر health وتسجيل الدخول وصفحة integrations دون إجراء تغييرات خارجية.

## 16. خطة التنفيذ المرحلية

### المرحلة 0: استعادة تشغيل محلي صحيح

الهدف: إزالة الأعطال الحالية دون إعادة هيكلة.

- إصلاح headers لمسارات Typebot وChatwoot SSO.
- إضافة اختبارات proxy وiframe.
- إعادة بناء صور `dashboard` و`control-plane` فقط.
- إضافة build metadata مرئي.
- توثيق أمر تشغيل محلي واحد.

بوابة القبول:

- يفتح Typebot وChatwoot داخل Dashboard دون رفض اتصال.
- لا تفقد صفحات dashboard العادية حماية framing.
- الحاويات تشغل آخر build معروف.

### المرحلة 1: عقد الإعدادات والتشغيل

الهدف: مصدر حقيقة واحد للروابط والprofiles والأسرار.

- تعريف config schema قانوني.
- نقل public dashboard config إلى runtime.
- فصل Local عن Production readiness.
- إزالة fallback للأسرار في Production.
- إضافة `/version` وrequest IDs وreadiness دقيق.

بوابة القبول:

- نفس صورة Dashboard تعمل محليا وإنتاجيا بلا rebuild.
- نقص أي قيمة يعطي خطأ محددا قبل استقبال المرور.
- لا يحتوي bundle العام أي سر.

### المرحلة 2: ترحيل الأسماء

الهدف: جعل `My AI Desk` الهوية الوحيدة الجديدة دون كسر البيانات القديمة.

- إضافة naming registry وفحص CI.
- ترحيل npm/image/browser keys.
- إنشاء Keycloak identities الجديدة بالتوازي.
- ترحيل `manychat` إلى `engagement-automation` مع aliases.
- إعادة تسمية الوحدات الغامضة بعد تثبيت العقود.

بوابة القبول:

- لا ينشأ أي معرف `unified` جديد.
- المسارات القديمة تعمل وتصدر deprecation metrics.
- المستخدمون والجلسات والتكاملات الحالية لا تفقد الوصول.

### المرحلة 3: قابلية الصيانة وعقد الأخطاء

الهدف: تسهيل التطوير دون تغيير تجربة المستخدم.

- تقسيم `main.jsx` بحسب features.
- توحيد API error envelope والترجمة.
- استخراج adapters للتكاملات الخارجية.
- استبدال sentinel `mock` بحقن dependencies/mode صريح.
- إضافة tests قبل كل نقل سلوكي.

بوابة القبول:

- لا feature يعتمد مباشرة على تفاصيل feature آخر.
- كل خطأ API موثق وله code واختبار.
- لا يتغير السلوك المرئي إلا بقرار منتج موثق.

### المرحلة 4: الإنتاج والتشغيل وPWA

الهدف: إطلاق آمن وقابل للمراقبة.

- إكمال icons وoffline/cache policy.
- HTTPS والنطاقات النهائية وMeta redirect/webhook URLs.
- backups واستعادة مجربة وتدوير أسرار.
- metrics وalerts وdead-letter operations.
- runbooks للنشر والتراجع والحوادث.

بوابة القبول:

- ينجح Production readiness بلا استثناءات محلية.
- ينجح canary بعد النشر.
- توجد خطة rollback ونسخة احتياطية مستعادة تجريبيا.
- ينجح ربط حساب Instagram تجريبي قبل الحساب الحقيقي.

## 17. ترتيب الحزم المقترح

كل حزمة صغيرة وقابلة للمراجعة والتراجع:

1. `fix(sso): define frame policy for embedded helper routes`
2. `test(edge): cover routed headers and embedded SSO pages`
3. `build(runtime): expose build metadata and canonical local start`
4. `feat(config): load validated dashboard runtime config`
5. `ops(config): split local and production readiness profiles`
6. `refactor(errors): introduce stable error codes and request ids`
7. `refactor(automation): add engagement-automation compatibility API`
8. `refactor(dashboard): split features without behavior changes`
9. `chore(naming): migrate compatible my-ai-desk identifiers`
10. `feat(pwa): complete install assets and offline policy`

لا تجمع إعادة تسمية Keycloak أو Docker volumes مع تغيير API أو refactor الواجهة في حزمة واحدة.

## 18. استراتيجية التراجع

- كل اسم جديد يملك alias قديم خلال الترحيل.
- كل migration لقاعدة البيانات additive أولا، ثم backfill، ثم switch، ثم cleanup في إصدار لاحق.
- تؤخذ نسخة احتياطية قبل تغيير realm أو volumes أو credentials.
- يحتفظ بإصدار الصورة السابق القابل للتشغيل.
- runtime config الجديد يملك feature flag للعودة المؤقتة إلى قيم build-time خلال مرحلة واحدة فقط.
- لا يزال alias أو عمود قديم قبل إثبات توقف استخدامه بالmetrics.

## 19. ما تم إثباته بالفعل

- اختبارات Control Plane نجحت: 56 اختبارا.
- اختبارات Dashboard نجحت: 13 اختبارا.
- بناء Dashboard الإنتاجي نجح.
- manifest وservice worker قابلان للوصول.
- Typebot نفسه يستجيب، وسبب الرفض هو header على صفحة SSO الموجهة عبر Dashboard.
- ملفات المصدر المخصصة الحالية مرتبطة بنقاط التشغيل، ولم يظهر service مخصص مكرر يؤدي المسؤولية نفسها.
- `rag-engine` مستخدم فعليا وليس ملفا تجريبيا أو مكررا.
- خدمات Chatwoot worker/migrate/bootstrap وTypebot builder/viewer أدوار منفصلة وليست نسخا عشوائية.

هذه النتائج لا تعني الجاهزية الإنتاجية؛ اختبارات المتصفح عبر proxy والنشر الفعلي ما زالت بوابات إلزامية.

## 20. قرارات معمارية ثابتة

| القرار | السبب |
|---|---|
| عدم إعادة كتابة المشروع | الحدود الأساسية سليمة، والمشاكل في العقود والصيانة |
| إبقاء upstreams دون تعديل | سهولة تحديث الأمن والمزامنة مع المصدر |
| إبقاء bridge داخل Control Plane | منع خدمة إضافية ومنطق tenant مكرر |
| runtime config للواجهة | صورة واحدة لكل البيئات ومنع drift |
| ترحيل أسماء متوافق | حماية الجلسات والبيانات والبنية الحالية |
| CSP دقيق بدلا من تعطيل الحماية | السماح بالـiframe المطلوب فقط |
| aliases وdeprecation metrics | إزالة القديم بناء على دليل لا تخمين |
| refactor بعد تثبيت العقود | تقليل مساحة الأعطال وصعوبة المراجعة |

## 21. تعريف الاكتمال

يعد مشروع التحديث مكتملا عندما:

- يعمل التشغيل المحلي بأمر موثق واحد.
- تعمل صفحات Chatwoot وTypebot المضمنة مع سياسة أمان مقيدة.
- توجد هوية تسمية قانونية واحدة ولا تدخل أسماء قديمة جديدة.
- تعمل الصورة نفسها في Local وProduction عبر runtime config.
- تكون أسرار الإنتاج مستقلة ومتحققا منها.
- تكون أخطاء API ثابتة وقابلة للترجمة والتتبع.
- تكون الواجهة مقسمة حسب المجال دون تكرار منطق الحالة والطلبات.
- تغطي الاختبارات proxy وSSO وOAuth والعزل وidempotency وPWA.
- يكون النشر قابلا للتراجع ومراقبا وله نسخ احتياطي مجرب.
- يكون ربط Instagram قد مر بحساب تجريبي وبيئة HTTPS عامة قبل الحساب الحقيقي.

## GSTACK REVIEW REPORT

| Run | المنظور | النتيجة | أبرز الاستنتاجات |
|---:|---|---|---|
| 1 | CEO/Product | PASS WITH ACTIONS | المنتج متماسك ولا يحتاج إعادة كتابة؛ الأولوية للموثوقية والجاهزية |
| 2 | Design/UX | PASS WITH ACTIONS | PWA والواجهة أساسهما جيد؛ أخطاء SSO وحالات الفشل تحتاج تجربة واضحة |
| 3 | Engineering | PASS WITH ACTIONS | الحدود صحيحة؛ config وnaming وerror contracts وdashboard modularity تحتاج معالجة |
| 4 | Developer Experience | PASS WITH ACTIONS | يلزم أمر تشغيل واحد، profiles واضحة، naming registry، واختبارات proxy |

### الحكم النهائي

الاستراتيجية المعتمدة هي **تحديث تدريجي محافظ**: إصلاح عقد SSO والتشغيل أولا، ثم توحيد الإعدادات، ثم ترحيل الأسماء بتوافق خلفي، ثم تحسين الوحدات والأخطاء، وأخيرا إغلاق متطلبات الإنتاج وPWA. إعادة الكتابة أو الاستبدال الشامل للأسماء مخاطرة غير مبررة.

### الموضوعات المشتركة بين المراجعات

- مصدر حقيقة واحد للإعدادات والأسماء.
- حماية حدود المنتج وعدم نقل منطقه إلى upstream engines.
- اختبارات تكامل حقيقية عبر البوابة والمتصفح.
- تغييرات صغيرة قابلة للمراجعة والتراجع.
- عدم ربط الجاهزية المحلية بالجاهزية الإنتاجية.

NO UNRESOLVED DECISIONS
