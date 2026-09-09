export const DEMO_SESSION_KEY = "mochelab_demo_session";
export const DEMO_PROFILE_KEY = "mochelab_demo_profile";
export const DEMO_EMAIL_KEY = "mochelab_demo_email";
export const SESSION_TOKEN_KEY = "mochelab_session_token";

export type DemoProfile = "USUARIO" | "ADMIN" | "SYSTEM";

export function hasDemoSession() {
  return sessionStorage.getItem(DEMO_SESSION_KEY) === "active";
}

export function startDemoSession(profile: DemoProfile, email: string, token?:string) {
  sessionStorage.setItem(DEMO_SESSION_KEY, "active");
  sessionStorage.setItem(DEMO_PROFILE_KEY, profile);
  sessionStorage.setItem(DEMO_EMAIL_KEY, email.trim().toLowerCase());
  if(token) sessionStorage.setItem(SESSION_TOKEN_KEY,token);
}

export function endDemoSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
  sessionStorage.removeItem(DEMO_PROFILE_KEY);
  sessionStorage.removeItem(DEMO_EMAIL_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}
