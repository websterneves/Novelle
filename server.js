require('dotenv').config();
const path=require('path'),crypto=require('crypto'),express=require('express'),mysql=require('mysql2/promise'),multer=require('multer');
const app=express();
const db=mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,charset:'utf8mb4',connectionLimit:10});
const upload=multer({storage:multer.diskStorage({destination:path.join(__dirname,'public/uploads'),
  filename:(r,f,cb)=>cb(null,Date.now()+'_'+crypto.randomBytes(4).toString('hex')+path.extname(f.originalname).toLowerCase())}),
  limits:{fileSize:5*1024*1024},fileFilter:(r,f,cb)=>cb(null,/^image\/(jpeg|png|webp)$/.test(f.mimetype))});
app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:false}));app.use(express.static(path.join(__dirname,'public')));
app.locals.money=v=>v==null?'':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2});
const wrap=fn=>(q,s,n)=>fn(q,s,n).catch(n);
const dec=v=>{v=(v||'').trim().replace(/\./g,'').replace(',','.');return v===''||isNaN(v)?null:Number(v)};

// ---- Vitrine pública (só itens ativos)
app.get('/',wrap(async(req,res)=>{
  const [cats]=await db.query('SELECT * FROM categorias ORDER BY id');
  const cat=cats.find(c=>c.slug===req.query.cat);
  const ord={asc:'LEAST(COALESCE(preco_ouro,9e9),COALESCE(preco_prata,9e9)) ASC',desc:'LEAST(COALESCE(preco_ouro,9e9),COALESCE(preco_prata,9e9)) DESC'}[req.query.ord]||'c.id, p.codigo';
  const [produtos]=await db.query(`SELECT p.*,c.slug cat_slug,c.nome cat_nome FROM produtos p JOIN categorias c ON c.id=p.categoria_id WHERE p.ativo=1 ${cat?'AND c.id=?':''} ORDER BY ${ord}`,cat?[cat.id]:[]);
  res.render('index',{cats,cat,produtos,ord:req.query.ord||'',whatsapp:process.env.WHATSAPP||''});
}));

// ---- Admin (Basic Auth)
const auth=(req,res,next)=>{
  const [u,p]=Buffer.from((req.headers.authorization||'').split(' ')[1]||'','base64').toString().split(':');
  if(u===process.env.ADMIN_USER&&p===process.env.ADMIN_PASS)return next();
  res.set('WWW-Authenticate','Basic realm="Novelle Admin"').status(401).send('Acesso restrito');
};
app.use('/admin',auth);
app.get('/admin',wrap(async(req,res)=>{
  const [cats]=await db.query('SELECT * FROM categorias ORDER BY id');
  const w=[],a=[];
  if(req.query.cat){w.push('c.slug=?');a.push(req.query.cat)}
  if(req.query.status==='ativos')w.push('p.ativo=1');if(req.query.status==='inativos')w.push('p.ativo=0');
  if(req.query.q){w.push('(p.nome LIKE ? OR p.codigo=?)');a.push('%'+req.query.q+'%',parseInt(req.query.q)||0)}
  const [produtos]=await db.query(`SELECT p.*,c.nome cat_nome,c.slug cat_slug FROM produtos p JOIN categorias c ON c.id=p.categoria_id ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY c.id,p.codigo`,a);
  res.render('admin',{cats,produtos,f:req.query});
}));
app.post('/admin/produtos/:id/toggle',wrap(async(req,res)=>{
  await db.query('UPDATE produtos SET ativo=1-ativo WHERE id=?',[req.params.id]);res.redirect(req.get('referer')||'/admin');
}));
app.post('/admin/categoria/:id/:acao',wrap(async(req,res)=>{ // ativar/desativar categoria inteira
  await db.query('UPDATE produtos SET ativo=? WHERE categoria_id=?',[req.params.acao==='ativar'?1:0,req.params.id]);res.redirect('/admin');
}));
const proximo=async cid=>{const [[r]]=await db.query('SELECT COALESCE(MAX(codigo),0)+1 AS prox FROM produtos WHERE categoria_id=?',[cid]);return r.prox};
app.get('/admin/api/proximo-codigo',wrap(async(req,res)=>res.json({codigo:await proximo(req.query.categoria_id)})));
app.get('/admin/produtos/novo',wrap(async(req,res)=>{
  const [cats]=await db.query('SELECT * FROM categorias ORDER BY id');
  const c=cats.find(x=>x.slug===req.query.cat)||cats[0];
  const codigo=await proximo(c.id);
  res.render('form',{cats,p:{ativo:1,categoria_id:c.id,codigo,nome:c.singular+' '+String(codigo).padStart(2,'0')},erro:null});
}));
app.get('/admin/produtos/:id',wrap(async(req,res)=>{
  const [cats]=await db.query('SELECT * FROM categorias ORDER BY id');
  const [[p]]=await db.query('SELECT * FROM produtos WHERE id=?',[req.params.id]);
  p?res.render('form',{cats,p,erro:null}):res.status(404).send('Produto não encontrado');
}));
const save=wrap(async(req,res)=>{
  const b=req.body,id=req.params.id;
  const v=[b.categoria_id,parseInt(b.codigo),b.nome.trim(),b.descricao||null,dec(b.preco_ouro),dec(b.preco_prata),b.tamanhos||null,b.ativo?1:0];
  try{
    if(id){
      await db.query('UPDATE produtos SET categoria_id=?,codigo=?,nome=?,descricao=?,preco_ouro=?,preco_prata=?,tamanhos=?,ativo=? WHERE id=?',[...v,id]);
      if(req.file)await db.query('UPDATE produtos SET imagem=? WHERE id=?',[req.file.filename,id]);
    }else await db.query('INSERT INTO produtos (categoria_id,codigo,nome,descricao,preco_ouro,preco_prata,tamanhos,ativo,imagem) VALUES (?,?,?,?,?,?,?,?,?)',[...v,req.file?req.file.filename:null]);
    res.redirect('/admin');
  }catch(e){
    if(e.code!=='ER_DUP_ENTRY')throw e;
    const [cats]=await db.query('SELECT * FROM categorias ORDER BY id');
    res.render('form',{cats,p:{...b,id,ativo:b.ativo?1:0},erro:'Já existe um produto com esse código nessa categoria.'});
  }
});
app.post('/admin/produtos',upload.single('imagem'),save);
app.post('/admin/produtos/:id',upload.single('imagem'),save);
app.post('/admin/produtos/:id/excluir',wrap(async(req,res)=>{await db.query('DELETE FROM produtos WHERE id=?',[req.params.id]);res.redirect('/admin')}));
app.use((e,req,res,n)=>{console.error(e);res.status(500).send('Erro interno')});
app.listen(process.env.PORT||3000,()=>console.log('Novelle em http://localhost:'+(process.env.PORT||3000)));
