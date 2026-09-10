"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";

type WorkerIdentityContextValue = {
  profile: WorkerProfile | null;
};

const WorkerIdentityContext = createContext<WorkerIdentityContextValue>({ profile: null });

export function WorkerIdentityProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);

  useEffect(() => {
    void apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);

    const update = (event: Event) => {
      const next = (event as CustomEvent<WorkerProfile>).detail;
      if (next) setProfile(next);
    };
    window.addEventListener(IDENTITY_UPDATED_EVENT, update);
    return () => window.removeEventListener(IDENTITY_UPDATED_EVENT, update);
  }, []);

  return <WorkerIdentityContext.Provider value={{ profile }}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity() {
  return useContext(WorkerIdentityContext).profile;
}
