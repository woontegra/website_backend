import { Request, Response } from 'express'
import { muvekkilKasaSaasDemoService } from '../services/muvekkilKasaSaasDemo.service'

function readString(body: Record<string, unknown>, key: string): string {
  const v = body[key]
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

export async function createMuvekkilKasaDemoRequest(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    const data = await muvekkilKasaSaasDemoService.createDemoRequest({
      fullName: readString(body, 'fullName'),
      phone: readString(body, 'phone'),
      email: readString(body, 'email'),
      barAssociation: readString(body, 'barAssociation'),
      note: readString(body, 'note') || null,
    })
    return res.status(201).json({
      success: true,
      data: {
        membershipId: data.membershipId,
        demoRef: data.demoRef,
        loginUrl: data.loginUrl,
        licenseEndDate: data.licenseEndDate,
      },
    })
  } catch (e) {
    const err = e as Error & { status?: number; publicMessage?: string; code?: string }
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500
    return res.status(status).json({
      success: false,
      message: err.publicMessage || err.message || 'Demo talebi işlenemedi',
      code: err.code ?? undefined,
    })
  }
}
