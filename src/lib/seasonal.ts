// src/lib/seasonal.ts

export const SEASONAL_BY_MONTH: Record<number, string[]> = {
  1:  ['딸기', '한라봉', '귤', '시금치', '우엉'],
  2:  ['딸기', '한라봉', '귤', '봄동', '달래'],
  3:  ['딸기', '봄동', '냉이', '달래', '쑥', '주꾸미', '도다리'],
  4:  ['딸기', '봄배추', '냉이', '달래', '두릅', '쑥', '참나물', '대파', '주꾸미', '도다리'],
  5:  ['참외', '딸기', '봄배추', '두릅', '오이', '주꾸미'],
  6:  ['참외', '자두', '복숭아', '오이', '감자', '양파', '매실'],
  7:  ['복숭아', '자두', '수박', '오이', '옥수수', '토마토', '감자'],
  8:  ['복숭아', '수박', '포도', '옥수수', '토마토', '오이', '고추'],
  9:  ['포도', '사과', '배', '고구마', '버섯', '전어'],
  10: ['사과', '배', '단감', '고구마', '버섯', '무', '배추'],
  11: ['사과', '배', '단감', '무', '배추', '김장배추', '굴'],
  12: ['귤', '한라봉', '굴', '무', '배추', '시금치'],
}

export function isSeasonalProduct(productName: string, month?: number): boolean {
  const m = month ?? new Date().getMonth() + 1
  const names = SEASONAL_BY_MONTH[m] ?? []
  return names.some(n => productName.includes(n))
}

export function getSeasonalNames(month?: number): string[] {
  const m = month ?? new Date().getMonth() + 1
  return SEASONAL_BY_MONTH[m] ?? []
}
