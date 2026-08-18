import { interfaceCopy, type InterfaceCopy, type InterfaceLanguage } from "@/lib/i18n";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

type LanguageContextValue = {
  interfaceLanguage: InterfaceLanguage;
  direction: "rtl" | "ltr";
  t: InterfaceCopy;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const LANGUAGE_STORAGE_KEY = "understand-interface-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "en" ? "en" : "ar";
  });
  const direction = interfaceLanguage === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const root = document.documentElement;
    root.lang = interfaceLanguage;
    root.dir = direction;
    root.dataset.interfaceLanguage = interfaceLanguage;
    localStorage.setItem(LANGUAGE_STORAGE_KEY, interfaceLanguage);
  }, [direction, interfaceLanguage]);

  return (
    <LanguageContext.Provider
      value={{
        interfaceLanguage,
        direction,
        t: interfaceCopy[interfaceLanguage],
        toggleLanguage: () => setInterfaceLanguage(current => (current === "ar" ? "en" : "ar")),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
