import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { assertLocalBypassSafe, isLocalUnauthEnabled } from "@/lib/local-mode";

assertLocalBypassSafe();

const isPublicRoute = createRouteMatcher(["/api/(.*)", "/widget(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isLocalUnauthEnabled()) return;
    if (!isPublicRoute(req)) {
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
