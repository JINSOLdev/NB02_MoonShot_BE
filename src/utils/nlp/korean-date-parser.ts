export function parseKoreanDate(text: string): Date | undefined {
  const now = new Date();
  const d = new Date(now);

  if (/내일/.test(text)) d.setDate(d.getDate() + 1);
  else if (/모레/.test(text)) d.setDate(d.getDate() + 2);
  else if (/오늘/.test(text)) {
    /* same day */
  } else if (/이번주|다음주/.test(text)) {
    // 간단 처리: 다음주 월요일 9시 같은 추가 규칙은 이후 확장
  } else {
    // 파싱 실패 → undefined
    return undefined;
  }

  const h = text.match(/(오전|오후)\s?(\d{1,2})시/);
  if (h) {
    let hour = Number(h[2]) % 12;
    if (h[1] === '오후') hour += 12;
    d.setHours(hour, 0, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0); // 기본 9시
  }

  return d;
}
