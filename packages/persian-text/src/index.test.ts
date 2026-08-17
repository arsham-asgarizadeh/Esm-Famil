import {describe,expect,it} from 'vitest'; import {containsForbiddenInput,initialLetter,isSpam,normalizePersian,startsWithLetter} from './index.js';
describe('Persian normalization',()=>{
 it('normalizes Arabic forms, marks, whitespace and digits',()=>expect(normalizePersian('  كِي  ۱۲٣ـ ')).toEqual({originalText:'  كِي  ۱۲٣ـ ',normalizedText:'کی 123'}));
 it('removes malicious bidi and keeps one half-space',()=>expect(normalizePersian('می‌‌\u202Eروم').normalizedText).toBe('می‌روم'));
 it('groups alef and alef-madda',()=>{expect(initialLetter('آبادان')).toBe('ا');expect(startsWithLetter('آهو','ا')).toBe(true)});
 it('detects forbidden and spam input',()=>{expect(containsForbiddenInput('سیب🙂')).toBe(true);expect(isSpam('پپپپپ')).toBe(true)});
});
