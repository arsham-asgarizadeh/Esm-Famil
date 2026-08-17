const ARABIC_MAP: Record<string,string> = { 'ي':'ی','ى':'ی','ئ':'ی','ك':'ک','ة':'ه','ۀ':'ه','ؤ':'و' };
const DIGITS: Record<string,string> = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu;
const DANGEROUS = /[\u200B\u200D\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;
export const normalizePersian = (originalText:string) => {
  let normalizedText = originalText.normalize('NFKC').replace(DANGEROUS,'').replace(DIACRITICS,'').replace(/ـ/gu,'');
  normalizedText = [...normalizedText].map(c=>ARABIC_MAP[c] ?? DIGITS[c] ?? c).join('');
  normalizedText = normalizedText.replace(/[’‘`´]/gu,"'").replace(/[،؛]/gu,',').replace(/\u200c+/gu,'‌').replace(/\s+/gu,' ').trim();
  return { originalText, normalizedText };
};
export const letterGroup = (letter:string) => letter === 'آ' ? 'ا' : normalizePersian(letter).normalizedText[0] ?? '';
export const initialLetter = (text:string) => letterGroup(normalizePersian(text).normalizedText[0] ?? '');
export const startsWithLetter = (text:string, letter:string) => initialLetter(text) === letterGroup(letter);
export const containsForbiddenInput = (text:string) => /(?:https?:\/\/|www\.)/iu.test(text) || /[0-9\p{Extended_Pictographic}]/u.test(text) || /[^\p{Script=Arabic}\s‌'\-,]/u.test(text);
export const isSpam = (text:string) => /(.)\1{3,}/u.test(normalizePersian(text).normalizedText) || /(\b\S+\b)(?:\s+\1){2,}/u.test(text);
