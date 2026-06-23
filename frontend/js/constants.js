// Word length → number of attempts (length + 1)
export const ATTEMPTS_BY_LENGTH = { 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 };

// Word length → timer in seconds (+30s increase per board)
export const TIMER_SECONDS_BY_LENGTH = { 3: 90, 4: 120, 5: 150, 6: 180, 7: 210 };

// Word length → tile size in px
export const TILE_SIZE_BY_LENGTH = { 3: 78, 4: 70, 5: 62, 6: 54, 7: 46 };

export const WORD_LENGTHS = [3, 4, 5, 6, 7];
export const DEFAULT_LENGTH = 5;
