import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GENERIC_PUBLIC_FAILURE_MESSAGE,
  INVALID_CUSTOMER_SESSION_CODE,
  INVALID_CUSTOMER_SESSION_MESSAGE,
  UNAVAILABLE_CART_MESSAGE,
  presentPublicClientError,
} from './publicClientError'

test('deleted customer session becomes a login message without the foreign key', () => {
  const presented = presentPublicClientError(
    {
      code: 'P2003',
      meta: { constraint: 'Order_customerId_fkey' },
      message:
        'Invalid `prisma.order.create()` invocation:\n\nForeign key constraint violated: `Order_customerId_fkey (index)`',
    },
    { status: 500, message: 'Foreign key constraint violated: `Order_customerId_fkey (index)`' },
  )
  assert.equal(presented.status, 401)
  assert.equal(presented.body.success, false)
  assert.equal(presented.body.message, INVALID_CUSTOMER_SESSION_MESSAGE)
  assert.equal(presented.body.code, INVALID_CUSTOMER_SESSION_CODE)
  assert.equal(presented.body.message.includes('fkey'), false)
  assert.equal(presented.body.message.includes('prisma'), false)
})

test('other database failures stay failures and hide the engine text', () => {
  const presented = presentPublicClientError(new Error('Invalid `prisma.order.create()` invocation'), {
    status: 500,
    fallback: 'Sipariş oluşturulamadı',
  })
  assert.equal(presented.status, 500)
  assert.equal(presented.body.success, false)
  assert.equal(presented.body.message, 'Sipariş oluşturulamadı')
  assert.equal(JSON.stringify(presented.body).includes('prisma'), false)
})

test('a missing product tells the customer to refresh the cart', () => {
  const presented = presentPublicClientError(
    { code: 'P2003', meta: { constraint: 'OrderItem_productId_fkey' } },
    { status: 500, message: 'Foreign key constraint violated: OrderItem_productId_fkey' },
  )
  assert.equal(presented.status, 400)
  assert.equal(presented.body.message, UNAVAILABLE_CART_MESSAGE)
})

test('existing customer-facing validation text is preserved', () => {
  const presented = presentPublicClientError(new Error('Bu e-posta adresi zaten kayıtlı'), {
    status: 409,
    message: 'Bu e-posta adresi zaten kayıtlı',
  })
  assert.equal(presented.status, 409)
  assert.equal(presented.body.message, 'Bu e-posta adresi zaten kayıtlı')
  assert.equal(presented.body.code, undefined)
})

test('an empty engine failure uses the generic Turkish sentence', () => {
  const presented = presentPublicClientError({ code: 'P2022', meta: { constraint: 'sqlstate' } }, { status: 500 })
  assert.equal(presented.body.message, GENERIC_PUBLIC_FAILURE_MESSAGE)
  assert.notEqual(presented.status, 200)
})
