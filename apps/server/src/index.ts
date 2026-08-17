import Fastify from 'fastify';import cors from '@fastify/cors';import helmet from '@fastify/helmet';import rateLimit from '@fastify/rate-limit';import jwt from '@fastify/jwt';import {Server} from 'socket.io';import {PrismaClient} from '@prisma/client';import {compare} from 'bcryptjs';import {createRoomSchema,joinRoomSchema,settingsSchema,answerSchema,voteSchema} from '@esmfamil/shared';import {normalizePersian} from '@esmfamil/persian-text';import {RoomEngine,token,tokenHash} from './room-engine.js';
import {finalizeRound} from './finalize-round.js';
import {recalculateResults} from './finalize-round.js';
import {chooseLetter} from './letter-selection.js';
import {fileURLToPath} from 'node:url';
try{process.loadEnvFile(fileURLToPath(new URL('../../../.env',import.meta.url)))}catch{/* env provided by the environment (e.g. Docker env_file) */}
const db=new PrismaClient(),app=Fastify({logger:{redact:['req.headers.authorization','req.body.inviteToken','req.body.sessionToken']}}),engine=new RoomEngine();
await app.register(cors,{origin:process.env.WEB_ORIGIN?.split(',')??['http://localhost:5173'],credentials:true});await app.register(helmet);await app.register(rateLimit,{max:120,timeWindow:'1 minute'});await app.register(jwt,{secret:process.env.JWT_SECRET??'development-only-secret-change-me-32'});
app.get('/health',()=>({ok:true}));app.get('/api/categories',()=>db.category.findMany({where:{active:true},orderBy:{name:'asc'}}));
app.post('/api/rooms',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{const x=createRoomSchema.parse(req.body),invite=token(),session=token();const room=await db.room.create({data:{inviteTokenHash:tokenHash(invite),players:{create:{displayName:x.displayName,normalizedName:normalizePersian(x.displayName).normalizedText,sessionTokenHash:tokenHash(session),isHost:true}}},include:{players:true}});const host=room.players[0]!;engine.create(room.id,{id:host.id,name:host.displayName,host:true,ready:false,connected:true,answers:{}});return reply.code(201).send({roomId:room.id,inviteToken:invite,sessionToken:session,playerId:host.id,inviteUrl:`/join/${room.id}?token=${invite}`})});
app.post('/api/rooms/:roomId/join',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req:any,reply)=>{const x=joinRoomSchema.parse(req.body),row=await db.room.findUnique({where:{id:req.params.roomId},include:{players:true}});if(!row||row.inviteTokenHash!==tokenHash(x.inviteToken))return reply.code(403).send({message:'لینک دعوت معتبر نیست.'});if(row.status!=='LOBBY'||row.players.length>=8)return reply.code(409).send({message:row.players.length>=8?'اتاق پر است.':'بازی شروع شده است.'});const session=token();try{const p=await db.player.create({data:{roomId:row.id,displayName:x.displayName,normalizedName:normalizePersian(x.displayName).normalizedText,sessionTokenHash:tokenHash(session)}});let runtime=engine.rooms.get(row.id);if(!runtime){const host=row.players.find(p=>p.isHost)!;runtime=engine.create(row.id,{id:host.id,name:host.displayName,host:true,ready:host.isReady,connected:true,answers:{}});for(const old of row.players.filter(p=>p.id!==host.id))engine.join(runtime,{id:old.id,name:old.displayName,host:false,ready:old.isReady,connected:true,answers:{}})}engine.join(runtime,{id:p.id,name:p.displayName,host:false,ready:false,connected:true,answers:{}});io.to(row.id).emit('room:state',runtime);return {sessionToken:session,playerId:p.id,roomId:row.id}}catch{return reply.code(409).send({message:'این نام در اتاق استفاده شده است.'})}});
app.post('/api/admin/login',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req:any,reply)=>{const {email,password}=req.body??{},admin=await db.admin.findUnique({where:{email}});if(!admin||!await compare(password,admin.passwordHash))return reply.code(401).send({message:'اطلاعات ورود نادرست است.'});return {token:app.jwt.sign({sub:admin.id,role:'admin'},{expiresIn:'2h'})}});
const adminGuard=async(req:any,reply:any)=>{try{await req.jwtVerify()}catch{return reply.code(401).send({message:'نیاز به ورود مدیر است.'})}};
app.get('/api/admin/dashboard',{preHandler:adminGuard},async()=>{const [terms,aliases,rejected,queue,games,rounds]=await Promise.all([db.term.count({where:{active:true}}),db.termAlias.count(),db.rejectedAnswer.count({where:{active:true}}),db.moderationQueueItem.count({where:{status:'PENDING'}}),db.game.count(),db.round.count()]);return {terms,aliases,rejected,queue,games,rounds}});
app.get('/api/admin/unknowns',{preHandler:adminGuard},()=>db.moderationQueueItem.findMany({include:{category:true,events:true},orderBy:{useCount:'desc'}}));
app.post('/api/admin/unknowns/:id/decide',{preHandler:adminGuard},async(req:any)=>{const {action,note}=req.body,item=await db.moderationQueueItem.findUniqueOrThrow({where:{id:req.params.id}});const status=action==='APPROVE'?'APPROVED':'REJECTED';return db.$transaction(async tx=>{if(action==='APPROVE'){const term=await tx.term.upsert({where:{normalized:item.normalizedText},update:{active:true},create:{canonical:item.originalText,normalized:item.normalizedText,initialLetter:item.letter,source:'admin',confidence:1}});await tx.termCategory.upsert({where:{termId_categoryId:{termId:term.id,categoryId:item.categoryId}},update:{},create:{termId:term.id,categoryId:item.categoryId}})}else await tx.rejectedAnswer.upsert({where:{normalized_categoryId:{normalized:item.normalizedText,categoryId:item.categoryId}},update:{active:true,reason:'WRONG_CATEGORY'},create:{normalized:item.normalizedText,categoryId:item.categoryId,scope:'CATEGORY',reason:'WRONG_CATEGORY',reasonFa:note??'رد مدیر'}});await tx.moderationEvent.create({data:{itemId:item.id,action,before:{status:item.status},after:{status},note}});return tx.moderationQueueItem.update({where:{id:item.id},data:{status}})})});
const io=new Server(app.server,{cors:{origin:process.env.WEB_ORIGIN?.split(',')??['http://localhost:5173']}});
type RuntimeRoom=import('./room-engine.js').RuntimeRoom;type RuntimeVote=import('./room-engine.js').RuntimeVote;
const emit=(r:RuntimeRoom)=>io.to(r.id).emit('room:state',r);

