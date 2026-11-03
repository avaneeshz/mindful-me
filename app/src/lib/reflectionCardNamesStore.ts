import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { parseCardNames, type ReflectionCardNames } from '@/domain/reflectionCardNames'

const KEY = 'mindful-me:state-tile-names'

export function loadCardNames(): ReflectionCardNames {
  return parseCardNames(readStoredJSON(KEY))
}

export function saveCardNames(names: ReflectionCardNames): void {
  writeStoredJSON(KEY, names)
}
