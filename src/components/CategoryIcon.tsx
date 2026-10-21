import { Apple, Croissant, ShoppingBasket, Soup, type LucideIcon } from 'lucide-react'
import type { Category } from '../types'

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  bakery: Croissant,
  meals: Soup,
  produce: Apple,
  grocery: ShoppingBasket,
}

export function CategoryTile({ category, size = 44 }: { category: Category; size?: number }) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <span className={`cat-tile cat-${category}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.8} />
    </span>
  )
}