// ----- Server-side timers (kept out of the room object so they are never serialised to clients) -----
const timers=new Map<string,Record<string,NodeJS.Timeout|undefined>>();
function setTimer(roomId:string,key:string,fn:()=>void,ms:number){let t=timers.get(roomId);if(!t){t={};timers.set(roomId,t)}if(t[key])clearTimeout(t[key]);t[key]=setTimeout(fn,Math.max(0,ms))}
function clearTimer(roomId:string,key:string){const t=timers.get(roomId);if(t?.[key]){clearTimeout(t[key]);t[key]=undefined}}
function clearAllTimers(roomId:string){const t=timers.get(roomId);if(t){for(const k of Object.keys(t))if(t[k])clearTimeout(t[k]!);timers.delete(roomId)}}

// ----- Round lifecycle -----
async function startGame(r:RuntimeRoom){
 const letter=await chooseLetter(db,r);
 const game=await db.game.create({data:{roomId:r.id,state:'PLAYING',durationSeconds:r.settings.durationSeconds,roundCount:r.settings.roundCount,votingEnabled:r.settings.votingEnabled,difficulty:r.settings.difficulty,categories:{create:r.settings.categoryIds.map((categoryId,position)=>({categoryId,position}))}}});
 r.gameId=game.id;
 await db.room.update({where:{id:r.id},data:{status:'ACTIVE'}});
 await beginRound(r,1,letter);
}
async function beginRound(r:RuntimeRoom,number:number,letter:string){
 const startsAt=Date.now()+3000,endsAt=startsAt+r.settings.durationSeconds*1000;
 const round=await db.round.create({data:{gameId:r.gameId!,number,letter,state:'COUNTDOWN',startsAt:new Date(startsAt),endsAt:new Date(endsAt)}});
 r.round={id:round.id,number,letter,startsAt,endsAt};
 delete r.results;delete r.currentVote;r.voteQueue=[];
 r.state='COUNTDOWN';emit(r);
 setTimer(r.id,'countdown',()=>startPlaying(r.id),3000);
}
function startPlaying(roomId:string){const r=engine.rooms.get(roomId);if(!r||r.state!=='COUNTDOWN'||!r.round)return;r.state='PLAYING';db.round.update({where:{id:r.round.id},data:{state:'PLAYING'}}).catch(error=>app.log.error({error},'round->playing persist failed'));emit(r);setTimer(roomId,'roundEnd',()=>autoEndRound(roomId,r.round!.id),r.round.endsAt-Date.now())}
function autoEndRound(roomId:string,roundId:string){const r=engine.rooms.get(roomId);if(!r||!r.round||r.round.id!==roundId)return;if(r.state!=='PLAYING'&&r.state!=='STOP_CONFIRMATION')return;void endRound(r)}
async function endRound(r:RuntimeRoom){
 clearTimer(r.id,'roundEnd');clearTimer(r.id,'stopRes');
 r.state='VALIDATING';emit(r);
 try{
  r.results=await finalizeRound(db,r);
  await db.round.update({where:{id:r.round!.id},data:{state:'VALIDATING',stopperId:r.round!.stopperId??null}}).catch(error=>app.log.error({error},'round finalize persist failed'));
  await enqueueUnknowns(r);
  await persistSubmissionsAndScores(r);
  beginVoting(r);
 }catch(error){app.log.error({error},'round finalization failed');r.state='RESULTS';emit(r)}
}

