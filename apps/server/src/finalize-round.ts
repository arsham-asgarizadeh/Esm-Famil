import type {PrismaClient} from '@prisma/client';
import {scoreCategory,validateAnswer,type Dictionary,type Verdict} from '@esmfamil/game-engine';
import type {RuntimeRoom,RoundResults} from './room-engine.js';

export async function finalizeRound(db:PrismaClient,room:RuntimeRoom):Promise<RoundResults>{
 if(!room.round)throw new Error('ROUND_NOT_FOUND');
 const [categories,terms,aliases,rejected]=await Promise.all([
  db.category.findMany({where:{id:{in:room.settings.categoryIds}}}),
  db.term.findMany({where:{active:true},include:{categories:true}}),
  db.termAlias.findMany({include:{term:true}}),
  db.rejectedAnswer.findMany({where:{active:true}})
 ]);
 const dictionary:Dictionary={canonicalByNormalized:new Map(),aliases:new Map(),rejected:new Map()};
 for(const term of terms)dictionary.canonicalByNormalized.set(term.normalized,{id:term.id,canonical:term.canonical,categories:new Set(term.categories.map(x=>x.categoryId))});
 for(const alias of aliases)dictionary.aliases.set(alias.normalized,alias.term.normalized);
 for(const item of rejected)dictionary.rejected.set(`${item.normalized}:${item.categoryId??'*'}`,{status:item.reason,categoryId:item.categoryId??undefined});
 const categoryById=new Map(categories.map(c=>[c.id,c]));
 const verdicts=new Map<string,Verdict>();
 for(const player of room.players)for(const categoryId of room.settings.categoryIds){const category=categoryById.get(categoryId);if(!category)continue;verdicts.set(`${player.id}:${categoryId}`,validateAnswer({text:player.answers[categoryId]??'',letter:room.round.letter,categoryId,mode:category.mode,dictionary}))}
 const points=new Map<string,number>();
 for(const categoryId of room.settings.categoryIds){const rows=room.players.map(player=>{const v=verdicts.get(`${player.id}:${categoryId}`)!;return{playerId:player.id,categoryId,valid:v.status==='VALID',canonical:v.canonical??v.normalizedText,isStopper:room.round!.stopperId===player.id}});for(const [playerId,value] of scoreCategory(rows))points.set(`${playerId}:${categoryId}`,value)}
 const players=room.players.map(player=>{const cells=room.settings.categoryIds.map(categoryId=>{const v=verdicts.get(`${player.id}:${categoryId}`)!;return{categoryId,text:player.answers[categoryId]??'',status:v.status,reasonFa:v.reasonFa,points:points.get(`${player.id}:${categoryId}`)??0}});const roundScore=cells.reduce((sum,cell)=>sum+cell.points,0);player.score=(player.score??0)+roundScore;return{playerId:player.id,name:player.name,roundScore,totalScore:player.score,cells}});
 return{stopperId:room.round.stopperId,players};
}

export function recalculateResults(room:RuntimeRoom){
 if(!room.results||!room.round)return;
 for(const categoryId of room.settings.categoryIds){const rows=room.results.players.map(result=>{const cell=result.cells.find(x=>x.categoryId===categoryId)!;return{playerId:result.playerId,categoryId,valid:cell.status==='VALID',canonical:cell.text,isStopper:room.round!.stopperId===result.playerId}});const scores=scoreCategory(rows);for(const result of room.results.players){const cell=result.cells.find(x=>x.categoryId===categoryId)!;cell.points=scores.get(result.playerId)??0}}
 for(const result of room.results.players){const previousRound=result.roundScore;result.roundScore=result.cells.reduce((sum,cell)=>sum+cell.points,0);result.totalScore+=result.roundScore-previousRound;const player=room.players.find(x=>x.id===result.playerId);if(player)player.score=result.totalScore}
}
