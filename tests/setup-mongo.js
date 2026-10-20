import fs from 'node:fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, closeDatabase } from '../server/db/connection.js';
import { User } from '../server/models/User.js';
import { Painting } from '../server/models/Painting.js';
import { Order } from '../server/models/Order.js';

let replSetInstance = null;
const systemPath = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const systemBinary = fs.existsSync(systemPath) ? systemPath : undefined;

export async function setupTestReplSet() {
  if (!replSetInstance) {
    replSetInstance = await MongoMemoryReplSet.create({
      binary: systemBinary ? { systemBinary } : {},
      replSet: { count: 1 },
    });
  }
  const uri = replSetInstance.getUri();
  await connectDatabase(uri, 'art_studio_test');
  try {
    await mongoose.connection.dropDatabase();
  } catch {
    // Ignore if db doesn't exist yet
  }
  await Promise.all([User.init(), Painting.init(), Order.init()]);
  return { replSet: replSetInstance, uri };
}

export async function teardownTestReplSet() {
  await closeDatabase();
  if (replSetInstance) {
    await replSetInstance.stop();
    replSetInstance = null;
  }
}

export async function clearCollections() {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
}