// ----- Voting -----
function beginVoting(r:RuntimeRoom){
 const unknown=new Map<string,{text:string;categoryId:string;ownerIds:string[]}>();
 for(const result of r.results?.players??[])for(const cell of result.cells)if(cell.status==='UNKNOWN'){const key=`${cell.categoryId}:${normalizePersian(cell.text).normalizedText}`;const item=unknown.get(key)??{text:cell.text,categoryId:cell.categoryId,ownerIds:[]};item.ownerIds.push(result.playerId);unknown.set(key,item)}
 r.voteQueue=[...unknown.values()].map(item=>({...item,id:token(),endsAt:0,votes:{}}));
 if(!r.settings.votingEnabled||!r.voteQueue.length){void finishResults(r);return}
 r.state='VOTING';advanceVote(r);
}
function advanceVote(r:RuntimeRoom){const vote=r.voteQueue?.shift();if(!vote){delete r.currentVote;void finishResults(r);return}vote.endsAt=Date.now()+10_000;r.currentVote=vote;emit(r);setTimer(r.id,'vote',()=>resolveVoteQuestion(r.id,vote.id),10_000)}
async function resolveVoteQuestion(roomId:string,voteId:string){
 const r=engine.rooms.get(roomId),vote=r?.currentVote;if(!r||r.state!=='VOTING'||!vote||vote.id!==voteId)return;
 const eligible=Object.entries(vote.votes).filter(([id,choice])=>!vote.ownerIds.includes(id)&&r.players.some(p=>p.id===id&&p.connected)&&choice!=='UNSURE');
 const yes=eligible.filter(([,choice])=>choice==='VALID').length,no=eligible.filter(([,choice])=>choice==='INVALID').length;
 const accepted=eligible.length>=2&&yes>no;
 if(accepted)for(const result of r.results?.players??[])for(const cell of result.cells)if(cell.categoryId===vote.categoryId&&normalizePersian(cell.text).normalizedText===normalizePersian(vote.text).normalizedText){cell.status='VALID';cell.reasonCode='VOTE_ACCEPTED';cell.reasonFa='با رأی اکثریت بازیکنان برای این دور پذیرفته شد.'}
 await persistVoteSession(r,vote,accepted);
 advanceVote(r);
}
async function finishResults(r:RuntimeRoom){
 recalculateResults(r);
 r.state='RESULTS';emit(r);
 await persistSubmissionsAndScores(r);
 await db.round.update({where:{id:r.round!.id},data:{state:'RESULTS'}}).catch(error=>app.log.error({error},'round->results persist failed'));
}

