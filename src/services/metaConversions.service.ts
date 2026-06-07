import crypto from 'crypto'
import type { Request } from 'express'
import { settingsService } from './settings.service'

const META_API_VERSION = 'v21.0'

type MetaEventName = 'PageView' | 'Lead' | 'Contact' | 'Download' | 'CompleteRegistration'

interface SendEventOptions {
  eventSourceUrl?: string
  clientIpAddress?: string
  clientUserAgent?: string
  customData?: Record<string, unknown>
}

function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

export const metaConversionsService = {
  async sendEvent(eventName: MetaEventName, options: SendEventOptions = {}) {
    const settings = await settingsService.getAll()

    if (!settings.metaConversionsApiEnabled) {
      return { skipped: true, reason: 'disabled' as const }
    }

    const pixelId = settings.metaPixelId || settings.facebookPixelId
    const accessToken = settings.metaConversionsAccessToken

    if (!pixelId || !accessToken) {
      return { skipped: true, reason: 'missing_credentials' as const }
    }

    const eventId = crypto.randomUUID()
    const userData: Record<string, string> = {}

    if (options.clientIpAddress) {
      userData.client_ip_address = options.clientIpAddress
    }
    if (options.clientUserAgent) {
      userData.client_user_agent = options.clientUserAgent
    }

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: options.eventSourceUrl,
          user_data: userData,
          custom_data: options.customData,
        },
      ],
    }

    if (settings.metaTestEventCode) {
      payload.test_event_code = settings.metaTestEventCode
    }

    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response.text()
        console.error('[Meta CAPI] Event failed:', eventName, body)
        return { success: false, reason: 'api_error' as const }
      }

      return { success: true }
    } catch (error) {
      console.error('[Meta CAPI] Request error:', eventName, error)
      return { success: false, reason: 'network_error' as const }
    }
  },

  async sendDownloadEvent(req: Request, variant: 'setup' | 'portable') {
    const forwarded = req.headers['x-forwarded-for']
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
      req.ip ||
      req.socket.remoteAddress

    return this.sendEvent('Download', {
      eventSourceUrl:
        req.get('referer') || 'https://woontegra.com/ucretsiz-araclar/sifre-kasasi',
      clientIpAddress: clientIp,
      clientUserAgent: req.get('user-agent') || undefined,
      customData: {
        content_name: 'Woontegra Şifre Kasası',
        content_category: variant,
      },
    })
  },

  hashSha256,
}
