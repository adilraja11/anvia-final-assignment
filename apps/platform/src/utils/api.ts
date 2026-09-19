import { hc } from "hono/client";
import type { AppType } from "../../../api/src/index";

const apiUrl = import.meta.env.VITE_API_URL?.trim();

if (!apiUrl) {
	throw new Error("VITE_API_URL is not configured.");
}

export const api = hc<AppType>(apiUrl);