// ----- Persistence helpers -----
async function enqueueUnknowns(r:RuntimeRoom){
 if(!r.round||!r.results)return;
 const map=new Map<string,{originalText:string;categoryId:string;normalized:string;reasons:Set<string>;count:number}>();
 for(const pl of r.results.players)for(const cell of pl.cells)if(cell.status==='UNKNOWN'){const normalized=normalizePersian(cell.text).normalizedText;if(!normalized)continue;const key=`${cell.categoryId}:${normalized}`;const entry=map.get(key)??{originalText:cell.text,categoryId:cell.categoryId,normalized,reasons:new Set<string>(),count:0};entry.count++;entry.reasons.add(cell.reasonCode);map.set(key,entry)}
 for(const entry of map.values())await db.moderationQueueItem.upsert({where:{normalizedText_categoryId:{normalizedText:entry.normalized,categoryId:entry.categoryId}},update:{useCount:{increment:entry.count},gameCount:{increment:1},lastSeenAt:new Date()},create:{normalizedText:entry.normalized,originalText:entry.originalText,categoryId:entry.categoryId,letter:r.round.letter,useCount:entry.count,engineReasons:[...entry.reasons]}}).catch(error=>app.log.error({error},'moderation upsert failed'));
}
async function persistSubmissionsAndScores(r:RuntimeRoom){
 if(!r.round||!r.results)return;const roundId=r.round.id;
 for(const pl of r.results.players)for(const cell of pl.cells){
  const normalizedText=normalizePersian(cell.text).normalizedText;
  const status=cell.status as any;
  try{
   await db.submission.upsert({where:{roundId_playerId_categoryId:{roundId,playerId:pl.playerId,categoryId:cell.categoryId}},update:{originalText:cell.text,normalizedText,status,reasonCode:cell.reasonCode,reasonFa:cell.reasonFa,lockedAt:new Date()},create:{roundId,playerId:pl.playerId,categoryId:cell.categoryId,originalText:cell.text,normalizedText,status,reasonCode:cell.reasonCode,reasonFa:cell.reasonFa,lockedAt:new Date()}});
   await db.roundScore.upsert({where:{roundId_playerId_categoryId:{roundId,playerId:pl.playerId,categoryId:cell.categoryId}},update:{points:cell.points,explanation:cell.reasonFa},create:{roundId,playerId:pl.playerId,categoryId:cell.categoryId,points:cell.points,explanation:cell.reasonFa}});
  }catch(error){app.log.error({error},'submission/score persist failed')}
 }
}
async function persistVoteSession(r:RuntimeRoom,vote:RuntimeVote,accepted:boolean){
 if(!r.round)return;const roundId=r.round.id,normalizedText=normalizePersian(vote.text).normalizedText;
 try{
  const session=await db.voteSession.upsert({where:{roundId_normalizedText_categoryId:{roundId,normalizedText,categoryId:vote.categoryId}},update:{resolvedAs:accepted},create:{roundId,normalizedText,categoryId:vote.categoryId,ownerPlayerId:vote.ownerIds[0]!,startsAt:new Date(vote.endsAt-10_000),endsAt:new Date(vote.endsAt),resolvedAs:accepted}});
  for(const [pid,choice] of Object.entries(vote.votes))await db.vote.upsert({where:{voteSessionId_playerId:{voteSessionId:session.id,playerId:pid}},update:{choice:choice as any},create:{voteSessionId:session.id,playerId:pid,choice:choice as any}}).catch(()=>{});
 }catch(error){app.log.error({error},'vote session persist failed')}
}
async function finishGame(r:RuntimeRoom){
 clearAllTimers(r.id);r.state='FINISHED';emit(r);
 if(r.gameId)await db.game.update({where:{id:r.gameId},data:{state:'FINISHED',finishedAt:new Date()}}).catch(error=>app.log.error({error},'game finish persist failed'));
 await db.room.update({where:{id:r.id},data:{status:'FINISHED'}}).catch(error=>app.log.error({error},'room finish persist failed'));
}

