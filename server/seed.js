import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';
import { connectDatabase, closeDatabase } from './db/connection.js';
import { User } from './models/User.js';
import { Painting } from './models/Painting.js';

export const STUDIO_EMAIL = (process.env.STUDIO_EMAIL || 'studio@artstudio.com').trim().toLowerCase();
export const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || 'StudioPass123!long';

export async function seedDatabase(customConfig = {}) {
  const config = getConfig(customConfig);
  await connectDatabase(config.mongodbUri, config.mongodbDbName);

  const studioEmail = config.studioEmail || STUDIO_EMAIL;
  const studioPassword = config.studioPassword || STUDIO_PASSWORD;
  const passwordHash = await bcrypt.hash(studioPassword, 10);

  // Idempotently create or update studio user
  await User.findOneAndUpdate(
    { email: studioEmail },
    {
      $set: {
        passwordHash,
        role: 'studio',
        displayName: 'Atelier Studio Master',
        provider: 'local',
      },
      $setOnInsert: {
        email: studioEmail,
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

  // Idempotently check sample paintings
  const sampleCount = await Painting.countDocuments({ fixtureKind: 'sample' });
  if (sampleCount === 0) {
    const samples = [
      {
        title: '[Sample Fixture] Monsoon Study',
        description: 'Clearly labelled sample fixture painting. Acrylic on linen, 24x36in.',
        priceMinor: 125000,
        imageUrl: null,
        fixtureKind: 'sample',
      },
      {
        title: '[Sample Fixture] Quiet Courtyard',
        description: 'Clearly labelled sample fixture painting. Oil on wood, 20x24in.',
        priceMinor: 98000,
        imageUrl: null,
        fixtureKind: 'sample',
      },
      {
        title: '[Sample Fixture] Amber Terracotta',
        description: 'Clearly labelled sample fixture painting. Earth pigment on handmade paper.',
        priceMinor: 85000,
        imageUrl: null,
        fixtureKind: 'sample',
      },
      {
        title: '[Sample Fixture] Twilight Lotus Pond',
        description: 'Clearly labelled sample fixture painting. Water colour and gold leaf on silk.',
        priceMinor: 160000,
        imageUrl: null,
        fixtureKind: 'sample',
      },
    ];
    await Painting.insertMany(samples);
  }

  console.log(`Seeded controlled studio account (${studioEmail}) and sample fixtures.`);
}

// CLI runner
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/seed.js')) {
  seedDatabase()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Database seeding failed:', error);
      await closeDatabase().catch(() => {});
      process.exit(1);
    });
}
