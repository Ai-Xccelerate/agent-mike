"use client";

import type React from "react";
import { createContext, useState, useContext, useEffect } from "react";

export type Density = "default" | "comfortable" | "compact";

type DensityContextType = {
  density: Density;
  setDensity: (density: Density) => void;
};

const DensityContext = createContext<DensityContextType | undefined>(
  undefined
);

export const DensityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [density, setDensity] = useState<Density>("default");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("density") as Density | null;
    if (saved === "default" || saved === "comfortable" || saved === "compact") {
      setDensity(saved);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("density", density);
      document.documentElement.setAttribute("data-density", density);
    }
  }, [density, isInitialized]);

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
};

export const useDensity = () => {
  const context = useContext(DensityContext);
  if (context === undefined) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return context;
};
