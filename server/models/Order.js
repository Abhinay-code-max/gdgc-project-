import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    paintingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Painting',
      required: true,
    },
    paintingTitle: {
      type: String,
      required: true,
      trim: true,
    },
    priceMinor: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isSafeInteger,
        message: '{VALUE} is not a valid integer number of paise.',
      },
    },
    status: {
      type: String,
      enum: ['placed', 'cancelled'],
      default: 'placed',
      required: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Partial unique index: only ONE order with status 'placed' per painting
orderSchema.index(
  { paintingId: 1 },
  { unique: true, partialFilterExpression: { status: 'placed' } }
);

orderSchema.index({ customerId: 1, createdAt: -1 });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
