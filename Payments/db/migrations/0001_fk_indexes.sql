CREATE INDEX "subscription_slots_payment_id_idx" ON "subscription_slots" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "transactions_payment_id_idx" ON "transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "transactions_slot_id_idx" ON "transactions" USING btree ("slot_id");