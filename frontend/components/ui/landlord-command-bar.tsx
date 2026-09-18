"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface LandlordCommandBarConfig {
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchEnabled: boolean;
  readonly inventoryCount?: number;
  readonly occupancyRate?: number | null;
  readonly onCreate: () => void;
  readonly createPending: boolean;
}

interface LandlordCommandBarContextValue {
  readonly config: LandlordCommandBarConfig | null;
  readonly setConfig: (config: LandlordCommandBarConfig | null) => void;
}

const LandlordCommandBarContext = createContext<LandlordCommandBarContextValue | null>(null);

export function LandlordCommandBarProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [config, setConfig] = useState<LandlordCommandBarConfig | null>(null);
  const value = useMemo(() => ({ config, setConfig }), [config]);

  return <LandlordCommandBarContext.Provider value={value}>{children}</LandlordCommandBarContext.Provider>;
}

export function useLandlordCommandBar() {
  return useContext(LandlordCommandBarContext)?.config ?? null;
}

export function useRegisterLandlordCommandBar(config: LandlordCommandBarConfig | null) {
  const setConfig = useContext(LandlordCommandBarContext)?.setConfig;

  useEffect(() => {
    if (!setConfig) return;
    setConfig(config);
    return () => setConfig(null);
  }, [config, setConfig]);
}
