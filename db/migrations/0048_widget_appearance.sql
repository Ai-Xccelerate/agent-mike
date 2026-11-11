-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots (drizzle-kit would try to
-- recreate every table since 0014).

-- How the website chat looks: theme, corner roundness, launcher icon and the
-- panel's title and subtitle (lib/widget-appearance.ts). null = the defaults.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "widget_appearance" jsonb;
