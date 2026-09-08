/**
 * Order.checkoutIdempotencyKey — checkout çift istek / timeout yeniden deneme güvenliği.
 *
 * GÜVENLİK DENETİMİ (production uygulanmadan önce — ajan çalıştırmaz):
 * - Mevcut Order satırlarında UPDATE / DELETE / TRUNCATE yok.
 * - Yeni kolon NULLABLE; backfill yok.
 * - UNIQUE indeks: PostgreSQL'de birden fazla NULL'a izin verir (eski siparişler etkilenmez).
 * - Yalnız ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
 */

-- Bu migration ajan tarafından çalıştırılmaz; manuel uygulayın.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "checkoutIdempotencyKey" VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_checkoutIdempotencyKey_key"
  ON "Order" ("checkoutIdempotencyKey");
