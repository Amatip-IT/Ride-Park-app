import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

const uri = process.env.MONGODB_URI || '';

async function run() {
  await mongoose.connect(uri);
  const verifications = mongoose.connection.collection('parkingverifications');
  const all = await verifications.find({}).toArray();
  fs.writeFileSync('test_output.json', JSON.stringify(all, null, 2));
  await mongoose.disconnect();
}
run();
