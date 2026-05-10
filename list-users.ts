import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || '';

async function run() {
  if (!uri) {
    console.error('No MONGODB_URI in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    const usersCollection = mongoose.connection.collection('users');

    const users = await usersCollection.find({}, { projection: { email: 1, role: 1, firstName: 1, lastName: 1 } }).toArray();

    console.log('\n--- Registered Users ---');
    if (users.length === 0) {
      console.log('No users found.');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.firstName} ${user.lastName} - ${user.email} (Role: ${user.role || 'user'})`);
      });
    }
    console.log('------------------------\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
