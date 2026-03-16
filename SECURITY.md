# Security Policy / سياسة الأمان

---

## 🇺🇸 English Version

### Supported Versions
We actively provide security updates for the following versions of **Fateen OS**:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

### Reporting a Vulnerability
We take the security of our users' data (especially in the Egyptian retail sector) very seriously. If you discover a security vulnerability, please follow these steps:

1. **Do not report it publicly** (e.g., via GitHub Issues).
2. Email us directly at `security@fateen-os.com` (or contact the lead developer via the `about.html` dashboard).
3. Provide a detailed description of the exploit and steps to reproduce it.

**Response Time:** You can expect an initial response within **48 hours**. We will keep you updated as we work toward a resolution.

### Security Best Practices
* **Supabase Keys:** Never expose your `service_role` key in the frontend. Only use the `anon_public` key.
* **RLS:** Ensure Row Level Security (RLS) is enabled on all PostgreSQL tables.
* **Session Management:** Always clear session storage on shared cashier devices after the shift ends.

---

## 🇪🇬 النسخة العربية

### الإصدارات المدعومة
نحن نقوم بتقديم تحديثات أمنية دورية للإصدارات التالية من **نظام فطين**:

| الإصدار | الحالة             |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

### الإبلاغ عن ثغرة أمنية
نحن نولي أمن بيانات مستخدمينا (خاصة في قطاع التجزئة المصري) أهمية قصوى. إذا اكتشفت ثغرة أمنية، يرجى اتباع الخطوات التالية:

1. **عدم النشر بشكل علني** (مثلاً عبر GitHub Issues).
2. مراسلتنا مباشرة عبر البريد الإلكتروني `security@fateen-os.com` أو التواصل مع المطور عبر بوابة `about.html`.
3. تقديم وصف دقيق للثغرة وخطوات إعادة تنفيذها.

**وقت الاستجابة:** توقع رداً أولياً خلال **48 ساعة**. سنبقيك على اطلاع دائم بتقدمنا في حل المشكلة.

### نصائح أمنية هامة
* **مفاتيح Supabase:** لا تضع مفتاح الـ `service_role` أبداً في ملفات الـ HTML؛ استخدم فقط مفتاح الـ `anon_public`.
* **حماية الجداول (RLS):** تأكد من تفعيل خاصية Row Level Security لضمان عدم تداخل بيانات المتاجر.
* **إدارة الجلسات:** احرص دائماً على إنهاء الوردية (Logout) لمسح بيانات الجلسة من المتصفح في أجهزة الكاشير المشتركة.

---
> **"Securing Fateen OS is securing the trust of every merchant in Egypt."**
> **"تأمين نظام فطين هو تأمين لثقة كل تاجر في مصر."**
