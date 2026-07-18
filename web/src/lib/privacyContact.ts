/** Privacy contact + controller identity for legal copy.

Set at build/deploy time (do not commit real values):

  VITE_PRIVACY_EMAIL=you@example.com
  VITE_CONTROLLER_NAME=Nom Cognom

Until both are set, the UI marks the contact as provisional.
*/
const emailFromEnv = (import.meta.env.VITE_PRIVACY_EMAIL ?? "").trim();
const controllerFromEnv = (import.meta.env.VITE_CONTROLLER_NAME ?? "").trim();

export const PRIVACY_EMAIL = emailFromEnv || "privacy@example.com";
export const PRIVACY_EMAIL_IS_PLACEHOLDER = !emailFromEnv;

/** Natural-person controller name shown in the privacy policy, if configured. */
export const CONTROLLER_NAME = controllerFromEnv || null;
export const CONTROLLER_NAME_IS_PLACEHOLDER = !controllerFromEnv;
