import mongoose from 'mongoose';

export async function connectDatabase(uri, dbName = 'art_studio', options = {}) {
  if (mongoose.connection.readyState === 1) {
    if (mongoose.connection._connectionString === uri) {
      return mongoose.connection;
    }
    await mongoose.disconnect();
  }
  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    if (mongoose.connection._connectionString === uri) {
      return mongoose.connection;
    }
    await mongoose.disconnect();
  }

  const connectOptions = {
    dbName,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 5000,
    ...options,
  };

  try {
    await mongoose.connect(uri, connectOptions);
    return mongoose.connection;
  } catch (error) {
    const enrichedError = new Error(`Failed to connect to MongoDB at ${uri}: ${error.message}`);
    enrichedError.cause = error;
    throw enrichedError;
  }
}

export async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export async function runInTransaction(work) {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  const isReplica = Boolean(
    mongoose.connection.client?.topology?.description?.setName ||
    ['ReplicaSetWithPrimary', 'ReplicaSetNoPrimary', 'Sharded'].includes(topologyType)
  );

  if (!isReplica) {
    throw new Error(
      `MongoDB transactions are required for atomic purchase and cancellation operations, but the connected deployment topology '${topologyType || 'Standalone'}' does not support transactions. Use a replica set or MongoDB Atlas.`
    );
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
