import {PrismaClient} from '@prisma/client';
try{process.loadEnvFile()}catch{/* env already provided (e.g. by prisma CLI) */}
const db=new PrismaClient();
async function main(){
 const rows=await db.termCategory.findMany({where:{term:{active:true},category:{active:true}},select:{term:{select:{initialLetter:true}},category:{select:{slug:true}}}});
 const matrix:Record<string,Record<string,number>>={};
 for(const r of rows){matrix[r.category.slug]??={};matrix[r.category.slug]![r.term.initialLetter]=(matrix[r.category.slug]![r.term.initialLetter]??0)+1}
 console.log(JSON.stringify(matrix,null,2));
}
main().finally(()=>db.$disconnect());
