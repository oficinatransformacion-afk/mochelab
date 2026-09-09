ALTER TABLE "app_user"
  ADD COLUMN "password_hash" VARCHAR(255),
  ADD COLUMN "password_changed_at" TIMESTAMPTZ(3);