io.use(async(socket,next)=>{const {roomId,playerId,sessionToken}=socket.handshake.auth;const p=await db.player.findFirst({where:{id:playerId,roomId,sessionTokenHash:tokenHash(sessionToken??'')}});if(!p)return next(new Error('UNAUTHORIZED'));socket.data={roomId,playerId};next()});
io.on('connection',socket=>{const {roomId,playerId}=socket.data;socket.join(roomId);const room=engine.rooms.get(roomId);const player=room?.players.find(p=>p.id===playerId);if(player)player.connected=true;if(room)emit(room);
 socket.on('player:ready',()=>{const r=engine.rooms.get(roomId),p=r?.players.find(x=>x.id===playerId);if(!r||!p||r.state!=='LOBBY')return;p.ready=!p.ready;emit(r)});
 socket.on('settings:update',(raw,ack)=>{try{const s=settingsSchema.parse(raw),r=engine.rooms.get(roomId),p=r?.players.find(x=>x.id===playerId);if(!r||!p?.host||r.state!=='LOBBY')throw Error('FORBIDDEN');r.settings=s;emit(r);ack?.({ok:true})}catch(error){app.log.error({error},'settings update failed');ack?.({ok:false,message:error instanceof Error?error.message:'UNKNOWN'})}});
 socket.on('game:start',async(_:unknown,ack)=>{const r=engine.rooms.get(roomId),p=r?.players.find(x=>x.id===playerId);if(!r||!p?.host||r.state!=='LOBBY')return ack?.({ok:false,message:'بازی قابل شروع نیست.'});if(r.players.length<2||r.settings.categoryIds.length<5)return ack?.({ok:false,message:'حداقل ۲ بازیکن و ۵ موضوع لازم است.'});try{await startGame(r);ack?.({ok:true})}catch(error){app.log.error({error},'game start failed');r.state='LOBBY';emit(r);ack?.({ok:false,message:'برای موضوع‌های انتخاب‌شده حرف قابل‌بازی پیدا نشد.'})}});
 socket.on('answer:save',(raw,ack)=>{try{const x=answerSchema.parse(raw),r=engine.rooms.get(roomId),p=r?.players.find(y=>y.id===playerId);if(!r||!p||(r.state!=='PLAYING'&&r.state!=='STOP_CONFIRMATION')||r.round?.id!==x.roundId)throw Error();p.answers[x.categoryId]=x.text;ack?.({ok:true})}catch{ack?.({ok:false})}});
 socket.on('round:stop',(_:unknown,ack)=>{const r=engine.rooms.get(roomId);if(!r||!engine.reserveStop(r,playerId))return ack?.({ok:false});emit(r);setTimer(roomId,'stopRes',()=>{const rr=engine.rooms.get(roomId);if(rr&&engine.cancelExpired(rr))emit(rr)},10_000);ack?.({ok:true})});
 socket.on('round:confirm',async(_:unknown,ack)=>{const r=engine.rooms.get(roomId);if(!r||!engine.confirmStop(r,playerId))return ack?.({ok:false});clearTimer(roomId,'stopRes');ack?.({ok:true});await endRound(r)});
 socket.on('round:next',async(_:unknown,ack)=>{const r=engine.rooms.get(roomId),p=r?.players.find(x=>x.id===playerId);if(!r||!p?.host||r.state!=='RESULTS'||!r.round)return ack?.({ok:false});if(r.round.number>=r.settings.roundCount){await finishGame(r);return ack?.({ok:true})}try{const number=r.round.number+1,letter=await chooseLetter(db,r);r.players.forEach(x=>{x.answers={};x.ready=false});await beginRound(r,number,letter);ack?.({ok:true})}catch(error){app.log.error({error},'next round failed');ack?.({ok:false})}});
 socket.on('vote:cast',(raw,ack)=>{try{const x=voteSchema.parse(raw),r=engine.rooms.get(roomId),vote=r?.currentVote;if(!r||r.state!=='VOTING'||!vote||vote.id!==x.voteSessionId||Date.now()>vote.endsAt||vote.votes[playerId])throw Error();vote.votes[playerId]=x.choice;ack?.({ok:true})}catch{ack?.({ok:false})}});
 socket.on('disconnect',()=>{const r=engine.rooms.get(roomId),p=r?.players.find(x=>x.id===playerId);if(p)p.connected=false;if(r&&r.round&&r.round.stopperId===playerId&&r.state==='STOP_CONFIRMATION'){r.state='PLAYING';delete r.round.stopperId;delete r.round.reservationExpiresAt;clearTimer(roomId,'stopRes')}if(r)emit(r)})});
const port=Number(process.env.PORT??3001);const shutdown=async()=>{io.close();await app.close();await db.$disconnect()};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);await app.listen({port,host:'0.0.0.0'});
