import { createContext, type RefObject } from "react";

export const Clock = createContext<RefObject<number>>({ current: 0 });
