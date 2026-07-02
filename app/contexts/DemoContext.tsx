"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { flattenFlow, type FlatStep } from "@/lib/demo-flow";

const STEPS = flattenFlow();
const FIRST_PAGE = STEPS[0].page;

type ExitMode = "app" | "register" | "real";

type DemoCtx = {
  isDemoMode: boolean;
  steps: FlatStep[];
  index: number;
  current: FlatStep | null;
  finalOpen: boolean;
  setFinalOpen: (v: boolean) => void;
  startDemo: () => void;
  next: () => void;
  back: () => void;
  goTo: (globalIndex: number) => void;
  returnToTour: () => void;
  exit: (mode?: ExitMode) => void;
  restart: () => void;
};

const Ctx = createContext<DemoCtx | null>(null);

export function useDemo(): DemoCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo must be used within DemoProvider");
  return c;
}

// Cookie читается middleware (edge) для доступа к /app/* без сессии в демо.
function setDemoCookie(on: boolean) {
  document.cookie = on
    ? "imo_demo=1; path=/; samesite=lax"
    : "imo_demo=; path=/; max-age=0; samesite=lax";
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [index, setIndex] = useState(0);
  const [finalOpen, setFinalOpen] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("demo") === "true";
    const fromStorage = sessionStorage.getItem("demoMode") === "true";
    if (fromUrl || fromStorage) {
      sessionStorage.setItem("demoMode", "true");
      setDemoCookie(true);
      setIsDemoMode(true);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("demo-active", isDemoMode);
    return () => document.body.classList.remove("demo-active");
  }, [isDemoMode]);

  const goTo = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(STEPS.length - 1, newIndex));
      const prevPage = STEPS[index]?.page;
      const nextPage = STEPS[clamped]?.page;
      setIndex(clamped);
      if (nextPage && nextPage !== prevPage) {
        router.push(`${nextPage}?demo=true`);
      }
    },
    [index, router],
  );

  const next = useCallback(() => {
    const cur = STEPS[index];
    if (cur?.action === "end-demo" || index >= STEPS.length - 1) {
      setFinalOpen(true);
      return;
    }
    goTo(index + 1);
  }, [index, goTo]);

  const back = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [index, goTo]);

  const startDemo = useCallback(() => {
    sessionStorage.setItem("demoMode", "true");
    setDemoCookie(true);
    setIsDemoMode(true);
    setIndex(0);
    setFinalOpen(false);
    router.push(`${FIRST_PAGE}?demo=true`);
  }, [router]);

  const restart = useCallback(() => {
    setFinalOpen(false);
    setIndex(0);
    router.push(`${FIRST_PAGE}?demo=true`);
  }, [router]);

  const returnToTour = useCallback(() => {
    const page = STEPS[index]?.page;
    if (page) router.push(`${page}?demo=true`);
  }, [index, router]);

  const exit = useCallback(
    (mode: ExitMode = "app") => {
      sessionStorage.removeItem("demoMode");
      setDemoCookie(false);
      setIsDemoMode(false);
      setIndex(0);
      setFinalOpen(false);
      router.push(mode === "register" ? "/register" : mode === "real" ? "/app/transactions/new" : "/app");
    },
    [router],
  );

  const current = isDemoMode ? STEPS[index] ?? null : null;

  return (
    <Ctx.Provider
      value={{ isDemoMode, steps: STEPS, index, current, finalOpen, setFinalOpen, startDemo, next, back, goTo, returnToTour, exit, restart }}
    >
      {children}
    </Ctx.Provider>
  );
}
