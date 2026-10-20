import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
    },
    displayName: {
      type: String,
      trim: true,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['customer', 'studio'],
      default: 'customer',
      required: true,
    },
    provider: {
      type: String,
      default: 'local',
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $type: 'string' } },
  }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
