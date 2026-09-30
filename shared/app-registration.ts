export function registrationSource(
  standalone: boolean,
  userAgent: string,
  touchPoints = 0,
) {
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && touchPoints > 1);
  return standalone && mobile ? "mobile_app" : "web";
}
