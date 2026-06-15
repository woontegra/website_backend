-- Woontegra Havale/EFT banka bilgileri (checkout’ta yayınlanır)
INSERT INTO "BankTransferSettings" (
  "id",
  "isPublished",
  "bankName",
  "branchName",
  "accountHolder",
  "iban",
  "currency",
  "referenceNote",
  "createdAt",
  "updatedAt"
)
VALUES (
  'default',
  true,
  'Türkiye İş Bankası A.Ş.',
  '',
  'Woontegra Teknoloji Yazılım ve Dijital Hizmetler Ltd. Şti.',
  'TR900006400000136600487451',
  'TRY',
  'Havale/EFT açıklamasına sipariş numaranızı yazmanız teyidi hızlandırır. Dekontu info@woontegra.com adresine iletebilirsiniz.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "isPublished" = true,
  "bankName" = EXCLUDED."bankName",
  "branchName" = EXCLUDED."branchName",
  "accountHolder" = EXCLUDED."accountHolder",
  "iban" = EXCLUDED."iban",
  "currency" = EXCLUDED."currency",
  "referenceNote" = EXCLUDED."referenceNote",
  "updatedAt" = CURRENT_TIMESTAMP;
