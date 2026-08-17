import type {PrismaClient} from '@prisma/client';
import {selectLetter} from '@esmfamil/game-engine';
import type {RuntimeRoom} from './room-engine.js';

export async function chooseLetter(db:PrismaClient,room:RuntimeRoom){
 const rows=await db.termCategory.findMany({where:{categoryId:{in:room.settings.categoryIds},term:{active:true}},select:{categoryId:true,term:{select:{initialLetter:true}}}});
 const coverage:Record<string,number[]>={};
 for(const row of rows){coverage[row.term.initialLetter]??=room.settings.categoryIds.map(()=>0);const index=room.settings.categoryIds.indexOf(row.categoryId);if(index>=0){const counts=coverage[row.term.initialLetter]!;counts[index]=(counts[index]??0)+1}}
 const used=room.usedLetters??=[];
 let letter:string;
 try{letter=selectLetter(coverage,room.settings.difficulty,used)}catch{letter=selectLetter(coverage,room.settings.difficulty,[])}
 room.usedLetters=[...used,letter];return letter;
}
