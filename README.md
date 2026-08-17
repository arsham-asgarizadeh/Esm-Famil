# اسم‌فامیل آنلاین

بازی فارسی RTL با React، Fastify، Socket.IO، PostgreSQL، Prisma و TypeScript.

## پیش‌نیازها و نصب

Node.js 18+، pnpm 9 و Docker لازم‌اند.

```bash
cp .env.example .env
pnpm install
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

وب در `http://localhost:5173`، API در `http://localhost:3001` و مدیریت در `/admin` است. ایمیل و رمز Admin را پیش از seed در `.env` تنظیم کنید. در خانه نام میزبان را وارد کنید، اتاق بسازید و لینک دعوت را برای دوستان بفرستید.

## بررسی کیفیت

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
pnpm db:coverage
```

اجرای production با `docker compose up --build` ممکن است. migration توسعه با `pnpm db:migrate` و migration production با `pnpm exec prisma migrate deploy` اجرا می‌شود.

## محدودیت‌های فعلی

state زنده اتاق تک‌instance و در حافظه است؛ برای scale افقی باید Redis adapter اضافه شود. seed آغازین کنترل‌شده است و پوشش همه ترکیب‌های حرف/موضوع را ندارد، پس انتخاب حرف production باید بعد از توسعه dataset با گزارش coverage انجام شود. فونت وب در حالت آفلاین به system font برمی‌گردد.
