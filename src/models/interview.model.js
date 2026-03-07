import { text, uuid, jsonb, timestamp, pgTable } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { resumes } from "./resume.model.js";
import { interviewTypes } from "./interviewType.model.js";
import { jobs } from "./job.model.js";

export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  interviewerId: uuid('interviewer_id').references(() => users.id, { onDelete: 'set null' }), // For human interviews
  resumeId: uuid('resume_id').references(() => resumes.id, { onDelete: 'set null' }),
  interviewType: text('interview_type').notNull(), // 'ai_text_voice', 'ai_coding', 'human_to_human'
  interviewSubtypeId: uuid('interview_subtype_id').references(() => interviewTypes.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }), // Reference to admin-created job
  jobRole: text('job_role').notNull(), // Keep for backward compatibility
  jobDescription: text('job_description'),
  difficultyLevel: text('difficulty_level'), // 'easy', 'medium', 'hard'
  questionGenerationStatus: text('question_generation_status').default('pending'), // 'pending', 'generating', 'completed', 'failed'
  generatedQuestions: jsonb('generated_questions').default([]), // Array of question objects
  answers: jsonb('answers').default([]), // Array of answer objects
  codeSubmissions: jsonb('code_submissions'), // For coding interviews: code + test results
  vapiCallId: text('vapi_call_id'), // Vapi call ID for coding interviews
  webrtcRoomId: text('webrtc_room_id'), // WebRTC room ID for human interviews
  phoneNumber: text('phone_number'), // Phone number for telephonic interviews
  language: text('language'), // Language preference: 'hindi' or 'english'
  status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'cancelled'
  feedbackReport: jsonb('feedback_report'), // AI-generated or manual feedback
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});


