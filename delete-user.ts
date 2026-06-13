import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || '';
const email = process.argv[2]?.trim().toLowerCase();

async function run() {
  if (!uri) {
    console.error('No MONGODB_URI in .env');
    process.exit(1);
  }

  if (!email) {
    console.error('Usage: npx ts-node delete-user.ts <email>');
    console.error('Example: npx ts-node delete-user.ts jane@example.com');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    const db = mongoose.connection;
    const users = db.collection('users');

    const user = await users.findOne({ email });
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    const id = user._id.toString();
    console.log(`Deleting: ${user.firstName ?? ''} ${user.lastName ?? ''} (${user.email}, role: ${user.role ?? 'user'})`);

    if (user.role === 'taxi_driver') {
      const taxis = await db.collection('taxis').deleteMany({ user: user._id });
      if (taxis.deletedCount > 0) {
        console.log(`Removed ${taxis.deletedCount} taxi record(s).`);
      }
    }

    const settings = await db.collection('user_settings').deleteMany({
      $or: [{ userId: id }, { userID: id }],
    });
    if (settings.deletedCount > 0) {
      console.log(`Removed ${settings.deletedCount} user setting(s).`);
    }

    await users.deleteOne({ _id: user._id });
    console.log(`User ${email} deleted successfully.`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
