# خلاصه تغییرات (دیباگ و آماده‌سازی)

## 1) رفع باگ اصلی: آپلود لوگو / تصویر → «مسیر یافت نشد»
فایل: backend/src/index.ts
مشکل: فایل‌ها در پوشه‌ی `uploads` ذخیره می‌شدند اما سرور استاتیک از پوشه‌ی `storage`
سرو می‌کرد. در نتیجه بعد از آپلود موفق، درخواست نمایش فایل با 404 مواجه می‌شد.
راه‌حل: مسیر `express.static` به `uploads` اصلاح شد تا با محل واقعی ذخیره‌سازی
(`LocalStorageProvider`) یکی باشد.

## 2) آماده‌سازی برای مهاجرت از GitHub Pages به دامنه‌ی اختصاصی
- frontend-admin/vite.config.ts: مسیر پایه (base) از مقدار هاردکد `/frontend-admin/`
  به متغیر محیطی `PUBLIC_BASE_PATH` تبدیل شد (دقیقاً هم‌الگو با ریپازیتوری test-site).
- frontend-admin/.github/workflows/deploy.yml: متغیر `PUBLIC_BASE_PATH` به مرحله‌ی
  build اضافه شد. برای دامنه‌ی اختصاصی کافیست در تنظیمات GitHub → Settings → 
  Variables مقدار `PUBLIC_BASE_PATH=/` تعریف شود؛ بدون نیاز به تغییر کد.
- backend: تنظیمات env.ts و هر دو StorageProvider (Local/S3) از قبل کاملاً مبتنی بر
  متغیر محیطی هستند و به هیچ دامنه یا سرویس خاصی وابسته نیستند.

## 3) آماده‌سازی برای آپگرید Supabase و Render
- S3StorageProvider از قبل به‌صورت صریح از Supabase Storage (S3-compatible API)،
  Cloudflare R2، DigitalOcean Spaces و MinIO پشتیبانی می‌کند. برای آپگرید پلن
  Supabase یا Render فقط کافیست متغیرهای محیطی زیر تنظیم/به‌روزرسانی شوند —
  نیازی به تغییر کد نیست:
  STORAGE_PROVIDER=s3, STORAGE_BUCKET, STORAGE_ENDPOINT,
  STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, PUBLIC_ASSET_BASE_URL, DATABASE_URL

## 4) پروفایل فروشگاهی شبیه اینستاگرام: فیلد «آدرس»
اضافه شد در تمام لایه‌ها:
- backend/prisma/schema.prisma + migration جدید (add_seller_address)
- backend/src/routes/sellers.ts (validation و ذخیره‌سازی در PUT /api/sellers/:id)
- backend/src/services/publishService.ts (شامل شدن در خروجی JSON عمومی)
- frontend-admin/src/types.ts + src/pages/seller/Profile.tsx (فرم ویرایش پروفایل)
- test-site/src/types/index.ts + src/pages/SellerStore.tsx (نمایش در صفحه فروشگاه،
  به‌صورت متن آزاد همراه با آیکون مکان)

## 5) پرمیوم / انیمیشن
- test-site/src/styles/global.css: کلاس‌های fade-in-up (با رعایت کامل
  prefers-reduced-motion که در پروژه از قبل تعریف شده بود)
- test-site/src/pages/SellerStore.tsx: انیمیشن ورود روی باکس اطلاعات فروشگاه و
  کارت‌های محصول (با تأخیر پلکانی برای حس پرمیوم‌تر)

## نکات مهم قبل از دیپلوی
1. باید مایگریشن جدید پریزما اجرا شود:
   cd backend && npx prisma migrate deploy
2. چون تایپ‌اسکریپت/npm در این محیط قابل اجرا نبود (بدون دسترسی شبکه)، پیشنهاد می‌شود
   قبل از push، به‌صورت محلی `npm run build` را در هر سه ریپازیتوری اجرا کنید تا از
   صحت کامپایل مطمئن شوید.
