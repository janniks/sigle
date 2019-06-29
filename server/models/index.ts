import mongoose, { Schema } from 'mongoose';

const PublicStorySchema = new Schema(
  {
    _id: String,
    title: String,
    content: String,
    excerpt: String,
    metaTitle: String,
    metaDescription: String,
  },
  { autoIndex: false }
);

export const PublicStoryModel = mongoose.model(
  'PublicStory',
  PublicStorySchema,
  'radiks-server-data'
);

const UserSchema = new Schema(
  {
    _id: String,
    username: String,
    name: String,
    description: String,
    imageUrl: String,
  },
  { autoIndex: false }
);

export const UserModel = mongoose.model(
  'User',
  UserSchema,
  'radiks-server-data'
);