import {  text, uuid, jsonb, timestamp, pgEnum, pgTable} from "drizzle-orm/pg-core";
import { colleges } from "./branch.model.js";

export const USER_ROLE = pgEnum('role', ['student', 'admin', 'teacher'])

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    collegeId:uuid('college_id').references(()=>colleges.id,{onDelete:'cascade'}),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    avatar: jsonb('avatar'),
    bio: text('bio'),
    collegeName: text('college_name'),
    password: text('password'),
    role: USER_ROLE('role').notNull().default('student'), 
    googleId: text('google_id').unique(),
    socialLinks: jsonb('social_links'),
    // YouTube OAuth integration
    youtubeChannelId: text('youtube_channel_id').unique(),
    youtubeChannelTitle: text('youtube_channel_title'),
    youtubeAccessToken: text('youtube_access_token'),
    youtubeRefreshToken: text('youtube_refresh_token'),
    youtubeTokenExpiry: timestamp('youtube_token_expiry'),
    youtubeConnectedAt: timestamp('youtube_connected_at'),
    // Gemini API key for lesson chat features (stored as text; consider encrypting at rest)
    geminiApiKey: text('gemini_api_key'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});


