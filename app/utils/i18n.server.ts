import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  type Language,
} from "~/utils/i18n";

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");

    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function getRequestLanguage(request: Request): Language {
  const urlLanguage = new URL(request.url).searchParams.get("lang");

  if (isLanguage(urlLanguage)) {
    return urlLanguage;
  }

  const cookieLanguage = getCookieValue(
    request.headers.get("Cookie"),
    LANGUAGE_STORAGE_KEY,
  );

  return isLanguage(cookieLanguage)
    ? cookieLanguage
    : DEFAULT_LANGUAGE;
}
