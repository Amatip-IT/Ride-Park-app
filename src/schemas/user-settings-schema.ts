import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserSettingsDocument = HydratedDocument<user_settings>;

@Schema({ _id: false })
export class user_settings {
  @Prop({ type: String })
  userID: string;

  @Prop({ type: String, default: 'light', enum: ['light', 'dark'] })
  colourTheme: string;

  @Prop({ type: Boolean, default: true })
  require_OTP_for_login: boolean;
}

export const UserSettingsSchema: MongooseSchema<user_settings> =
  SchemaFactory.createForClass(user_settings);
