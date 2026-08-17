import {containsForbiddenInput,isSpam,normalizePersian,startsWithLetter} from '@esmfamil/persian-text';
import type {ValidationStatus} from '@esmfamil/shared';
export type Dictionary={canonicalByNormalized:Map<string,{id:string;canonical:string;categories:Set<string>}>,aliases:Map<string,string>,rejected:Map<string,{status:ValidationStatus;categoryId?:string}>};
export type Verdict={status:ValidationStatus;reasonCode:string;reasonFa:string;normalizedText:string;canonicalId?:string;canonical?:string};
const verdict=(status:ValidationStatus,reasonCode:string,reasonFa:string,normalizedText:string,extra:Partial<Verdict>={}):Verdict=>({status,reasonCode,reasonFa,normalizedText,...extra});
export function validateAnswer(input:{text:string;letter:string;categoryId:string;mode:'OPEN'|'CLOSED';dictionary:Dictionary}):Verdict{
 const normalizedText=normalizePersian(input.text).normalizedText;
 if(!normalizedText)return verdict('EMPTY','EMPTY','پاسخی وارد نشده است.',normalizedText);
 if(normalizedText.length>80||containsForbiddenInput(normalizedText)||/\s+(?:یا|و)\s+/u.test(normalizedText))return verdict('MEANINGLESS','FORBIDDEN_INPUT','پاسخ دارای نویسه یا ساختار غیرمجاز است.',normalizedText);
 if(isSpam(normalizedText))return verdict('SPAM','REPEATED_CHARS','پاسخ شبیه اسپم است.',normalizedText);
 if(!startsWithLetter(normalizedText,input.letter))return verdict('WRONG_LETTER','WRONG_INITIAL','پاسخ با حرف دور شروع نمی‌شود.',normalizedText);
 const rejection=input.dictionary.rejected.get(`${normalizedText}:${input.categoryId}`)??input.dictionary.rejected.get(`${normalizedText}:*`);
 if(rejection)return verdict(rejection.status,'REJECTED_LIST','این پاسخ در فهرست ردشده‌هاست.',normalizedText);
 const direct=input.dictionary.canonicalByNormalized.get(normalizedText); const canonicalNorm=input.dictionary.aliases.get(normalizedText); const term=direct??(canonicalNorm?input.dictionary.canonicalByNormalized.get(canonicalNorm):undefined);
 if(term){if(term.categories.has(input.categoryId))return verdict('VALID',direct?'CANONICAL':'ALIAS','پاسخ در واژه‌نامه تأیید شده است.',normalizedText,{canonicalId:term.id,canonical:term.canonical});return verdict('WRONG_CATEGORY','KNOWN_OTHER_CATEGORY','واژه معتبر است اما به این موضوع تعلق ندارد.',normalizedText,{canonicalId:term.id,canonical:term.canonical});}
 return input.mode==='OPEN'?verdict('UNKNOWN','OPEN_UNKNOWN','پاسخ در موضوع باز نیازمند بررسی است.',normalizedText):verdict('WRONG_CATEGORY','CLOSED_UNKNOWN','پاسخ در فهرست بسته این موضوع نیست.',normalizedText);
}
export type ScoreInput={playerId:string;categoryId:string;valid:boolean;canonical:string;isStopper:boolean};
export function scoreCategory(rows:ScoreInput[]):Map<string,number>{const result=new Map(rows.map(r=>[r.playerId,r.valid?0:(r.isStopper?-5:0)]));const valid=rows.filter(r=>r.valid);if(valid.length===1){result.set(valid[0]!.playerId,20);return result}const counts=new Map<string,number>();valid.forEach(r=>counts.set(r.canonical,(counts.get(r.canonical)??0)+1));valid.forEach(r=>result.set(r.playerId,counts.get(r.canonical)!>1?5:10));return result}
export function resolveVote(votes:{playerId:string;choice:'VALID'|'INVALID'|'UNSURE'}[],ownerId:string){const eligible=votes.filter(v=>v.playerId!==ownerId&&v.choice!=='UNSURE');const yes=eligible.filter(v=>v.choice==='VALID').length,no=eligible.length-yes;return {accepted:eligible.length>=2&&yes>no,needsAdmin:eligible.length<2||yes===no,yes,no,eligible:eligible.length}}
export function selectLetter(coverage:Record<string,number[]>,difficulty:'EASY'|'MEDIUM'|'HARD'|'MIXED',used:string[],random=Math.random){const options=Object.entries(coverage).filter(([l,c])=>!used.includes(l)&&c.every(n=>n>0));if(!options.length)throw new Error('NO_PLAYABLE_LETTER');const ranked=options.map(([letter,c])=>({letter,total:c.reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total);let pool=ranked;if(difficulty==='EASY')pool=ranked.slice(0,Math.max(1,Math.ceil(ranked.length/3)));if(difficulty==='HARD')pool=ranked.slice(-Math.max(1,Math.ceil(ranked.length/3)));return pool[Math.floor(random()*pool.length)]!.letter}
