require('dotenv').config();
const fs=require('fs'),mysql=require('mysql2/promise');
const cats={aneis:['Anéis','Anel'],brincos:['Brincos','Brinco'],colares:['Colares','Colar'],conjuntos:['Conjuntos','Conjunto'],pulseiras:['Pulseiras','Pulseira']};
const pr=s=>s?parseFloat(s.replace(',','.')):null;
(async()=>{
  const db=await mysql.createConnection({host:process.env.DB_HOST,port: 21377,user:process.env.DB_USER,password:process.env.DB_PASS,multipleStatements:true});
  await db.query(fs.readFileSync('schema.sql','utf8'));await db.query('USE '+process.env.DB_NAME);
  const data=JSON.parse(fs.readFileSync('seed/data.json','utf8'));
  for(const [slug,[nome,sing]] of Object.entries(cats)){
    await db.query('INSERT IGNORE INTO categorias (slug,nome,singular) VALUES (?,?,?)',[slug,nome,sing]);
    const [[c]]=await db.query('SELECT id FROM categorias WHERE slug=?',[slug]);
    for(const it of data[slug]){
      await db.query(`INSERT IGNORE INTO produtos (categoria_id,codigo,nome,preco_ouro,preco_prata,tamanhos,imagem,ativo) VALUES (?,?,?,?,?,?,?,1)`,
        [c.id,it.n,`${sing} ${String(it.n).padStart(2,'0')}`,pr(it.O),pr(it.P),it.tam?it.tam.replace('TAM.:','').trim():null,`${slug}_${it.n}.jpg`]);
    }
  }
  console.log('Seed concluído.');await db.end();
})().catch(e=>{console.error(e);process.exit(1)});
