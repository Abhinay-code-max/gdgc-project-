import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';
import { createDatabase } from './db/index.js';

export const STUDIO_EMAIL = (process.env.STUDIO_EMAIL || 'studio@artstudio.com').trim().toLowerCase();
export const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || 'StudioPass123!long';

export function seedDatabase(db) {
  const hash = bcrypt.hashSync(STUDIO_PASSWORD, 10);
  db.prepare(`
    INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'studio')
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'studio', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run(STUDIO_EMAIL, hash);

  const count = db.prepare("SELECT count(*) as count FROM paintings WHERE fixture_kind = 'sample'").get().count;
  if (!count) {
    const insert = db.prepare(
      "INSERT INTO paintings (title, description, price_minor, image_url, fixture_kind) VALUES (?, ?, ?, ?, 'sample')"
    );
    insert.run('[Sample Fixture] Monsoon Study', 'Clearly labelled sample fixture painting. Acrylic on linen, 24x36in.', 125000, null);
    insert.run('[Sample Fixture] Quiet Courtyard', 'Clearly labelled sample fixture painting. Oil on wood, 20x24in.', 98000, null);
  }
}

// CLI runner
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/seed.js')) {
  const config = getConfig();
  const db = createDatabase(config.databasePath);
  seedDatabase(db);
  db.close();
  console.log(`Seeded controlled studio account and sample fixtures.`);
}
