import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

const uri = process.env.MONGODB_URI || '';

async function run() {
  await mongoose.connect(uri);
  const usersCollection = mongoose.connection.collection('users');
  const users = await usersCollection.find({}).toArray();
  
  let output = `Found ${users.length} account(s):\n\n`;
  users.forEach((u, i) => {
    output += `${i+1}. Email: ${u.email} | Name: ${u.firstName} ${u.lastName} | Role: ${u.role} | Verified: ${u.isVerified}\n`;
  });
  
  fs.writeFileSync('users-output.txt', output, 'utf8');
  await mongoose.disconnect();
}
run();
