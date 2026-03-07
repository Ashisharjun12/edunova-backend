CREATE INDEX "idx_chat_messages_conv_read_role" ON "chat_messages" USING btree ("conversation_id","is_read","sender_role");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_conv_created" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_teacher_lastmsg" ON "conversations" USING btree ("teacher_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_student_lastmsg" ON "conversations" USING btree ("student_id","last_message_at");