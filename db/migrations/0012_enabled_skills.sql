ALTER TABLE "worker_profiles" ADD COLUMN "enabled_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