3. مقدار CORS_ORIGIN در بک‌اند باید بعد از مهاجرت دامنه به‌روزرسانی شود تا دامنه‌ی
   جدید frontend-admin و test-site را شامل شود.

## بررسی سرعت پایین و قطعی‌های ارتباط بک‌اند روی Render

### ۱) باگ بحرانی: مسیر import اشتباه پریزما (احتمالاً باعث fail شدن build می‌شد)
src/index.ts خط ۱۶ به‌جای "./config/prisma" از "./lib/prisma" ایمپورت می‌کرد — پوشه‌ای
که اصلاً در پروژه وجود ندارد. چون build با `tsc` خطی اجرا می‌شود (نه با ts-node/tsx در
پروداکشن)، این خطا باعث fail کامل مرحله‌ی build در Render می‌شد. بسته به این‌که این باگ
از کِی وجود داشته، این می‌تونه توضیح بده چرا دیپلوی‌های جدید اصلاً اعمال نمی‌شدن یا سرویس
اصلاً بالا نمی‌اومده. رفع شد.

### ۲) باگ بحرانی: اندپوینت /api/health بیش از حد سنگین و کند بود
این اندپوینت هم یک کوئری دیتابیس، هم یک هلث‌چک استوریج، و هم یک **درخواست شبکه‌ی واقعی
به API گیت‌هاب** رو به‌صورت پشت‌سرهم (نه موازی) انجام می‌داد، و تایم‌اوت درخواست گیت‌هاب
روی ۳۰ ثانیه تنظیم شده بود. اگه Render (طبق تنظیم رایج) همین مسیر رو به‌عنوان
Health Check Path استفاده کنه، هر کندی یا Rate limit موقت در API گیت‌هاب می‌تونه
باعث بشه Render تصور کنه کل سرویس از کار افتاده و instance رو ری‌استارت کنه — که
دقیقاً با «بعضی وقتا کلاً قطع میشه» هم‌خوانی داره.
رفع شد:
- سه چک به‌صورت موازی (Promise.all) اجرا می‌شن، نه پشت‌سرهم.
- تایم‌اوت اختصاصیِ چک گیت‌هاب در این اندپوینت از ۳۰ ثانیه به ۴ ثانیه کاهش پیدا کرد.
- یک مسیر جدید و کاملاً سبک اضافه شد: GET /api/health/live — بدون هیچ کوئری دیتابیس
  یا تماس شبکه‌ای، فقط تأیید می‌کنه که پروسه‌ی Node بالا و در حال پاسخ‌گوییه.

**اقدام لازم از سمت شما:** در تنظیمات سرویس بک‌اند در داشبورد Render، بخش
Health Check Path رو به /api/health/live تغییر بدید (نه /api/health). اندپوینت
/api/health همچنان برای صفحه‌ی System Health پنل ادمین در دسترسه.

### ۳) اتصال دیتابیس (Supabase) — راهنمای اضافه شد
اگه DATABASE_URL از connection string مستقیم Supabase (پورت ۵۴۳۲) استفاده می‌کنه،
به‌خصوص روی پلن رایگان که تعداد اتصال مستقیم مجاز خیلی محدوده، این می‌تونه باعث خطای
متناوب «Can't reach database server» بشه. توضیح و مثال connection pooler (پورت ۶۵۴۳
با pgbouncer=true) به .env.example اضافه شد. لطفاً DATABASE_URL فعلی روی Render رو
بررسی/آپدیت کنید.

