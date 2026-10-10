/** Word list for the library word game (pics in ui/play/WordPics). */
export const WORDS = ['cat', 'sun', 'tree', 'bus', 'fish', 'star', 'house', 'ball', 'apple', 'moon'] as const
export type WordId = (typeof WORDS)[number]
