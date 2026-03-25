import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose'; // Import MongooseModule for database connection
import { ConfigModule, ConfigService } from '@nestjs/config'; // Import ConfigModule and ConfigService to access environment variables
import { DatabaseService } from './database.service'; // Import your DatabaseService

@Module({
  imports: [
    // Ensure ConfigModule is loaded so ConfigService is available
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        // getOrThrow ensures a string is returned or throws, avoiding unknown/unsafe types
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
