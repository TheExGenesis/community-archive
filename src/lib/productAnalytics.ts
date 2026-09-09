'use client'
import { capturePostHogEvent } from './posthog'

import type { ProductFeature, ProductAction } from './productActionSchema'

// Deliberately accepts no content, IDs, search strings, or labels.
export function captureProductAction(
  feature: ProductFeature,
  action: ProductAction,
) {
  capturePostHogEvent('product_action', { feature, action })
}
