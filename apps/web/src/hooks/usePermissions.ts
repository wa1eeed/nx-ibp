"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type PermAction = "access" | "create" | "edit" | "delete" | "revert";
type Perms = Record<string, Partial<Record<PermAction, boolean>>>;

// كاش على مستوى الوحدة: تُحمَّل صلاحيات المستخدم من /auth/me مرّة واحدة وتُشارَك عبر كل المكوّنات.
let _cache: Perms | null = null;
let _inflight: Promise<Perms> | null = null;

function loadPerms(): Promise<Perms> {
  if (_cache) return Promise.resolve(_cache);
  if (!_inflight) {
    _inflight = api<{ permissions?: Perms }>("/auth/me")
      .then((m) => { _cache = m.permissions ?? {}; return _cache; })
      .catch(() => { _inflight = null; return {} as Perms; });
  }
  return _inflight;
}

/** يُفرَّغ عند تسجيل الخروج/تبديل المستخدم كي لا تتسرّب صلاحيات مستخدم لآخر. */
export function clearPermsCache(): void {
  _cache = null;
  _inflight = null;
}

/**
 * صلاحيات المستخدم الحالي (BUED المزدوج: نفس مصفوفة الخادم). يُرجِع `can(module, action)`.
 * أثناء التحميل `ready=false` و`can` تُرجِع false ⇒ الأزرار مخفية حتى التأكّد (لا وميض أزرار غير مُصرّح بها).
 */
export function usePermissions() {
  const [perms, setPerms] = useState<Perms | null>(_cache);
  useEffect(() => {
    let live = true;
    void loadPerms().then((p) => { if (live) setPerms(p); });
    return () => { live = false; };
  }, []);
  const can = (module: string, action: PermAction = "access") => perms?.[module]?.[action] === true;
  return { perms, can, ready: perms !== null };
}
