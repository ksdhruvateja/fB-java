/** Homeowner-facing DIY safety copy — informational, not final legal advice. */

export const DIY_SAFETY_MODAL_TITLE = "Before You Start — DIY Safety";

export const DIY_CORE_PRODUCT_MESSAGE =
  "FixBridge uses AI to provide helpful, safety-conscious informational guidance based on the information available to the system. Because FixBridge cannot physically inspect your property, actual conditions may differ and AI-generated information may occasionally be incomplete or inaccurate. Only perform tasks you understand and can complete safely. Use appropriate precautions and never rely solely on AI for safety-critical decisions. If you are uncertain, uncomfortable, lack the proper tools or experience, encounter unsafe conditions, or simply prefer professional assistance, stop and request a qualified service professional through FixBridge.";

export const DIY_SAFETY_INTRO = [
  "FixBridge AI provides informational guidance based on the details, photos, and information you provide.",
  "We work to design and improve our AI systems to provide useful and safety-conscious guidance, but AI-generated information may occasionally be incomplete, inaccurate, or inappropriate for the actual conditions at your property.",
  "FixBridge cannot physically inspect your property or confirm that a particular task is safe for you to perform.",
  "Only perform steps you understand and can complete safely. Use appropriate tools and precautions.",
];

export const DIY_SAFETY_STOP_IF = [
  "the situation appears unsafe",
  "conditions differ from the AI assessment",
  "you do not understand the instructions",
  "you do not have the proper tools",
  "the task is beyond your experience",
  "you feel uncomfortable performing the work",
];

export const DIY_SAFETY_JUDGMENT_LABEL =
  "I understand that FixBridge AI guidance is informational and may not reflect the actual conditions at my property. I will use my own judgment, follow appropriate safety precautions, and stop if I am unsure or do not feel safe performing the task.";

export const DIY_SAFETY_ABILITY_LABEL =
  "I understand that I should not perform work beyond my experience, ability, tools, or comfort level and that I can request a professional through FixBridge instead.";

export const DIY_SESSION_REMINDER =
  "Follow only steps you can perform safely. Stop and request a professional whenever you are unsure.";

export const DIY_GUIDED_SAFETY_REMINDER =
  "Safety first — stop if anything looks unsafe, differs from the instructions, or is beyond your experience.";

export const DIY_STOP_PROFESSIONAL_LABEL = "Stop DIY & Get a Professional";

export const DIY_PROFESSIONAL_HANDOFF_MESSAGE =
  "We'll carry your issue details into the professional request so you don't have to start over.";

export const DIY_GREEN_PRO_OPTION =
  "Prefer professional help? Request a service professional instead.";

export function emergencyBannerCopy() {
  return {
    title: "Potential Emergency",
    body: "Stop DIY. If there is immediate danger, leave the area and contact the appropriate emergency service, utility, fire department, or other emergency authority. FixBridge is not a 911 service, fire department, gas utility, medical emergency service, or emergency-response provider.",
  };
}

export function riskStatusLabel(level: string) {
  const normalized = level.toLowerCase();
  if (normalized === "red") return "RED — Stop DIY / Professional Help";
  if (normalized === "yellow") return "YELLOW — Use Caution";
  return "GREEN — Guided DIY";
}
