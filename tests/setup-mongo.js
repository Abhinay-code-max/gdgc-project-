import fs from 'node:fs';
import childProcess from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, closeDatabase } from '../server/db/connection.js';
import { User } from '../server/models/User.js';
import { Painting } from '../server/models/Painting.js';
import { Order } from '../server/models/Order.js';

let replSetInstance = null;

export function validateSystemBinary(binaryPath = process.env.MONGOMS_SYSTEM_BINARY) {
  if (!binaryPath) return;
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Configured MONGOMS_SYSTEM_BINARY does not exist: "${binaryPath}"`);
  }
}

// Fail clearly before test suites start if an invalid system binary path was configured
if (process.env.MONGOMS_SYSTEM_BINARY) {
  validateSystemBinary(process.env.MONGOMS_SYSTEM_BINARY);
}

function getBinaryConfig() {
  const binary = {};
  if (process.env.MONGOMS_SYSTEM_BINARY) {
    validateSystemBinary(process.env.MONGOMS_SYSTEM_BINARY);
    binary.systemBinary = process.env.MONGOMS_SYSTEM_BINARY;
    if (process.env.MONGOMS_VERSION) {
      binary.version = process.env.MONGOMS_VERSION;
    } else {
      try {
        const out = childProcess.spawnSync(process.env.MONGOMS_SYSTEM_BINARY, ['--version'], {
          encoding: 'utf8',
        }).stdout;
        const match = out && out.match(/^\s*db\s+version\s+v?(\d+\.\d+\.\d+)/im);
        if (match && match[1]) {
          binary.version = match[1];
        }
      } catch {
        // Fall back gracefully to default version resolution
      }
    }
  } else if (process.env.MONGOMS_VERSION) {
    binary.version = process.env.MONGOMS_VERSION;
  }
  return binary;
}

export async function setupTestReplSet() {
  if (!replSetInstance) {
    replSetInstance = await MongoMemoryReplSet.create({
      binary: getBinaryConfig(),
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
