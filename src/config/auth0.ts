const rawDomain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const rawClientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;

export const AUTH0_DOMAIN =
  typeof rawDomain === "string" && rawDomain.trim().length > 0 ? rawDomain.trim() : undefined;

export const AUTH0_CLIENT_ID =
  typeof rawClientId === "string" && rawClientId.trim().length > 0 ? rawClientId.trim() : undefined;

export const AUTH0_ENABLED = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);

export const AUTH0_ROLE_KEY = "fixbridge-auth0-role";
export const AUTH0_RETURN_KEY = "fixbridge-auth0-return";
