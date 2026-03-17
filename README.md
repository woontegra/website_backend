# Woontegra Backend API

Node.js + Express + TypeScript + **Prisma + PostgreSQL (Railway)**.

## Railway ile PostgreSQL

1. **Railway**’de yeni proje oluşturun.
2. **Add plugin → PostgreSQL** ekleyin (veritabanı servisi).
3. **Backend API** için yeni servis ekleyin (GitHub repo veya boş servis):
   - **Root Directory:** `backend` (monorepo ise)
   - **Variables:**
     - `DATABASE_URL` → **Add Reference** → PostgreSQL servisinizi seçin → `DATABASE_URL` (Railway iç ağ URL’si otomatik gelir; SSL gerekmez).
     - `JWT_SECRET` — güçlü rastgele string.
     - `CORS_ORIGIN` — frontend URL’niz (`https://xxx.up.railway.app` veya özel domain).
4. **Build command:** `npm install && npm run build`
5. Deploy sonrası tablolar `startCommand` ile `prisma db push` ile oluşur (`railway.toml`).
6. **İlk veri (admin + CMS seed):** Railway → servis → **Shell**:
   ```bash
   npx tsx prisma/seed.ts
   ```
   Admin: `admin@woontegra.com` / `Admin123!` — hemen değiştirin.

### Yerel geliştirme (Railway Postgres’e bağlanmak)

Railway Postgres → **Connect** → **Public Network** → Connection URL kopyalayın.  
`.env` içinde `DATABASE_URL=...` yapıştırın. Bağlanmazsa URL sonuna `?sslmode=require` ekleyin.

### Önemli

- Üretimde `JWT_SECRET` ve `CORS_ORIGIN` mutlaka doldurulmalı.
- Frontend’de `VITE_API_URL` backend’in public URL’si olmalı.

## Kurulum (yerel)

```bash
cd backend
npm install
cp .env.example .env
# .env: DATABASE_URL (Railway public URL veya local Postgres), JWT_SECRET, CORS_ORIGIN
npx prisma db push
npx tsx prisma/seed.ts
```

## Çalıştırma

```bash
npm run dev   # Geliştirme
npm run build && npm start   # Production
```

API varsayılan: `http://localhost:4000`

## API özeti

- `GET /api/health`
- `GET /api/pages/:slug` — CMS sayfa (public)
- `GET /api/admin/cms/*` — CMS yönetimi (admin JWT)
- `POST /api/auth/login` — Giriş (DB’deki admin dahil)
- Diğer: contacts, quotes, blog, vb.

## Güvenlik

Helmet, CORS, rate limit, JWT, admin route’ları `adminOnly`.
