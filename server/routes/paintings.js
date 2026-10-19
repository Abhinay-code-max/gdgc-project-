import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const paintingSql = `SELECT p.*, NOT EXISTS (SELECT 1 FROM orders o WHERE o.painting_id=p.id AND o.status='placed') available FROM paintings p`;
const orderSql = `SELECT o.*, p.title painting_title FROM orders o JOIN paintings p ON p.id=o.painting_id`;
const pid = value => /^\d+$/.test(value) && +value > 0 ? +value : null;
const paintingJson = r => ({id:r.id,title:r.title,description:r.description,priceMinor:r.price_minor,imageUrl:r.image_url,available:!!r.available,createdAt:r.created_at,updatedAt:r.updated_at});
const orderJson = r => ({id:r.id,customerId:r.customer_id,paintingId:r.painting_id,paintingTitle:r.painting_title,priceMinor:r.price_minor,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,cancelledAt:r.cancelled_at});
const notFound = res => res.status(404).json({error:{code:'PAINTING_NOT_FOUND',message:'Painting not found.'}});

function validate(body, partial) {
  const values={}, fields={};
  if (!partial || Object.hasOwn(body ?? {},'title')) { const v=typeof body?.title==='string'?body.title.trim():''; if(!v||v.length>160)fields.title='Title must be 1 to 160 characters.';else values.title=v; }
  if (!partial || Object.hasOwn(body ?? {},'description')) { const v=typeof body?.description==='string'?body.description.trim():''; if(!v||v.length>4000)fields.description='Description must be 1 to 4000 characters.';else values.description=v; }
  if (!partial || Object.hasOwn(body ?? {},'priceMinor')) { const v=body?.priceMinor; if(!Number.isSafeInteger(v)||v<=0)fields.priceMinor='Price must be a positive integer number of paise.';else values.priceMinor=v; }
  if (Object.hasOwn(body ?? {},'imageUrl')) { const v=body.imageUrl; if(v===null||v==='')values.imageUrl=null; else try { const u=new URL(v); if(!['http:','https:'].includes(u.protocol)||v.length>2048)throw 0; values.imageUrl=u.toString(); } catch {fields.imageUrl='Image URL must be a valid HTTP or HTTPS URL.';} }
  if(partial&&!Object.keys(values).length&&!Object.keys(fields).length)fields.request='Provide at least one painting field to update.';
  return {values,fields};
}

export function createPaintingsRouter(db) {
  const router=Router(), find=db.prepare(`${paintingSql} WHERE p.id=?`);
  router.get('/',(_q,res)=>res.json({data:db.prepare(`${paintingSql} ORDER BY p.created_at DESC,p.id DESC`).all().map(paintingJson)}));
  router.get('/:id',(req,res)=>{const row=pid(req.params.id)&&find.get(pid(req.params.id));return row?res.json({data:paintingJson(row)}):notFound(res);});
  router.post('/',...requireRole('studio'),(req,res)=>{const {values,fields}=validate(req.body,false);if(Object.keys(fields).length)return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Check the highlighted fields.',fields}});const out=db.prepare('INSERT INTO paintings(title,description,price_minor,image_url) VALUES(?,?,?,?)').run(values.title,values.description,values.priceMinor,values.imageUrl??null);return res.status(201).json({data:paintingJson(find.get(out.lastInsertRowid))});});
  router.patch('/:id',...requireRole('studio'),(req,res)=>{const id=pid(req.params.id);if(!id||!find.get(id))return notFound(res);const {values,fields}=validate(req.body,true);if(Object.keys(fields).length)return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Check the highlighted fields.',fields}});const result=db.transaction(()=>{const current=find.get(id);if(!current)return 'missing';if(!current.available)return 'sold';const map={title:'title',description:'description',priceMinor:'price_minor',imageUrl:'image_url'},sets=[],args=[];for(const [k,v] of Object.entries(values)){sets.push(`${map[k]}=?`);args.push(v);}db.prepare(`UPDATE paintings SET ${sets.join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...args,id);return paintingJson(find.get(id));}).immediate();if(result==='missing')return notFound(res);if(result==='sold')return res.status(409).json({error:{code:'PAINTING_SOLD',message:'Sold paintings cannot be edited.'}});return res.json({data:result});});
  router.post('/:id/purchase',...requireRole('customer'),(req,res,next)=>{const id=pid(req.params.id);if(!id)return notFound(res);try{const result=db.transaction(()=>{const p=find.get(id);if(!p)return 'missing';if(!p.available)return 'unavailable';return Number(db.prepare("INSERT INTO orders(customer_id,painting_id,price_minor,status) VALUES(?,?,?,'placed')").run(req.session.user.id,id,p.price_minor).lastInsertRowid);}).immediate();if(result==='missing')return notFound(res);if(result==='unavailable')return res.status(409).json({error:{code:'PAINTING_UNAVAILABLE',message:'This painting is no longer available.'}});return res.status(201).json({data:orderJson(db.prepare(`${orderSql} WHERE o.id=?`).get(result))});}catch(error){if(error.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:{code:'PAINTING_UNAVAILABLE',message:'This painting is no longer available.'}});return next(error);}});
  return router;
}
