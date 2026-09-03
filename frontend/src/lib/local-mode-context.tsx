"use client";

import { createContext, useContext } from "react";

const LocalModeContext = createContext(false);

export function LocalModeProvider({
  bypass,
  children,
}: {
  bypass: boolean;
  children: React.ReactNode;
}) {
  return <LocalModeContext.Provider value={bypass}>{children}</LocalModeContext.Provider>;
}

export function useLocalBypass() {
  return useContext(LocalModeContext);
}
