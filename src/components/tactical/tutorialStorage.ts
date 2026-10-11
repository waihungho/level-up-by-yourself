const TUTORIAL_KEY = "tactical_tutorial_seen";

export function readTutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    // storage unavailable (private mode / WebView restrictions): tutorial just shows again
  }
}
