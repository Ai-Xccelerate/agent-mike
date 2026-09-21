/**
 * Backward-compatible Mike API alias. New Foundation clients use `/worker`;
 * existing Mike consumers may continue to use `/agent` during the migration.
 */
export { GET, PATCH, dynamic } from "@/app/api/v1/worker/route";
