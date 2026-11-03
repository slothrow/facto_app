// 아주 작은 해시 라우터. 주소 예: #/plan/2027-01, #/settings
// 페이지 3개뿐이라 라우터 라이브러리 없이 처리한다.
import { useEffect, useState } from 'react';

const parse = () =>
  window.location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean);

export function useHashRoute(): string[] {
  const [segments, setSegments] = useState(parse);
  useEffect(() => {
    const onChange = () => setSegments(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return segments;
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}
