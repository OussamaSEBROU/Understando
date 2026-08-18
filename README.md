# Understand

تطبيق لمشاهدة فيديوهات يوتيوب مع ترجمة نصية متزامنة إلى لغة يختارها المستخدم. يتضمن طبقة ترجمة قابلة لتغيير الحجم، أزرار تقديم وتأخير متزامنة، وحاكم استخدام محافظ للمسار المجاني.

## التشغيل المحلي

يتطلب المشروع Node.js 22 وpnpm.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

## الفحص

```bash
pnpm test
pnpm check
pnpm build
```

## النشر

راجع [DEPLOYMENT.md](./DEPLOYMENT.md) لنشر الواجهة كـ Render Static Site وخدمة الترجمة كـ Render Web Service آمنة، وراجع [DEPLOYMENT_ENVIRONMENT.md](./DEPLOYMENT_ENVIRONMENT.md) لأسماء المتغيرات المسموح بها.
