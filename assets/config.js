/* ============================================================
   발자국 🐾 · 사이트 설정
   ------------------------------------------------------------
   여기 두 줄만 채우면 실제 데이터베이스에 연결됩니다.
   (안 채우면 '체험 모드'로 내 브라우저에만 저장되면서 그대로 동작합니다)

   1. https://supabase.com 가입 → New project
   2. SQL Editor 에 supabase/schema.sql 붙여넣고 Run
   3. Project Settings → API 에서 아래 두 값 복사
   4. Authentication → Users → Add user
        Email    : 아래 ADMIN_EMAIL 과 똑같이
        Password : 운영진 비밀번호 (기본 260324)
        Auto Confirm User 켜기
   ============================================================ */

window.CONFIG = {
  // ① Project URL  (예: 'https://abcdefgh.supabase.co')
  SUPABASE_URL: 'https://qgosyeqaxuxejathpkgd.supabase.co',

  // ② publishable key (공개되어도 안전한 키입니다. RLS 가 막아줍니다)
  SUPABASE_ANON_KEY: 'sb_publishable_XcdlWyuV0ywCfqJIRpWVHA_zCXs6HT7',

  // 운영진 로그인에 쓸 계정 이메일 (화면에는 안 보이고 비밀번호만 입력받습니다)
  ADMIN_EMAIL: 'unyoung@baljaguk.club',

  // 운영진 비밀번호 (Supabase Authentication 에서 만든 계정의 비밀번호와 같게)
  ADMIN_PASSWORD: '260324',

  // false = 운영진 주소로 들어오면 비밀번호 없이 바로 열림 (주소를 아는 사람만 온다는 전제)
  // true  = 들어올 때마다 비밀번호를 물어봄
  ADMIN_LOCK: false,

  // 체험 모드에서 쓰는 기본 운영진 비밀번호
  DEMO_PASSWORD: '260324',

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
