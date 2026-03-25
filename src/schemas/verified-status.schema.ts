import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class VerifiedStatus {
  @Prop({ default: false }) email: boolean;
  @Prop({ default: false }) phone: boolean;
  @Prop({ default: false }) identity: boolean;
}

export const VerifiedStatusSchema =
  SchemaFactory.createForClass(VerifiedStatus);
