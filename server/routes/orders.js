import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

const sql=`SELECT o.*,u.email customer_email,p.title painting_title FROM orders o JOIN users u ON u.id=o.customer_id JOIN paintings p ON p.id=o.painting_id`;
const oid=value=>/^\d+$/.test(value)&&+value>0?+value:null;
const json=(r,studio=false)=>{const out={id:r.id,customerId:r.customer_id,paintingId:r.painting_id,paintingTitle:r.painting_title,priceMinor:r.price_minor,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,cancelledAt:r.cancelled_at};if(studio)out.customerEmail=r.customer_email;return out;};
const missing=res=>res.status(404).json({error:{code:'ORDER_NOT_FOUND',message:'Order not found.'}});

export function createOrdersRouter(db) {
  const router=Router();
  router.get('/',requireAuth,(req,res)=>{const studio=req.session.user.role==='studio';const rows=studio?db.prepare(`${sql} ORDER BY o.created_at DESC,o.id DESC`).all():db.prepare(`${sql} WHERE o.customer_id=? ORDER BY o.created_at DESC,o.id DESC`).all(req.session.user.id);return res.json({data:rows.map(r=>json(r,studio))});});
  router.get('/:id',requireAuth,(req,res)=>{const id=oid(req.params.id);if(!id)return missing(res);const studio=req.session.user.role==='studio';const row=studio?db.prepare(`${sql} WHERE o.id=?`).get(id):db.prepare(`${sql} WHERE o.id=? AND o.customer_id=?`).get(id,req.session.user.id);return row?res.json({data:json(row,studio)}):missing(res);});
  router.post('/:id/cancel',...requireRole('customer'),(req,res)=>{const id=oid(req.params.id);if(!id)return missing(res);const result=db.transaction(()=>{const row=db.prepare(`${sql} WHERE o.id=? AND o.customer_id=?`).get(id,req.session.user.id);if(!row)return 'missing';if(row.status!=='placed')return 'not-cancellable';const changed=db.prepare("UPDATE orders SET status='cancelled',cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND customer_id=? AND status='placed'").run(id,req.session.user.id);if(changed.changes!==1)return 'not-cancellable';return db.prepare(`${sql} WHERE o.id=?`).get(id);}).immediate();if(result==='missing')return missing(res);if(result==='not-cancellable')return res.status(409).json({error:{code:'ORDER_NOT_CANCELLABLE',message:'This order cannot be cancelled.'}});return res.json({data:json(result)});});
  return router;
}
