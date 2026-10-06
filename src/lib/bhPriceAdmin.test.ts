import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldWaiveMissingCoverOnUpdate } from './publishImageValidation'
import { publishedProductGalleryUrls } from './publishedProductGallery'
import { applyBhDesktopYearlyOffer } from './bhDesktopYearlyOffer'
import { mergeListedPriceOverride, tlInputToKurus } from '../services/bhListedPriceOverride.service'

describe('bilirkişi admin fiyat ve görsel', () => {
  it('yıllık ve aylık TL tutarını mevcut kuruş alanlarına çevirir', () => {
    assert.equal(tlInputToKurus('20000'), 2_000_000)
    assert.equal(tlInputToKurus('2000'), 200_000)
    assert.equal(tlInputToKurus(''), null)
  })

  it('masaüstü yıllık fiyat SaaS 20.000 / 2.000 alanlarından gelmez', () => {
    const merged = applyBhDesktopYearlyOffer({
      success: true,
      data: {
        name: 'Bilirkişi Hesaplama Yazılımı',
        price: 2_000_000,
        priceMonthly: 200_000,
      },
    }) as {
      data: {
        price: number
        priceMonthly: number
        windowsPriceYearly: number
        macosPriceYearly: number
        windowsLicenseDays: number
        macosDeviceLimit: number
      }
    }
    assert.equal(merged.data.price, 2_000_000)
    assert.equal(merged.data.priceMonthly, 200_000)
    assert.equal(merged.data.windowsPriceYearly, 1_500_000)
    assert.equal(merged.data.macosPriceYearly, 1_500_000)
    assert.equal(merged.data.windowsLicenseDays, 365)
    assert.equal(merged.data.macosDeviceLimit, 1)
    assert.equal('windowsPriceMonthly' in merged.data, false)
  })

  it('override yalnız price ve priceMonthly alanlarını değiştirir', () => {
    const merged = mergeListedPriceOverride(
      {
        success: true,
        data: {
          name: 'Bilirkişi Hesaplama Yazılımı',
          price: 2_000_000,
          priceMonthly: 200_000,
          imageUrl: '["https://cdn.example/r1.webp"]',
          originalPrice: null,
        },
      },
      { price: 2_100_000, priceMonthly: 210_000 },
    ) as { data: { price: number; priceMonthly: number; imageUrl: string; originalPrice: null } }
    assert.equal(merged.data.price, 2_100_000)
    assert.equal(merged.data.priceMonthly, 210_000)
    assert.equal(merged.data.imageUrl, '["https://cdn.example/r1.webp"]')
    assert.equal(merged.data.originalPrice, null)
  })

  it('yayındaki public galeri, boş kapakla fiyat kaydını engellemez', () => {
    const content = {
      'bilirkisi-hesap': {
        blocks: [
          {
            type: 'product-detail',
            settings: {
              gallery: [{ url: 'https://cdn.example/r1.webp' }, { url: 'https://cdn.example/r2.webp' }],
            },
          },
        ],
      },
    }
    assert.equal(publishedProductGalleryUrls(content, 'bilirkisi-hesap').length, 2)
    assert.equal(publishedProductGalleryUrls(content, 'koopplus').length, 0)
    assert.equal(
      shouldWaiveMissingCoverOnUpdate({
        alreadyActive: true,
        nextActive: true,
        currentCoverUrl: null,
        nextCoverUrl: null,
        publishedGalleryImageCount: 2,
      }),
      true,
    )
  })

  it('yeni yayına alma ve kapağı silinen ürün muaf değildir', () => {
    assert.equal(
      shouldWaiveMissingCoverOnUpdate({
        alreadyActive: false,
        nextActive: true,
        currentCoverUrl: null,
        nextCoverUrl: null,
        publishedGalleryImageCount: 3,
      }),
      false,
    )
    assert.equal(
      shouldWaiveMissingCoverOnUpdate({
        alreadyActive: true,
        nextActive: true,
        currentCoverUrl: 'https://cdn.example/cover.webp',
        nextCoverUrl: null,
        publishedGalleryImageCount: 3,
      }),
      false,
    )
    assert.equal(
      shouldWaiveMissingCoverOnUpdate({
        alreadyActive: true,
        nextActive: true,
        currentCoverUrl: null,
        nextCoverUrl: null,
        publishedGalleryImageCount: 0,
      }),
      false,
    )
  })
})
