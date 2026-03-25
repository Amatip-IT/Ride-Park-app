import { Injectable, Inject } from '@nestjs/common';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseService {
  constructor(
    @Inject('DatabaseConnection') private readonly connection: Connection,
  ) {
    console.log('DatabaseService initialized...........');
  }
}
