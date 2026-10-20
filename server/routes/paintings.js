import { Router } from 'express';
import mongoose from 'mongoose';
import { requireRole } from '../middleware/auth.js';
import { Painting } from '../models/Painting.js';
import { Order } from '../models/Order.js';
import { runInTransaction } from '../db/connection.js';

const isValidObjectId = (val) => mongoose.Types.ObjectId.isValid(val) && String(new mongoose.Types.ObjectId(val)) === String(val);

export const paintingJson = (r, available = true) => ({
  id: r._id.toString(),
  title: r.title,
  description: r.description,
  priceMinor: r.priceMinor,
  imageUrl: r.imageUrl ?? null,
  available: Boolean(available),
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
});

export const orderJson = (r, studio = false, customerEmail = null) => {
  const out = {
    id: r._id.toString(),
    customerId: r.customerId.toString(),
    paintingId: r.paintingId.toString(),
    paintingTitle: r.paintingTitle,
    priceMinor: r.priceMinor,
    status: r.status,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    cancelledAt: r.cancelledAt ? (r.cancelledAt instanceof Date ? r.cancelledAt.toISOString() : r.cancelledAt) : null,
  };
  if (studio && (customerEmail || r.customerEmail)) {
    out.customerEmail = customerEmail || r.customerEmail;
  }
  return out;
};

const notFound = (res) => res.status(404).json({ error: { code: 'PAINTING_NOT_FOUND', message: 'Painting not found.' } });

function validate(body, partial) {
  const values = {}, fields = {};
  if (!partial || Object.hasOwn(body ?? {}, 'title')) {
    const v = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!v || v.length > 160) fields.title = 'Title must be 1 to 160 characters.';
    else values.title = v;
  }
  if (!partial || Object.hasOwn(body ?? {}, 'description')) {
    const v = typeof body?.description === 'string' ? body.description.trim() : '';
    if (!v || v.length > 4000) fields.description = 'Description must be 1 to 4000 characters.';
    else values.description = v;
  }
  if (!partial || Object.hasOwn(body ?? {}, 'priceMinor')) {
    const v = body?.priceMinor;
    if (!Number.isSafeInteger(v) || v <= 0) fields.priceMinor = 'Price must be a positive integer number of paise.';
    else values.priceMinor = v;
  }
  if (Object.hasOwn(body ?? {}, 'imageUrl')) {
    const v = body.imageUrl;
    if (v === null || v === '') values.imageUrl = null;
    else {
      try {
        const u = new URL(v);
        if (!['http:', 'https:'].includes(u.protocol) || v.length > 2048) throw 0;
        values.imageUrl = u.toString();
      } catch {
        fields.imageUrl = 'Image URL must be a valid HTTP or HTTPS URL.';
      }
    }
  }
  if (partial && !Object.keys(values).length && !Object.keys(fields).length) {
    fields.request = 'Provide at least one painting field to update.';
  }
  return { values, fields };
}

export function createPaintingsRouter() {
  const router = Router();

  // Public: List all paintings
  router.get('/', async (_req, res, next) => {
    try {
      const paintings = await Painting.find().sort({ createdAt: -1, _id: -1 });
      const placedOrders = await Order.find({ status: 'placed' }, 'paintingId');
      const placedSet = new Set(placedOrders.map((o) => o.paintingId.toString()));

      return res.json({
        data: paintings.map((p) => paintingJson(p, !placedSet.has(p._id.toString()))),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Public: Get single painting
  router.get('/:id', async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return notFound(res);
      const painting = await Painting.findById(req.params.id);
      if (!painting) return notFound(res);

      const placedOrder = await Order.findOne({ paintingId: painting._id, status: 'placed' });
      return res.json({ data: paintingJson(painting, !placedOrder) });
    } catch (err) {
      return next(err);
    }
  });

  // Studio: Create painting
  router.post('/', ...requireRole('studio'), async (req, res, next) => {
    try {
      const { values, fields } = validate(req.body, false);
      if (Object.keys(fields).length) {
        return res.status(422).json({
          error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fields },
        });
      }

      const painting = await Painting.create({
        title: values.title,
        description: values.description,
        priceMinor: values.priceMinor,
        imageUrl: values.imageUrl ?? null,
      });

      return res.status(201).json({ data: paintingJson(painting, true) });
    } catch (err) {
      return next(err);
    }
  });

  // Studio: Edit painting (cannot edit sold painting)
  router.patch('/:id', ...requireRole('studio'), async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return notFound(res);
      const { values, fields } = validate(req.body, true);
      if (Object.keys(fields).length) {
        return res.status(422).json({
          error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fields },
        });
      }

      const result = await runInTransaction(async (session) => {
        const query = session ? Painting.findById(req.params.id).session(session) : Painting.findById(req.params.id);
        const painting = await query;
        if (!painting) return { status: 'missing' };

        const orderQuery = session
          ? Order.findOne({ paintingId: painting._id, status: 'placed' }).session(session)
          : Order.findOne({ paintingId: painting._id, status: 'placed' });
        const placed = await orderQuery;
        if (placed) return { status: 'sold' };

        Object.assign(painting, values);
        if (session) await painting.save({ session });
        else await painting.save();

        return { status: 'ok', data: paintingJson(painting, true) };
      });

      if (result.status === 'missing') return notFound(res);
      if (result.status === 'sold') {
        return res.status(409).json({ error: { code: 'PAINTING_SOLD', message: 'Sold paintings cannot be edited.' } });
      }
      return res.json({ data: result.data });
    } catch (err) {
      return next(err);
    }
  });

  // Customer: Purchase painting
  router.post('/:id/purchase', ...requireRole('customer'), async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) return notFound(res);

      try {
        const result = await runInTransaction(async (session) => {
          const pQuery = session ? Painting.findById(req.params.id).session(session) : Painting.findById(req.params.id);
          const painting = await pQuery;
          if (!painting) return { status: 'missing' };

          const oQuery = session
            ? Order.findOne({ paintingId: painting._id, status: 'placed' }).session(session)
            : Order.findOne({ paintingId: painting._id, status: 'placed' });
          const placed = await oQuery;
          if (placed) return { status: 'unavailable' };

          const orderDocs = await Order.create(
            [
              {
                customerId: req.session.user.id,
                paintingId: painting._id,
                paintingTitle: painting.title,
                priceMinor: painting.priceMinor,
                status: 'placed',
              },
            ],
            session ? { session } : {}
          );

          return { status: 'ok', data: orderJson(orderDocs[0]) };
        });

        if (result.status === 'missing') return notFound(res);
        if (result.status === 'unavailable') {
          return res.status(409).json({
            error: { code: 'PAINTING_UNAVAILABLE', message: 'This painting is no longer available.' },
          });
        }
        return res.status(201).json({ data: result.data });
      } catch (txError) {
        // Code 11000 is MongoDB duplicate key error from unique partial index
        if (txError.code === 11000 || (txError.message && txError.message.includes('E11000'))) {
          return res.status(409).json({
            error: { code: 'PAINTING_UNAVAILABLE', message: 'This painting is no longer available.' },
          });
        }
        throw txError;
      }
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