### ۴) محتمل‌ترین دلیل «بعضی وقتا کند / قطع»: خوابیدن سرویس‌های رایگان Render
اگه پلن سرویس بک‌اند روی Render از نوع Free هست، Render بعد از ۱۵ دقیقه بدون ترافیک
سرویس رو کاملاً می‌خوابونه و اولین درخواست بعدی باید instance رو از صفر بالا بیاره
(معمولاً ۳۰ تا ۶۰+ ثانیه) — این دقیقاً همون حسیه که کاربر «قطعِ کامل» یا «خیلی کند»
توصیف می‌کنه. این یک محدودیت پلن رایگانه، نه باگ کد؛ تنها راه‌حل واقعی آپگرید پلن
(Starter به بالا) یا نگه‌داشتن سرویس بیدار با یک پینگ دوره‌ای (که خودش هزینه‌ی
مصرف رایگان رو هم می‌سوزونه، پس فقط به‌عنوان راه‌حل موقت توصیه میشه).

## به‌روزرسانی: رفع خطای بیلد Render (npx prisma generate)
خطای "No command registered for `generate`" به این دلیل بود که پکیج CLI پریزما
("prisma"، نه "@prisma/client") اصلاً در devDependencies پروژه ثبت نشده بود.
یعنی npx prisma هیچ نسخه‌ی محلی/پین‌شده‌ای برای اجرا نداشت و به یک نسخه‌ی
نامشخص/ناسازگار برمی‌خورد. رفع شد: "prisma": "5.22.0" (هم‌نسخه با @prisma/client)
به devDependencies اضافه شد.

## به‌روزرسانی: رفع خطاهای واقعی TypeScript که بعد از فیکس prisma آشکار شدن
بعد از رفع مشکل prisma CLI، بیلد یک قدم جلوتر رفت و به مرحله‌ی `tsc` رسید — که چند
باگ واقعی و از قبل موجود در کد رو آشکار کرد (نه چیزی که من اضافه کرده باشم):

1. **`src/routes/admin.ts` اصلاً وجود نداشت.** `index.ts` سعی می‌کرد `adminRouter` رو از
   این مسیر ایمپورت کنه، ولی فایل واقعی `src/routes/adminSettings.ts` بود که
   `adminSettingsRouter` رو export می‌کرد. یعنی **کل مسیر `/api/admin`
   (برندینگ، وضعیت GitHub، لاگ‌های audit) هیچ‌وقت واقعاً mount نشده بود.** رفع شد.
2. `src/routes/auth.ts` به‌جای named export (`export const authRouter`) از
   `export default router` استفاده می‌کرد، در حالی که `index.ts` انتظار named import
   داشت. برای هماهنگی با بقیه‌ی روت‌های پروژه به named export تبدیل شد.
3. چند import/متغیر استفاده‌نشده (`env` در auth.ts، `isPrismaErrorCode` در
   subscriptions.ts، `createHash` و `assertSafeSegment`) که به‌خاطر تنظیمات سخت‌گیرانه‌ی
   TypeScript (`noUnusedLocals`) باعث fail شدن build می‌شدن، حذف شدن.
4. نبود type declaration برای پکیج `unzipper` → `@types/unzipper` اضافه شد.
5. **باگ واقعی منطقی:** تابع `isSubscriptionCurrentlyActive` (در sellers.ts و
   productService.ts) فرض می‌کرد `startDate`/`endDate` هیچ‌وقت null نیستن، در حالی
   که این دو فیلد در دیتابیس واقعاً nullable هستن (یک اشتراک PENDING هنوز تاریخ
   شروع/پایان نداره). این می‌تونست باعث خطای runtime بشه، نه فقط خطای کامپایل.
   اصلاح شد تا صریحاً null رو به‌عنوان «غیرفعال» در نظر بگیره.
6. تایپ `inputUnit` محصول (که در دیتابیس فقط یک `String?` ساده است) با یونیون
   دقیق‌تر `"MM" | "CM" | "M" | null` که در منطق ابعاد محصول انتظار می‌رفت مطابقت
   نداشت؛ یک تابع کمکی اعتبارسنجی (`toDimensionUnit`) اضافه شد.
7. `env.PUBLIC_ASSET_BASE_URL` در حالت local storage می‌تونه undefined باشه (فقط در
   production الزامیه)؛ یک مقدار پیش‌فرض منطقی (`http://localhost:PORT/files`)
   برای همین حالت اضافه شد.
