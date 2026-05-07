"use client";

import { ArrowLeft, ArrowRight, Home, Menu, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { MenuContainer, MenuItem } from "@/components/ui/fluid-menu";

type NavigationAction = "back" | "forward" | "reload" | "home";

type NavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
};

declare global {
  interface Window {
    desktopNavigation?: {
      isDesktopApp?: boolean;
      navigate: (action: NavigationAction) => Promise<NavigationState>;
      onStateChange: (callback: (state: NavigationState) => void) => () => void;
    };
  }
}

const initialState: NavigationState = {
  canGoBack: false,
  canGoForward: false,
};

function detectDesktopApp() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return Boolean(
    window.desktopNavigation?.isDesktopApp ||
      window.desktopNavigation ||
      navigator.userAgent.toLowerCase().includes("electron") ||
      params.get("__desktop") === "1" ||
      document.documentElement.classList.contains("desktop-app-shell"),
  );
}

export function DesktopNavigationBar() {
  const [isDesktopApp, setIsDesktopApp] = useState(detectDesktopApp);
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const navigation = window.desktopNavigation;
    const shouldUseDesktopShell = detectDesktopApp();

    if (!shouldUseDesktopShell) {
      return;
    }

    queueMicrotask(() => setIsDesktopApp(true));
    document.documentElement.classList.add("desktop-app-shell");
    const unsubscribe = navigation?.onStateChange(setState);

    return () => {
      unsubscribe?.();
      document.documentElement.classList.remove("desktop-app-shell");
    };
  }, []);

  if (!isDesktopApp) {
    return null;
  }

  const navigate = async (action: NavigationAction) => {
    const nextState = await window.desktopNavigation?.navigate(action);
    if (nextState) {
      setState(nextState);
      return;
    }

    if (action === "back") {
      window.history.back();
    }
    if (action === "forward") {
      window.history.forward();
    }
    if (action === "reload") {
      window.location.reload();
    }
    if (action === "home") {
      window.location.assign("/");
    }
  };

  return (
    <div className="fixed bottom-5 left-5 z-[1000]" role="toolbar" aria-label="Desktop navigation">
      <MenuContainer>
        <MenuItem
          title="Menu"
          icon={
            <div className="relative h-6 w-6">
              <div className="absolute inset-0 origin-center opacity-100 transition-all duration-300 ease-in-out [div[data-expanded=true]_&]:rotate-180 [div[data-expanded=true]_&]:scale-0 [div[data-expanded=true]_&]:opacity-0">
                <Menu size={24} strokeWidth={1.7} />
              </div>
              <div className="absolute inset-0 origin-center -rotate-180 scale-0 opacity-0 transition-all duration-300 ease-in-out [div[data-expanded=true]_&]:rotate-0 [div[data-expanded=true]_&]:scale-100 [div[data-expanded=true]_&]:opacity-100">
                <X size={24} strokeWidth={1.7} />
              </div>
            </div>
          }
        />
        <MenuItem
          icon={<ArrowLeft size={22} strokeWidth={1.8} />}
          onClick={() => navigate("back")}
          disabled={!state.canGoBack}
          title="Back"
        />
        <MenuItem
          icon={<ArrowRight size={22} strokeWidth={1.8} />}
          onClick={() => navigate("forward")}
          disabled={!state.canGoForward}
          title="Forward"
        />
        <MenuItem
          icon={<RotateCw size={21} strokeWidth={1.8} />}
          onClick={() => navigate("reload")}
          title="Refresh"
        />
        <MenuItem
          icon={<Home size={21} strokeWidth={1.8} />}
          onClick={() => navigate("home")}
          title="Home"
        />
      </MenuContainer>
    </div>
  );
}
