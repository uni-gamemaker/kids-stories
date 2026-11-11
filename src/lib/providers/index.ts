import type { ProviderId } from "../models";
import type { ProviderAdapter } from "./types";
import { kie } from "./kie";
import { cometapi } from "./cometapi";

export const adapters: Record<ProviderId, ProviderAdapter> = { kie, cometapi };
export type { ProviderAdapter, CheckResult } from "./types";
