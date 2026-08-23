let signOutHandler: (() => Promise<void>) | null = null;

export function setAuth0SignOutHandler(handler: (() => Promise<void>) | null) {
  signOutHandler = handler;
}

export async function runAuth0SignOut() {
  if (signOutHandler) await signOutHandler();
}
