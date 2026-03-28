import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || '';

async function run() {
  if (!uri) {
    console.error('No MONGODB_URI in .env');
    process.exit(1);
  }

  const email = process.argv[2];

  if (!email) {
    console.log('Usage: npx ts-node make-admin.ts <email>');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    const usersCollection = mongoose.connection.collection('users');

    const user = await usersCollection.findOne({ email });

    if (!user) {
      console.log(`\n❌ No account found with email: ${email}`);
    } else {
      await usersCollection.updateOne({ email }, { $set: { role: 'admin' } });
      console.log(`\n✅ Success! Upgraded ${user.email} to an Admin account.`);
      console.log(`Please log out and log back into the app using this email to see the Admin interface.`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
