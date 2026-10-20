/* ============================================================
   발자국 🐾 · 사이트 설정
   ------------------------------------------------------------
   여기 두 줄만 채우면 실제 데이터베이스에 연결됩니다.
   (안 채우면 '체험 모드'로 내 브라우저에만 저장되면서 그대로 동작합니다)

   1. https://supabase.com 가입 → New project
   2. SQL Editor 에 supabase/schema.sql 붙여넣고 Run
   3. Project Settings → API 에서 아래 두 값 복사

   ★ 비밀번호는 이 파일에 두지 않습니다.
     이 파일은 사이트에 들어온 누구나 열어볼 수 있어서,
     여기 적는 순간 비밀번호가 아니게 됩니다.
     운영진은 카카오로 로그인해서 들어옵니다 (admin.html).
   ============================================================ */

window.CONFIG = {
  // ① Project URL  (예: 'https://abcdefgh.supabase.co')
  SUPABASE_URL: 'https://qgosyeqaxuxejathpkgd.supabase.co',

  // ② publishable key (공개되어도 안전한 키입니다. RLS 가 막아줍니다)
  SUPABASE_ANON_KEY: 'sb_publishable_XcdlWyuV0ywCfqJIRpWVHA_zCXs6HT7',

  // 비상 로그인에 쓰는 공유 계정 이메일.
  // 평소에는 안 씁니다. 카카오 로그인이 막혔을 때만 admin.html 맨 아래
  // 「비상 로그인」에서 이메일·비밀번호를 그때그때 직접 입력합니다.
  ADMIN_EMAIL: 'unyoung@baljaguk.club',

  // 알림(웹 푸시)에 쓰는 공개 키.
  // 비워 두면 알림 기능이 화면에 안 나옵니다 (나머지는 그대로 동작).
  //
  //  만드는 법 — 아무 곳에서나 한 번만:
  //    npx web-push generate-vapid-keys
  //  나온 Public Key 를 여기에, Private Key 는 Supabase 쪽에만 넣습니다.
  //    Edge Functions → Secrets 에 VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
  //
  //  ★ Private Key 는 이 파일에 절대 적지 않습니다.
  //    이 파일은 사이트에 들어온 누구나 열어볼 수 있습니다.
  VAPID_PUBLIC_KEY: 'BLeyjdc2tML3ZGZvYXdkZ22wuDCIQPIxJwmrj3WOcb3_NspX5iCBYmPKhMxlNTaCj_IuYOnFAIELgNEIi5NZxGA',

  // 설문(survey.html) 회차. 학기가 바뀌면 이 값만 바꾸면 응답이 새로 쌓입니다.
  SURVEY_TOPIC: '2026-2',

  // 연결 전에 보여줄 기본 동아리 정보
  FALLBACK: {
    club_name: '발자국',
    tagline: '유기견·유기묘 봉사 동아리',
    generation: '2기',
    department: '산업경영융합학과',
    notice: '',
    fee: 15000,
    bank: '우리은행',
    account: '1002964773832',
    holder: '노혜림',
    recruiting: true
  }
};
