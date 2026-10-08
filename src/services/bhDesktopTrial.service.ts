import { bhUpstreamFetch, readBhAdminProductRow } from './bhWebapi.client'
import { mailService } from './mail.service'
import { selectBhDesktopInstallerUrl } from '../lib/bhDesktopTrialDownload'
import {
  BH_DESKTOP_DEMO_APPLICATION_MESSAGE,
  desktopDemoApplicationAction,
} from '../lib/bhDesktopDemoApplication'
import { normalizeDesktopEntitlementPlatform, type DesktopEntitlementPlatform } from '../lib/desktopEntitlementPlatform'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function localDesktopTrialTargetError(env: NodeJS.ProcessEnv = process.env): string | null {
  if (String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production') return null
  const url = String(env.LICENSE_SERVER_URL ?? '')
  if (/localhost|127\.0\.0\.1/i.test(url)) return null
  return 'Yerel deneme production lisans sunucusuna gönderilmez.'
}

export type BhDesktopTrialStartResult = {
  ok: true
  status: number
  body: {
    success: true
    platform: DesktopEntitlementPlatform
    platformLabel: string
    trialDays: number
    resumed: boolean
    downloadReady: boolean
    downloadPath: string | null
    downloadUrl: string
    message: string
  }
}

export type BhDesktopTrialStartFailure = {
  ok: false
  status: number
  body: {
    success: false
    code: string
    message: string
  }
}

function platformLabel(platform: DesktopEntitlementPlatform): string {
  return platform === 'WINDOWS' ? 'Windows' : 'macOS'
}

const PROFILE_SAVE_FAILED_MESSAGE =
  'Başvuru kaydı yazılamadı. Deneme süresi başlatılmadı. Aynı bilgileri tekrar gönderebilirsiniz.'

export type DesktopDemoProfile = {
  name: string
  phone: string
  email: string
  company?: string
  professionGroup: string
  isExpertWitness: boolean
  expertiseAreas: Array<{ code: string; name: string }>
}

function phoneCanonical(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length >= 12) return digits.slice(-10)
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1)
  return digits
}

export function readDesktopDemoProfile(body: Record<string, unknown>): { ok: true; profile: DesktopDemoProfile } | { ok: false; message: string } {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    return { ok: false, message: 'Geçerli bir e-posta adresi girin.' }
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return { ok: false, message: 'Ad soyad zorunludur.' }
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (phoneCanonical(phone).length < 10) {
    return { ok: false, message: 'Geçerli bir cep telefonu giriniz (en az 10 hane).' }
  }
  const professionGroup = typeof body.professionGroup === 'string' ? body.professionGroup.trim() : ''
  if (!professionGroup) return { ok: false, message: 'Meslek grubunuzu seçiniz.' }
  if (typeof body.isExpertWitness !== 'boolean') {
    return { ok: false, message: 'Bilirkişi olup olmadığınızı seçiniz.' }
  }
  const expertiseAreas = Array.isArray(body.expertiseAreas)
    ? body.expertiseAreas.filter(
        (area): area is { code: string; name: string } =>
          Boolean(area) &&
          typeof area === 'object' &&
          typeof (area as { code?: unknown }).code === 'string' &&
          typeof (area as { name?: unknown }).name === 'string',
      )
    : []
  if (body.isExpertWitness && expertiseAreas.length < 1) {
    return { ok: false, message: 'En az bir uzmanlık alanı seçiniz.' }
  }
  const company = typeof body.company === 'string' ? body.company.trim() : ''
  return {
    ok: true,
    profile: {
      name,
      phone,
      email,
      company: company || undefined,
      professionGroup,
      isExpertWitness: body.isExpertWitness,
      expertiseAreas: body.isExpertWitness ? expertiseAreas : [],
    },
  }
}

async function desktopDemoProfile(input: DesktopDemoProfile & { platform: 'WINDOWS' | 'MACOS'; record: boolean }) {
  const result = await bhUpstreamFetch('POST', '/api/demo/desktop-request', input, { timeoutMs: 20_000 })
  const data = result.ok ? (result.data as Record<string, unknown>) : ((result.data || {}) as Record<string, unknown>)
  const code = typeof data.code === 'string' ? data.code : ''
  return {
    ok: result.ok && data.success === true && data.alreadyUsed !== true,
    status: result.status,
    alreadyUsed: data.alreadyUsed === true || code === 'TRIAL_ALREADY_USED',
    alreadyRecorded: data.alreadyRecorded === true,
    message: typeof data.message === 'string' ? data.message : result.ok ? '' : result.error,
  }
}

