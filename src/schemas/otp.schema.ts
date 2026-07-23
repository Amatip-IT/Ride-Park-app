import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class OtpEntry {
  @Prop({ type: String })
  codeHash?: string;

  /** Legacy plaintext field — no longer written; cleared on verify */
  @Prop({ type: String })
  code?: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Number, default: 0 })
  attempts?: number;
}

@Schema({ _id: false })
export class OtpStorage {
  @Prop({ type: Object }) emailOtp?: OtpEntry;
  @Prop({ type: Object }) phoneOtp?: OtpEntry;
}

export const OtpStorageSchema = SchemaFactory.createForClass(OtpStorage);
