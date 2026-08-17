# معماری

Monorepo شامل `web` (React/Vite)، `server` (Fastify/Socket.IO)، `shared` (قراردادهای Zod)، `persian-text` و `game-engine` است. سرور تنها مرجع زمان، state، داوری و امتیاز است. REST برای ایجاد/ورود/مدیریت و Socket.IO برای state و رخدادهای بازی استفاده می‌شود. Prisma به PostgreSQL متصل است.

چرخه state: `LOBBY → COUNTDOWN → PLAYING → STOP_CONFIRMATION → LOCKED → VALIDATING → VOTING → RESULTS → NEXT_ROUND → FINISHED`.
