# نشر Understand على GitHub وRender

هذا المشروع مُعد للنشر الآمن عبر خدمتين منفصلتين من المستودع نفسه. تُنشر الواجهة بوصفها **Render Static Site**، بينما تعمل الترجمة وحاكم الحصص في **Render Web Service** خاصة. لا تضع أي مفتاح أو ملف بيئة في GitHub أو في متغير يبدأ بـ `VITE_`.

| المكوّن | خدمة Render | المسؤولية | هل يحتوي أسرارًا؟ |
|---|---|---|---|
| `understand-web` | Static Site | واجهة المستخدم وملفات CSS وJavaScript | لا |
| `understand-api` | Web Service | الترجمة، جلب النصوص، الذاكرة المؤقتة، وحاكم الحصص | نعم، في بيئة Render فقط |

## رفع المستودع إلى GitHub

أنشئ مستودعًا خاصًا أو عامًا فارغًا في GitHub، ثم فك ضغط الحزمة المرفقة في هذا المشروع وافتح الطرفية داخل المجلد. راجع أولًا أن الملف `.project-config.json` وملفات `.env*` وسجلّات التطوير ليست ضمن الملفات المراد رفعها؛ قواعد `.gitignore` تمنعها من الدخول مستقبلًا.

```bash
git init
git add .
git status
git commit -m "Prepare Understand for Render"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/understand.git
git push -u origin main
```

> قبل تنفيذ `git push`، نفّذ `git status` وتأكد بنفسك من عدم ظهور أي ملف `.env` أو `.project-config.json` أو ملف ZIP. لا تعتمد على GitHub لإخفاء سر تم رفعه بالفعل؛ يجب تدويره فورًا من مزوده إن حدث ذلك.

## إنشاء الخدمتين في Render

يمكن اختيار **New → Blueprint** وربط المستودع؛ سيقرأ Render ملف `render.yaml` وينشئ الخدمتين. بعد إنشاء الخدمة، عيّن المتغيرات التالية من لوحة **Environment**، وليس في الكود أو GitHub.

| الخدمة | المتغير | القيمة |
|---|---|---|
| `understand-api` | `GEMINI_API_KEY` | مفتاح مزود الترجمة الخاص بك |
| `understand-api` | `CORS_ORIGIN` | رابط واجهة Render النهائي، مثل `https://understand-web.onrender.com` |
| `understand-web` | `VITE_API_BASE_URL` | رابط API النهائي، مثل `https://understand-api.onrender.com` |

انشر خدمة `understand-api` أولًا وخذ رابطها، ثم أدخله في `VITE_API_BASE_URL` وانشر `understand-web`. بعد أن تحصل على رابط الواجهة، ضعه حرفيًا في `CORS_ORIGIN` ثم أعد نشر خدمة API. لا تستخدم نجمة `*` في `CORS_ORIGIN`.

## التحقق بعد النشر

افتح `https://YOUR_API.onrender.com/health` وتحقق من الاستجابة `{"status":"ok"}`. بعد ذلك افتح رابط الواجهة، أدخل فيديو يوتيوب، وتأكد من نجاح الترجمة. إن ظهرت رسالة اتصال، راجع تطابق الرابطين وبروتوكول `https` في متغيرات البيئة.

## إجراءات أمان مطبقة

خدمة API تسمح بالطلبات من قيمة `CORS_ORIGIN` المحددة فقط، ولا تكشف مفتاح الترجمة إلى المتصفح. كما أنها تعطل ترويسة تعريف الخادم وتضيف ترويسات منع تخمين نوع المحتوى وسياسات أذونات المتصفح لمسارات API. تحافظ الذاكرة المؤقتة وحاكم الحصص على تقليل الطلبات وعدم إزعاج المستخدم بأخطاء تقنية.

لأمان أعلى، فعّل التحقق بخطوتين في GitHub، فعّل تنبيهات التسريبات والفحص الآلي للتبعيات، وقيّد صلاحية مفتاح الترجمة من لوحة مزوده مع تدويره عند الاشتباه في كشفه.
