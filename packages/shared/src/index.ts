import {z} from 'zod';
export const displayNameSchema=z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N}\s‌_-]+$/u);
export const createRoomSchema=z.object({displayName:displayNameSchema});
export const joinRoomSchema=z.object({inviteToken:z.string().min(32),displayName:displayNameSchema});
export const settingsSchema=z.object({durationSeconds:z.number().int().min(60).max(600),roundCount:z.number().int().min(1).max(10),categoryIds:z.array(z.string()).max(20),votingEnabled:z.boolean(),difficulty:z.enum(['EASY','MEDIUM','HARD','MIXED'])});
export const answerSchema=z.object({roundId:z.string(),categoryId:z.string(),text:z.string().max(80)});
export const voteSchema=z.object({voteSessionId:z.string(),choice:z.enum(['VALID','INVALID','UNSURE'])});
export type GameState='LOBBY'|'COUNTDOWN'|'PLAYING'|'STOP_CONFIRMATION'|'LOCKED'|'VALIDATING'|'VOTING'|'RESULTS'|'NEXT_ROUND'|'FINISHED';
export type ValidationStatus='VALID'|'WRONG_LETTER'|'WRONG_CATEGORY'|'MEANINGLESS'|'MISSPELLING'|'UNKNOWN'|'INAPPROPRIATE'|'SPAM'|'EMPTY';
