import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/widget(.*)",
  "/api/v1/uploads/avatars(.*)",
  "/api/health",
]);

export default clerkMiddleware(
  async (auth, request) => {
    // Widget API calls remain public at Clerk and authenticate with their
    // organization-scoped site token in the worker backend.
    const isWidgetRequest = Boolean(
      request.headers.get("x-worker-site-token") ||
        request.headers.get("x-mike-site-token"),
    );
    if (!isPublicRoute(request) && !isWidgetRequest) {
      await auth.protect();
    }
  },
  {
    signInUrl: process.env.CLERK_SIGN_IN_URL,
    signUpUrl: process.env.CLERK_SIGN_UP_URL,
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
