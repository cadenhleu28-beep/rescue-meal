import type { Allergen, Category, Dietary } from '../types'

export const CATEGORY_LABELS: Record<Category, string> = {
  bakery: 'Baked goods',
  meals: 'Prepared meals',
  produce: 'Produce',
  grocery: 'Groceries',
}

export const DIETARY_LABELS: Record<Dietary, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  'gluten-free': 'Gluten-free',
  halal: 'Halal',
}

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  dairy: 'Dairy',
  eggs: 'Eggs',
  nuts: 'Tree nuts / peanuts',
  soy: 'Soy',
  sesame: 'Sesame',
  fish: 'Fish',
  shellfish: 'Shellfish',
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]
export const DIETARY = Object.keys(DIETARY_LABELS) as Dietary[]
export const ALLERGENS = Object.keys(ALLERGEN_LABELS) as Allergen[]
