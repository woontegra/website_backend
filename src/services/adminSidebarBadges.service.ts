import { CustomerSaasMembershipStatus, OrderStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'

export type AdminSidebarBadges = {
  ordersPending: number
  paymentsPending: number
  saasExpiringSoon: number
  unreadRequests: number
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Dashboard “Dikkat gerekenler” ile uyumlu sidebar rozet sayıları — tek kaynak. */
export async function getAdminSidebarBadges(): Promise<AdminSidebarBadges> {
  const todayStart = startOfToday()
  const expiringEnd = addDays(todayStart, 7)

  const [ordersPending, paymentsPending, saasExpiringSoon, unreadRequests] = await Promise.all([
    prisma.order.count({
      where: { status: OrderStatus.PENDING },
    }),
    prisma.order.count({
      where: {
        OR: [{ status: OrderStatus.PENDING }, { status: OrderStatus.FAILED }],
      },
    }),
    prisma.customerSaasMembership.count({
      where: {
        status: CustomerSaasMembershipStatus.ACTIVE,
        licenseEndDate: {
          gte: todayStart,
          lte: expiringEnd,
        },
      },
    }),
    prisma.contactMessage.count({
      where: { read: false },
    }),
  ])

  return {
    ordersPending,
    paymentsPending,
    saasExpiringSoon,
    unreadRequests,
  }
}
