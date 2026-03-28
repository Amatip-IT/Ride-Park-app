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
    console.log('Connecting to database...');
    await mongoose.connect(uri);
    console.log('Connected!');

    // Get the users collection
    const usersCollection = mongoose.connection.collection('users');
    
    // Find all users before deleting
    const users = await usersCollection.find({}).toArray();
    console.log(`\nFound ${users.length} accounts in the database:`);
    users.forEach((u, i) => {
      console.log(`${i + 1}. Email: ${u.email} | Role: ${u.role} | Verified: ${u.isVerified}`);
    });

    if (users.length > 0) {
      console.log('\nClearing all user accounts...');
      await usersCollection.deleteMany({});
      
      // Also clear providers tracking & verification
      await mongoose.connection.collection('parkingverifications').deleteMany({});
      await mongoose.connection.collection('chauffeurs').deleteMany({});
      await mongoose.connection.collection('taxis').deleteMany({});
      console.log('Successfully deleted all users and provider verification records!');
    } else {
      console.log('\nNo users found to delete.');
    }

  } catch (error) {
    console.error('Failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
