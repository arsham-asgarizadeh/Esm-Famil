import {mkdir,writeFile} from 'node:fs/promises';

const endpoint='https://query.wikidata.org/sparql';
const roots:Record<string,string>={
 country:'Q6256',animal:'Q729',bird:'Q5113',fruit:'Q3314483',food:'Q2095',drink:'Q40050',color:'Q1075',plant:'Q756',job:'Q12737077',clothing:'Q11460',body:'Q4936952',vehicle:'Q42889',sport:'Q349',instrument:'Q34379'
};
const clean=(value:string)=>value.replace(/\s*\([^)]*\)\s*$/u,'').trim();
async function queryWikidata(query:string){const url=`${endpoint}?format=json&query=${encodeURIComponent(query)}`;const response=await fetch(url,{headers:{accept:'application/sparql-results+json','user-agent':'EsmFamil/1.0 (curated Persian word game dataset)'}});if(!response.ok)throw new Error(`Wikidata ${response.status}: ${await response.text()}`);const json:any=await response.json();return json.results.bindings.map((x:any)=>({id:x.item.value.split('/').pop(),label:clean(x.label.value),sourceUrl:x.item.value})).filter((x:any)=>x.label.length>1&&!/[A-Za-z0-9]/u.test(x.label))}
async function main(){
 await mkdir(new URL('./data/sources/',import.meta.url),{recursive:true});
 for(const [slug,root] of Object.entries(roots)){const query=`SELECT DISTINCT ?item ?label WHERE { { ?item wdt:P31/wdt:P279* wd:${root}. } UNION { ?item wdt:P279+ wd:${root}. } ?item rdfs:label ?label. FILTER(LANG(?label)="fa") } LIMIT 2500`;try{const rows=await queryWikidata(query);await writeFile(new URL(`./data/sources/wikidata-${slug}.json`,import.meta.url),JSON.stringify(rows,null,2));console.log(slug,rows.length)}catch(error){console.error(slug,error)}}
 const famousQuery='SELECT DISTINCT ?item ?label WHERE { ?item wdt:P31 wd:Q5; rdfs:label ?label; wikibase:sitelinks ?sitelinks. FILTER(LANG(?label)="fa" && ?sitelinks > 30) } ORDER BY DESC(?sitelinks) LIMIT 3000';
 const famous=await queryWikidata(famousQuery);await writeFile(new URL('./data/sources/wikidata-famous.json',import.meta.url),JSON.stringify(famous,null,2));console.log('famous',famous.length);
}
main().catch(error=>{console.error(error);process.exitCode=1});
