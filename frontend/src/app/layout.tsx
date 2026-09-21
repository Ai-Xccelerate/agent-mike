import "./globals.css";
import "flatpickr/dist/flatpickr.css";
import { ClerkProvider } from "@clerk/nextjs";
import LiquidBackdrop from "@/components/common/LiquidBackdrop";
import { DensityProvider } from "@/context/DensityContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ManagerAuthBridge } from "@/lib/manager-auth";

export const metadata = {
  title: "Agent Mike | Manager console",
  description: "Configure and operate Agent Mike.",
};

const noFlashTheme = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

function parseList(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const signInUrl = process.env.CLERK_SIGN_IN_URL;
  const signUpUrl = process.env.CLERK_SIGN_UP_URL;
  const coreAppUrl = process.env.NEXT_PUBLIC_CORE_APP_URL?.replace(/\/$/, "");
  const allowedRedirectOrigins = parseList(process.env.CLERK_ALLOWED_REDIRECT_ORIGINS);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="font-outfit">
        <LiquidBackdrop />
        <ClerkProvider
          signInUrl={signInUrl}
          signUpUrl={signUpUrl}
          afterSignOutUrl={coreAppUrl ? `${coreAppUrl}/login` : signInUrl}
          allowedRedirectOrigins={allowedRedirectOrigins}
        >
          <ManagerAuthBridge>
            <ThemeProvider>
              <DensityProvider>
                <SidebarProvider>{children}</SidebarProvider>
              </DensityProvider>
            </ThemeProvider>
          </ManagerAuthBridge>
        </ClerkProvider>
      </body>
    </html>
  );
}
