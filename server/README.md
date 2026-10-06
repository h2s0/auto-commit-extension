# GitHub 로그인 — 개발자/배포자 설정

설치한 사용자는 **GitHub 연결 → 로그인·권한 승인 → 저장소 선택 → 연결하고 시작하기**만 수행합니다. 사용자에게 PAT 생성이나 GitHub Settings 방문을 요구하지 않습니다.

이 로그인 서비스를 제공하는 개발자는 GitHub OAuth App을 한 번 등록하고 인증 코드 교환 서버를 실행해야 합니다. 이 저장소에는 아직 실제 등록된 OAuth Client ID/서버 주소가 없습니다. 설정이 없는 빌드에서는 로그인 버튼이 실제 인증을 완료할 수 없으며, 해당 오류를 화면에 표시합니다.

GitHub의 web authorization code flow에는 client secret이 필요합니다. secret은 확장 프로그램에 넣지 않고 이 서버의 환경변수로만 관리합니다. 서버는 OAuth 코드/토큰 교환만 처리하며 사용자의 풀이 코드를 받지 않습니다.

## 개발 환경 준비

1. `npm run oauth:info`로 callback URL을 확인합니다.
2. 개발자 GitHub 계정에서 OAuth App을 한 번 등록합니다. Authorization callback URL에 위 주소를 그대로 입력합니다.
3. `auth.config.example.json`을 `auth.config.json`으로 복사하고 앱의 공개 Client ID를 설정합니다. 개발 시 brokerUrl은 `http://127.0.0.1:8787`입니다.
4. `.env.oauth.example`을 `.env.oauth`로 복사하고 Client ID, Client Secret, callback URL을 설정합니다. 이 파일들은 Git에서 제외됩니다.
5. `npm run auth:dev`로 인증 서버를 실행합니다.
6. `npm run build` 후 Chrome에 dist를 설치하거나 다시 불러옵니다.
7. 확장 프로그램에서 **GitHub 연결**을 눌러 승인합니다. 개발자 도구를 제외하면 사용자가 토큰을 입력하는 화면은 없습니다.

기존 설치에는 manifest의 공개 key가 추가되어 확장 프로그램 ID가 바뀔 수 있습니다. 기존 확장을 제거한 뒤 dist를 다시 설치해야 하는 경우가 있으며, 이전 ID에 저장된 설정은 자동 이전되지 않습니다. 이후에는 key를 유지하여 ID를 고정합니다.

## 배포

인증 서버를 HTTPS로 배포하고 auth.config.json의 brokerUrl에 해당 서버 origin을 지정한 뒤 빌드합니다. 서버의 공개 주소와 GitHub 앱 설정은 설치한 사용자에게 요청하지 않습니다. 사용자가 localhost 인증 서버를 실행하게 하는 방식은 개발 테스트 전용입니다.

환경변수는 `.env.oauth.example`을 참고합니다. 서버는 기본적으로 loopback에 바인딩됩니다. 배포 시 서비스 구성에 맞춰 OAUTH_BIND를 지정하고 HTTPS reverse proxy 뒤에 두세요. callback URL은 manifest key와 Chrome Web Store의 최종 extension ID에 맞춰 검증해야 합니다.

state/PKCE 검증, 고정된 callback, 확장 프로그램 origin 제한, 요청 크기/빈도 제한, no-store 응답을 적용했습니다. 만료하는 OAuth 토큰은 refresh token으로 자동 갱신합니다. 갱신 권한도 만료되거나 사용자가 승인을 철회하면 다시 연결해야 합니다.

- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://developer.chrome.com/docs/extensions/reference/api/identity
