# Woontegra Backend API

Node.js + Express + TypeScript + **Prisma + PostgreSQL (Railway)**.

## Railway ile PostgreSQL

### `DATABASE_URL` yok hatası (P1012)

Build veya start’ta **Environment variable not found: DATABASE_URL** alıyorsanız:

1. Railway’de **backend API servisinizi** açın (Postgres değil).
2. **Variables** sekmesi → **Add Variable** → **Add Reference**.
3. **PostgreSQL** servisinizi seçin → değişken olarak **`DATABASE_URL`** işaretleyin → kaydedin.
4. **Redeploy** edin.

> Referans yoksa: Postgres ile backend **aynı Railway projesinde** olmalı. `DATABASE_URL` sadece Postgres kutusunda duruyorsa API servisine **manuel kopyalamaz**; mutlaka Reference ekleyin.

Build aşamasında `DATABASE_URL` olmasa bile `prisma generate` artık placeholder ile çalışır; **çalışma anında** (`db push` + API) gerçek `DATABASE_URL` şarttır.

---

1. **Railway**’de yeni proje oluşturun.
2. **Add plugin → PostgreSQL** ekleyin (veritabanı servisi).
3. **Backend API** için yeni servis ekleyin (GitHub repo veya boş servis):
   - **Root Directory:** `backend` (monorepo ise)
   - **Variables:**
     - **`DATABASE_URL`** → **Add Reference** → PostgreSQL → `DATABASE_URL` (**zorunlu**).
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

**Önem:** `npm install` ve `npm run dev` komutlarını **mutlaka `backend` klasöründe** çalıştırın. Üst dizinde (`Users\...\node_modules`) Prisma 6/7 varsa ve `backend/node_modules` eksikse `adapter or accelerateUrl` hatası oluşur.

```bash
cd backend
npm install
npx prisma generate
cp .env.example .env
# .env: DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npx prisma db push
npx tsx prisma/seed.ts
```

PowerShell — temiz kurulum:

```powershell
cd backend
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
npx prisma generate
npm run dev
```

## Çalıştırma

```bash
npm run dev   # Geliştirme
npm run build && npm start   # Production
```

API varsayılan: `http://localhost:4000`

## Section Builder & medya

Sayfa içeriği `PageContent.content` içinde JSON olarak saklanır:

```json
{
  "sections": [
    {
      "id": "uuid",
      "type": "hero",
      "order": 0,
      "settings": {
        "backgroundColor": "#fff7ed",
        "gradient": "warm",
        "padding": "2rem 1rem",
        "margin": "",
        "textAlign": "center"
      },
      "content": { "title": "...", "subtitle": "...", "buttonText": "...", "buttonLink": "/", "image": "/uploads/..." }
    }
  ]
}
```

Eski kayıtlar yalnızca `props` kullanıyorsa API bunları `content` olarak okur.

Şema değişikliği sonrası: `npx prisma db push` (yeni `MediaAsset` tablosu).

- Görseller: `POST /api/admin/cms/media/upload` (multipart `file`), `GET /api/admin/cms/media`, `DELETE /api/admin/cms/media/:id`
- Statik dosyalar: `GET /uploads/*` → `backend/public/uploads/`

## API özeti

- `GET /api/health`
- `GET /api/pages/:slug` — CMS sayfa (public)
- `GET /api/admin/cms/*` — CMS yönetimi (admin JWT)
- `POST /api/auth/login` — Giriş (DB’deki admin dahil)
- Diğer: contacts, quotes, blog, vb.

## Güvenlik

Helmet, CORS, rate limit, JWT, admin route’ları `adminOnly`.
