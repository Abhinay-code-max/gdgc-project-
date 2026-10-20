import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Order } from '../models/Order.js';
import { orderJson } from './paintings.js';
import { runInTransaction } from '../db/connection.js';

const isValidObjectId = (val) => mongoose.Types.ObjectId.isValid(val) && String(new mongoose.Types.ObjectId(val)) === String(val);

const missing = (res) => res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } });

export function createOrdersRouter() {
  const router = Router();

  // GET /api/orders - Authenticated: customer sees own orders; studio sees all with customerEmail
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const isStudio = req.session.user.role === 'studio';
      const filter = isStudio ? {} : { customerId: req.session.user.id };

      let query = Order.find(filter).sort({ createdAt: -1, _id: -1 });
      if (isStudio) {
        query = query.populate('customerId', 'email');
      }

      const rows = await query.exec();
      return res.json({
        data: rows.map((r) => {
          const email = isStudio && r.customerId?.email ? r.customerId.email : null;
          return orderJson(r, isStudio, email);
        }),
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/orders/:id - Authenticated: studio sees any; customer sees only own; other customer receives 404
  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return missing(res);
      const isStudio = req.session.user.role === 'studio';

      let query = Order.findById(req.params.id);
      if (isStudio) {
        query = query.populate('customerId', 'email');
      }

      const row = await query.exec();
      if (!row) return missing(res);

      if (!isStudio && row.customerId.toString() !== req.session.user.id) {
        return missing(res); // Ownership hiding
      }

      const email = isStudio && row.customerId?.email ? row.customerId.email : null;
      return res.json({ data: orderJson(row, isStudio, email) });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/orders/:id/cancel - Customer owner only
  router.post('/:id/cancel', ...requireRole('customer'), async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return missing(res);

      const result = await runInTransaction(async (session) => {
        const query = session ? Order.findById(req.params.id).session(session) : Order.findById(req.params.id);
        const order = await query;
        if (!order || order.customerId.toString() !== req.session.user.id) {
          return { status: 'missing' };
        }
        if (order.status !== 'placed') {
          return { status: 'not-cancellable' };
        }

        order.status = 'cancelled';
        order.cancelledAt = new Date();
        if (session) await order.save({ session });
        else await order.save();

        return { status: 'ok', data: orderJson(order) };
      });

      if (result.status === 'missing') return missing(res);
      if (result.status === 'not-cancellable') {
        return res.status(409).json({
          error: { code: 'ORDER_NOT_CANCELLABLE', message: 'This order cannot be cancelled.' },
        });
      }

      return res.json({ data: result.data });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
