-- KoopPlus SaaS renewal license key captured at checkout (optional).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "koopplusLicenseKey" VARCHAR(64);