function profileWasStored(saved: { ok: boolean; alreadyUsed: boolean; alreadyRecorded: boolean }): boolean {
  return saved.ok || saved.alreadyRecorded || saved.alreadyUsed
}

async function persistDesktopDemoProfile(input: DesktopDemoProfile & { platform: 'WINDOWS' | 'MACOS' }) {
  let last = {
    ok: false,
    status: 502,
    alreadyUsed: false,
    alreadyRecorded: false,
    message: 'Demo profili kaydedilemedi.',
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await desktopDemoProfile({ ...input, record: true })
    if (profileWasStored(last)) return last
    if (last.status === 400) return last
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
  }
  console.error('[desktop-trial] profile save failed', last.message)
  return last
}

function profileSaveFailure(): BhDesktopTrialStartFailure {
  return {
    ok: false,
    status: 503,
    body: { success: false, code: 'DEMO_PROFILE_SAVE_FAILED', message: PROFILE_SAVE_FAILED_MESSAGE },
  }
}

export async function startBhDesktopTrial(input: {
  platformRaw: unknown
  profileRaw: Record<string, unknown>
}): Promise<BhDesktopTrialStartResult | BhDesktopTrialStartFailure> {
  const platform = normalizeDesktopEntitlementPlatform(input.platformRaw)
  if (!platform) {
    return {
      ok: false,
      status: 400,
      body: { success: false, code: 'INVALID_PLATFORM', message: 'Platform WINDOWS veya MACOS olmalıdır.' },
    }
  }
  const profile = readDesktopDemoProfile({ ...input.profileRaw, platform })
  if (!profile.ok) {
    return { ok: false, status: 400, body: { success: false, code: 'INVALID_PROFILE', message: profile.message } }
  }

  const prior = await desktopDemoProfile({ ...profile.profile, platform, record: false })
  const application = desktopDemoApplicationAction(prior)
  if (application === 'profile-unavailable') {
    return {
      ok: false,
      status: prior.status || 502,
      body: { success: false, code: 'DEMO_PROFILE_UNAVAILABLE', message: prior.message || 'Demo talebi doğrulanamadı.' },
    }
  }

  const product = await readBhAdminProductRow()
  if (!product) {
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        code: 'PRODUCT_UNAVAILABLE',
        message: 'Deneme yapılandırması şu an okunamadı. Lütfen kısa süre sonra tekrar deneyin.',
      },
    }
  }

  const localProduct = await bhUpstreamFetch('GET', '/api/product')
  const localRow =
    localProduct.ok && localProduct.data && typeof localProduct.data === 'object'
      ? (((localProduct.data as { data?: unknown }).data as Record<string, unknown> | null) ?? null)
      : null
  const downloadUrl =
    selectBhDesktopInstallerUrl(localRow, platform) || selectBhDesktopInstallerUrl(product, platform)

  if (!downloadUrl) {
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        code: 'INSTALLER_URL_MISSING',
        message: 'Kurulum bağlantısı olmadığı için e-posta gönderilemedi.',
      },
    }
  }

  if (application === 'save-application') {
    const saved = await persistDesktopDemoProfile({ ...profile.profile, platform })
    if (!profileWasStored(saved)) return profileSaveFailure()
  }

  try {
    await mailService.sendBilirkisiDesktopInstallerMail({
      customerName: profile.profile.name,
      customerEmail: profile.profile.email,
      platformLabel: platformLabel(platform),
      downloadUrl,
    })
  } catch (error) {
    console.error('[desktop-trial] mail send failed', error instanceof Error ? error.message : error)
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        code: 'EMAIL_SEND_FAILED',
        message: 'Kurulum bağlantısı e-postası gönderilemedi. Deneme süresi başlatılmadı.',
      },
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      platform,
      platformLabel: platformLabel(platform),
      trialDays: 7,
      resumed: false,
      downloadReady: true,
      downloadPath: null,
      downloadUrl,
      message: BH_DESKTOP_DEMO_APPLICATION_MESSAGE,
    },
  }
}
