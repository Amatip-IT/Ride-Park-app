import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AdminAuditLogDocument = HydratedDocument<AdminAuditLog>;

@Schema({ timestamps: true })
export class AdminAuditLog {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  admin: string;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ index: true })
  targetType?: string;

  @Prop({ index: true })
  targetId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  oldValue?: Record<string, unknown> | string | null;

  @Prop({ type: MongooseSchema.Types.Mixed })
  newValue?: Record<string, unknown> | string | null;

  @Prop()
  reason?: string;

  @Prop()
  notes?: string;

  @Prop()
  ipAddress?: string;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);

AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
