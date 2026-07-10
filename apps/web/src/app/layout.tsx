import './globals.css';
import "flatpickr/dist/flatpickr.css";
import LiquidBackdrop from '@/components/common/LiquidBackdrop';
import { DensityProvider } from '@/context/DensityContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata = {
  title: "Agent Mike | Support operations",
  description: "Manage Agent Mike, your Level 1 AI support specialist.",
};

// Set the theme class before first paint so there is no light→dark flash.
// Mirrors ThemeContext exactly (localStorage "theme", default light).
const noFlashTheme = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="font-outfit">
        <LiquidBackdrop />
        <ThemeProvider>
          <DensityProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </DensityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
