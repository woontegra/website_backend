import { LicenseLifecycleStatus, LicenseSource, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { generateActivationPassword, hashActivationPassword } from '../lib/activationPassword'
import { generateLicenseKey } from '../lib/licenseKey'
import { PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP, productCodeLabel } from '../lib/productCode'
import {
  adminExtendLicense,
  adminRegenerateActivationPassword,
  adminResetLicenseActivations,
  adminSetLicenseMaxDevices,
  adminSetLicenseStatus,
  resolveLicenseDownloadUrl,
} from './license.service'
import { mailService } from './mail.service'

export type AdminLicenseRow = {
  id: string
  licenseKey: string
  customerName: string | null
  customerEmail: string
  customerPhone: string | null
  productName: string
  productCode: string | null
  source: LicenseSource
  orderId: string | null
  orderNo: string | null
  status: LicenseLifecycleStatus
  maxDevices: number
  startsAt: string | null
  expiresAt: string | null
  notes: string | null
  activatedDevicesCount: number
  createdAt: string
  updatedAt: string
}

export type AdminLicenseDetail = AdminLicenseRow & {
  activations: {
    id: string
    deviceHash: string
    deviceName: string | null
    platform: string | null
    appVersion: string | null
    firstActivatedAt: string
    lastValidatedAt: string | null
    status: string
  }[]
}

function toAdminRow(
  lic: {
    id: string
    licenseKey: string
    customerName: string | null
    customerEmail: string
    customerPhone: string | null
    productName: string
    productCode: string | null
    source: LicenseSource
    orderId: string | null
    orderNo: string | null
    status: LicenseLifecycleStatus
    maxDevices: number
    startsAt: Date | null
    expiresAt: Date | null
    notes: string | null
    createdAt: Date
    updatedAt: Date
    activations?: { status: string }[]
  },
  activatedCount?: number,
): AdminLicenseRow {
  const count =
    activatedCount ??
    lic.activations?.filter((a) => a.status === 'ACTIVE').length ??
    0
  return {
    id: lic.id,
    licenseKey: lic.licenseKey,
    customerName: lic.customerName,
    customerEmail: lic.customerEmail,
    customerPhone: lic.customerPhone,
    productName: lic.productName,
    productCode: lic.productCode,
    source: lic.source,
    orderId: lic.orderId,
    orderNo: lic.orderNo,
    status: lic.status,
    maxDevices: lic.maxDevices,
    startsAt: lic.startsAt?.toISOString() ?? null,
    expiresAt: lic.expiresAt?.toISOString() ?? null,
    notes: lic.notes,
    activatedDevicesCount: count,
    createdAt: lic.createdAt.toISOString(),
    updatedAt: lic.updatedAt.toISOString(),
  }
}

async function uniqueLicenseKey(): Promise<string> {
  let key = generateLicenseKey()
  for (let attempt = 0; attempt < 25; attempt++) {
    const clash = await prisma.license.findUnique({ where: { licenseKey: key } })
    if (!clash) return key
    key = generateLicenseKey()
  }
  return key
}

export const licensesAdminService = {
  async list(input: {
    source?: LicenseSource
    status?: LicenseLifecycleStatus
    email?: string
    productCode?: string
    q?: string
  }): Promise<AdminLicenseRow[]> {
    const where: Prisma.LicenseWhereInput = {}
    if (input.source) where.source = input.source
    if (input.status) where.status = input.status
    if (input.productCode?.trim()) where.productCode = input.productCode.trim()
    if (input.email?.trim()) {
      where.customerEmail = { contains: input.email.trim(), mode: 'insensitive' }
    }
    if (input.q?.trim()) {
      const q = input.q.trim()
      where.OR = [
        { licenseKey: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
        { orderNo: { contains: q, mode: 'insensitive' } },
      ]
    }

    const rows = await prisma.license.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        activations: { where: { status: 'ACTIVE' }, select: { status: true } },
      },
    })
    return rows.map((r) => toAdminRow(r))
  },

  async getById(id: string): Promise<AdminLicenseDetail | null> {
    const lic = await prisma.license.findUnique({
      where: { id },
      include: {
        activations: { orderBy: { firstActivatedAt: 'desc' } },
      },
    })
    if (!lic) return null
    return {
      ...toAdminRow(lic, lic.activations.filter((a) => a.status === 'ACTIVE').length),
      activations: lic.activations.map((a) => ({
        id: a.id,
        deviceHash: a.deviceHash,
        deviceName: a.deviceName,
        platform: a.platform,
        appVersion: a.appVersion,
        firstActivatedAt: a.firstActivatedAt.toISOString(),
        lastValidatedAt: a.lastValidatedAt?.toISOString() ?? null,
        status: a.status,
      })),
    }
  },

  async create(input: {
    customerName: string
    customerEmail: string
    customerPhone?: string | null
    productCode: string
    startsAt: Date
    expiresAt: Date
    maxDevices?: number
    notes?: string | null
    sendEmail?: boolean
  }): Promise<{ license: AdminLicenseDetail; activationPassword: string }> {
    const productCode = input.productCode.trim() || PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP
    const activationPassword = generateActivationPassword()
    const activationPasswordHash = await hashActivationPassword(activationPassword)
    const licenseKey = await uniqueLicenseKey()
    const productName = productCodeLabel(productCode)

    let productId: string | null = null
    if (productCode === PRODUCT_CODE_MUVEKKIL_KASA_DESKTOP) {
      const p = await prisma.product.findFirst({ where: { slug: 'muvekkil-kasa-defteri-desktop' } })
      productId = p?.id ?? null
    }

    const lic = await prisma.license.create({
      data: {
        licenseKey,
        activationPasswordHash,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail.trim().toLowerCase(),
        customerPhone: input.customerPhone?.trim() || null,
        productId,
        productName,
        productCode,
        source: LicenseSource.MANUAL,
        status: LicenseLifecycleStatus.ACTIVE,
        maxDevices: Math.max(1, Math.min(50, input.maxDevices ?? 1)),
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        notes: input.notes?.trim() || null,
      },
      include: { activations: true },
    })

    if (input.sendEmail) {
      const downloadUrl = await resolveLicenseDownloadUrl(lic)
      await mailService.sendDesktopLicenseMail({
        customerName: lic.customerName ?? lic.customerEmail,
        customerEmail: lic.customerEmail,
        productName: lic.productName,
        downloadUrl,
        licenseKey: lic.licenseKey,
        activationPassword,
        orderNo: null,
      })
    }

    const detail = await this.getById(lic.id)
    if (!detail) throw new Error('Lisans oluşturuldu ancak okunamadı')
    return { license: detail, activationPassword }
  },

  async patch(
    id: string,
    input: {
      status?: LicenseLifecycleStatus
      maxDevices?: number
      expiresAt?: Date
      notes?: string | null
      customerName?: string
      customerPhone?: string | null
    },
  ): Promise<AdminLicenseDetail | null> {
    const lic = await prisma.license.findUnique({ where: { id } })
    if (!lic) return null

    if (input.status) await adminSetLicenseStatus(id, input.status)
    if (input.maxDevices != null) await adminSetLicenseMaxDevices(id, input.maxDevices)
    if (input.expiresAt) await adminExtendLicense(id, input.expiresAt)

    const data: Prisma.LicenseUpdateInput = {}
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null
    if (input.customerName?.trim()) data.customerName = input.customerName.trim()
    if (input.customerPhone !== undefined) data.customerPhone = input.customerPhone?.trim() || null
    if (Object.keys(data).length > 0) {
      await prisma.license.update({ where: { id }, data })
    }

    return this.getById(id)
  },

  async extend(id: string, expiresAt: Date): Promise<AdminLicenseDetail | null> {
    const lic = await prisma.license.findUnique({ where: { id } })
    if (!lic) return null
    await adminExtendLicense(id, expiresAt)
    return this.getById(id)
  },

  async resetDevices(id: string): Promise<AdminLicenseDetail | null> {
    const lic = await prisma.license.findUnique({ where: { id } })
    if (!lic) return null
    await adminResetLicenseActivations(id)
    return this.getById(id)
  },

  async regeneratePassword(id: string, sendEmail: boolean): Promise<{
    license: AdminLicenseDetail
    activationPassword: string
  } | null> {
    const lic = await prisma.license.findUnique({ where: { id } })
    if (!lic) return null
    const { activationPassword } = await adminRegenerateActivationPassword(id)
    if (sendEmail) {
      await this.sendEmail(id, activationPassword)
    }
    const detail = await this.getById(id)
    if (!detail) return null
    return { license: detail, activationPassword }
  },

  async sendEmail(id: string, activationPasswordPlain?: string): Promise<void> {
    const lic = await prisma.license.findUnique({ where: { id } })
    if (!lic) {
      const err = new Error('Lisans bulunamadı') as Error & { status: number }
      err.status = 404
      throw err
    }
    const downloadUrl = await resolveLicenseDownloadUrl(lic)
    await mailService.sendDesktopLicenseMail({
      customerName: lic.customerName ?? lic.customerEmail,
      customerEmail: lic.customerEmail,
      productName: lic.productName,
      downloadUrl,
      licenseKey: lic.licenseKey,
      activationPassword: activationPasswordPlain,
      orderNo: lic.orderNo,
    })
  },
}
