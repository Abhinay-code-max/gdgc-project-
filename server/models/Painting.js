import mongoose from 'mongoose';

const paintingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    priceMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: '{VALUE} is not a valid integer number of paise.',
      },
    },
    imageUrl: {
      type: String,
      default: null,
    },
    fixtureKind: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paintingSchema.index({ createdAt: -1 });

export const Painting = mongoose.models.Painting || mongoose.model('Painting', paintingSchema);
