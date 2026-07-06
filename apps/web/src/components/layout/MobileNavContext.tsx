"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => undefined });

/** حالة درج التنقّل للموبايل — مشتركة بين الزر (Topbar) والدرج (Sidebar). */
export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export const useMobileNav = () => useContext(Ctx);
