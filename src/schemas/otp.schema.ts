import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class OtpStorage {
  @Prop({ type: Object }) emailOtp?: { code: string; expiresAt: Date };
  @Prop({ type: Object }) phoneOtp?: { code: string; expiresAt: Date };
}

export const OtpStorageSchema = SchemaFactory.createForClass(OtpStorage);
