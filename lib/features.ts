import { NextResponse } from "next/server";

/**
 * Features that are built but switched off until they have been tested properly. Off everywhere unless the server sets the
 * variable (staging can, prod does not), so a half-trusted feature never reaches a customer's team by accident.
 *
 * - cannedReplies  FEATURE_CANNED_REPLIES  approved wording the worker leads with, and its settings page
 * - testCases      FEATURE_TEST_CASES      saved test questions, replays and their scores, and the "Make test case" button
 */
export type Feature = "cannedReplies" | "testCases";

const VARIABLE: Record<Feature, string> = {
  cannedReplies: "FEATURE_CANNED_REPLIES",
  testCases: "FEATURE_TEST_CASES",
};

export function featureEnabled(feature: Feature): boolean {
  const value = (process.env[VARIABLE[feature]] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

export function featureFlags(): Record<Feature, boolean> {
  return { cannedReplies: featureEnabled("cannedReplies"), testCases: featureEnabled("testCases") };
}

/** The answer an API route gives for a switched-off feature: as if the route did not exist. */
export function featureOff(): NextResponse {
  return NextResponse.json({ error: "This feature is switched off." }, { status: 404 });
}
