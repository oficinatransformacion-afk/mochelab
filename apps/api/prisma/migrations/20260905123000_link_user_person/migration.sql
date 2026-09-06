ALTER TABLE "app_user" ADD COLUMN "person_id" UUID;

CREATE UNIQUE INDEX "app_user_person_id_key" ON "app_user"("person_id");

ALTER TABLE "app_user"
ADD CONSTRAINT "app_user_person_id_fkey"
FOREIGN KEY ("person_id") REFERENCES "person"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
