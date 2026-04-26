import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert camelCase Drizzle output to snake_case for frontend compatibility */
export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    result[snakeKey] = value
  }
  return result
}

/** Convert array of camelCase objects to snake_case */
export function toSnakeArray<T extends Record<string, unknown>>(arr: T[]): Record<string, unknown>[] {
  return arr.map(toSnake)
}
