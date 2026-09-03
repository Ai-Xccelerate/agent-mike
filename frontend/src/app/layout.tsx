import "./globals.css";
import "flatpickr/dist/flatpickr.css";
import { ClerkProvider } from "@clerk/nextjs";
import LiquidBackdrop from "@/components/common/LiquidBackdrop";
import { DensityProvider } from "@/context/DensityContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LocalModeProvider } from "@/lib/local-mode-context";
import { assertLocalBypassSafe, isLocalUnauthEnabled } from "@/lib/local-mode";
import { MikeAuthBridge } from "@/lib/mike-auth";

export const metadata = {
  title: "Agent Mike | Support operations",
  description: "Manage Agent Mike, your Level 1 AI support specialist.",
};

const noFlashTheme = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function AppProviders({
  children,
  bypass,
}: {
  children: React.ReactNode;
  bypass: boolean;
}) {
  return (
    <LocalModeProvider bypass={bypass}>
      <MikeAuthBridge>
        <ThemeProvider>
          <DensityProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </DensityProvider>
        </ThemeProvider>
      </MikeAuthBridge>
    </LocalModeProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  assertLocalBypassSafe();
  const bypass = isLocalUnauthEnabled();
  const signInUrl = process.env.CLERK_SIGN_IN_URL;
  const signUpUrl = process.env.CLERK_SIGN_UP_URL;
  const coreApp = process.env.NEXT_PUBLIC_CORE_APP_URL?.replace(/\/$/, "");
  const allowedRedirectOrigins = parseList(process.env.CLERK_ALLOWED_REDIRECT_ORIGINS);

  const tree = <AppProviders bypass={bypass}>{children}</AppProviders>;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="font-outfit">
        <LiquidBackdrop />
        {bypass ? (
          tree
        ) : (
          <ClerkProvider
            signInUrl={signInUrl}
            signUpUrl={signUpUrl}
            afterSignOutUrl={coreApp ? `${coreApp}/login` : signInUrl}
            allowedRedirectOrigins={allowedRedirectOrigins}
          >
            {tree}
          </ClerkProvider>
        )}
      </body>
    </html>
  );
}
