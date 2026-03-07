import {  text, uuid, timestamp, uniqueIndex ,varchar,integer, pgTable, jsonb } from "drizzle-orm/pg-core";
import { images } from "./document.model.js";



export const colleges=pgTable('colleges',{
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    location:varchar('location',{length:100}),
    LogoId: uuid('logo_id').references(() => images.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
})


export const branches = pgTable('branches', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 10 }).notNull().unique(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
  });



  export const semesters = pgTable('semesters', {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    semesterNumber: integer('semester_number').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  }, (table) => [
    uniqueIndex('branch_semester_unique').on(table.branchId, table.semesterNumber),
  ]
  );



  // Subjects table
export const subjects = pgTable('subjects', {
    id: uuid('id').primaryKey().defaultRandom(),
    semesterId: uuid('semester_id').references(() => semesters.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
  }, (table) => [
    uniqueIndex('semester_subject_unique').on(table.semesterId, table.code),
  ]
  );

  