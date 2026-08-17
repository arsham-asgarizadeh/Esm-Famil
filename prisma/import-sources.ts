import {PrismaClient} from '@prisma/client';
import {readFile,readdir} from 'node:fs/promises';
import {normalizePersian,initialLetter} from '@esmfamil/persian-text';

const db=new PrismaClient();
type SourceRow={slug:string;value:string;source:string;confidence:number};
const base=new URL('./data/sources/',import.meta.url);
async function main(){
const rows:SourceRow[]=[];
const names=JSON.parse(await readFile(new URL('persian-names.json',base),'utf8')) as Record<string,{name:string}>;
for(const item of Object.values(names))rows.push({slug:'name',value:item.name,source:'nabidam/persian-names (MIT)',confidence:.9});
const pngt=await readFile(new URL('pngt-26k-names.csv',base),'utf8');
for(const line of pngt.split(/\r?\n/u).slice(1)){const comma=line.indexOf(',');if(comma>0)rows.push({slug:'name',value:line.slice(0,comma),source:'PNGT-26K farbodbj/persian-gender-by-name (Apache-2.0)',confidence:.96})}
const cities=JSON.parse(await readFile(new URL('iran-cities.json',base),'utf8')) as {name:string}[];
for(const item of cities)rows.push({slug:'iran-city',value:item.name,source:'sajaddp/list-of-cities-in-Iran (GPL-3.0, official divisions 1402)',confidence:.98});
const provinces=JSON.parse(await readFile(new URL('iran-provinces.json',base),'utf8')) as {name:string}[];
for(const item of provinces)rows.push({slug:'province',value:item.name,source:'sajaddp/list-of-cities-in-Iran (GPL-3.0, official divisions 1402)',confidence:.98});
for(const file of await readdir(base)){if(!file.startsWith('wikidata-')||!file.endsWith('.json'))continue;const slug=file.slice(9,-5);const data=JSON.parse(await readFile(new URL(file,base),'utf8')) as {label:string;sourceUrl:string}[];for(const item of data)rows.push({slug,value:item.label,source:`Wikidata ${item.sourceUrl}`,confidence:.9})}
const categories=new Map((await db.category.findMany()).map(c=>[c.slug,c.id]));
const unique=new Map<string,SourceRow>();
for(const row of rows){const normalized=normalizePersian(row.value).normalizedText;if(!categories.has(row.slug)||normalized.length<2||normalized.length>80||!/^[\p{Script=Arabic}\s‌'\-]+$/u.test(normalized))continue;unique.set(`${row.slug}:${normalized}`,{...row,value:normalized})}
const bySlug=new Map<string,SourceRow[]>();for(const row of unique.values()){const list=bySlug.get(row.slug)??[];list.push(row);bySlug.set(row.slug,list)}
for(const [slug,list] of bySlug){const categoryId=categories.get(slug)!;for(let i=0;i<list.length;i+=750){const chunk=list.slice(i,i+750);await db.term.createMany({data:chunk.map(x=>({canonical:x.value,normalized:x.value,initialLetter:initialLetter(x.value),source:x.source,confidence:x.confidence})),skipDuplicates:true});const terms=await db.term.findMany({where:{normalized:{in:chunk.map(x=>x.value)}},select:{id:true}});await db.termCategory.createMany({data:terms.map(term=>({termId:term.id,categoryId})),skipDuplicates:true})}console.log(slug,list.length)}
console.log('source relationships',unique.size);await db.$disconnect();
}
main().catch(async error=>{console.error(error);await db.$disconnect();process.exitCode=1});
