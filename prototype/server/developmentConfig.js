import { resolvePublicBaseUrl } from "./runtimeConfig.js";

const publicBaseUrl = resolvePublicBaseUrl();
if (publicBaseUrl) process.env.PUBLIC_BASE_URL = publicBaseUrl;
