# نموذج متغيرات بيئة النشر

انسخ **الأسماء فقط** التالية إلى لوحة Environment في Render. لا تنشئ ملف `.env` داخل المستودع، ولا تضع القيم في GitHub أو في متغيرات تبدأ بـ `VITE_`.

| الخدمة | الاسم | هل هو سر؟ | مثال للقيمة |
|---|---|---:|---|
| API الخاصة | `GEMINI_API_KEY` | نعم | يوضع من لوحة مزود الترجمة فقط |
| API الخاصة | `CORS_ORIGIN` | لا | `https://understand-web.onrender.com` |
| الواجهة الثابتة | `VITE_API_BASE_URL` | لا | `https://understand-api.onrender.com` |

> لا يمكن اعتبار متغير `VITE_` سراً: Vite يضم قيمته في ملفات JavaScript التي تصل إلى المتصفح. لهذا لا يُسمح إلا بعنوان API في `VITE_API_BASE_URL`.
