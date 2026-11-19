import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.middleware'
import { readKoopPlusPricingSettings, saveKoopPlusPricingSettings } from '../services/koopplusPricing.service'
import { resolveKoopPlusFirstPrice } from '../controllers/koopplus.public.controller'

/** KoopPlus fiyat ayarı: ilk kooperatif fiyatı ürün fiyatıdır; ek kooperatif fiyatı burada tutulur. */
const r = Router()
r.use('/koopplus', authMiddleware, adminOnly)

r.get('/koopplus/pricing', async (_req, res) => {
  try {
    const [settings, first] = await Promise.all([readKoopPlusPricingSettings(), resolveKoopPlusFirstPrice()])
    res.json({ success: true, data: { ...settings, firstPrice: first?.price ?? null } })
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Hata' })
  }
})

r.put('/koopplus/pricing', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    res.json({ success: true, data: await saveKoopPlusPricingSettings(body) })
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500
    res.status(status).json({ success: false, error: e instanceof Error ? e.message : 'Hata' })
  }
})

export const koopplusAdminRoutes = r
