import { text, uuid, integer, jsonb, timestamp, pgTable } from "drizzle-orm/pg-core";
import { interviews } from "./interview.model.js";

export const interviewAnswers = pgTable('interview_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  interviewId: uuid('interview_id').references(() => interviews.id, { onDelete: 'cascade' }).notNull(),
  questionId: text('question_id').notNull(), // Reference to question in generatedQuestions array
  questionIndex: integer('question_index').notNull(),
  textAnswer: text('text_answer'),
  voiceAnswerUrl: text('voice_answer_url'), // ImageKit URL for audio
  transcription: text('transcription'), // Transcribed voice text
  voiceAnalysis: jsonb('voice_analysis'), // Tone, pace, clarity metrics
  codeAnswer: text('code_answer'), // For coding questions
  codeExecutionResult: jsonb('code_execution_result'), // Test results, output
  createdAt: timestamp('created_at').defaultNow(),
});


