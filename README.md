# LeetCode GitHub Sync

LeetCode 제출을 개인/스터디 GitHub 저장소에 함께 자동 저장하는 Manifest V3 + strict TypeScript Chrome Extension입니다. 사용자 인증은 GitHub 로그인·권한 승인 흐름입니다. OAuth 코드 교환용 최소 서버가 포함되어 있습니다. 실제 OAuth 앱/서버 설정은 아직 등록되어 있지 않습니다.

## 설치

Node.js 24 이상에서 실행합니다. 빌드와 테스트는 외부 패키지 설치 없이 동작합니다.

```sh
npm run build
npm test
# TypeScript 개발 의존성을 설치한 뒤 타입 검사:
npm install
npm run typecheck
```

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드**를 누릅니다.
3. 이 프로젝트의 `dist/` 폴더를 선택합니다.
4. **GitHub 연결**을 누르고 GitHub 로그인·권한 승인을 완료합니다. 배포자의 OAuth 앱/서버가 설정된 빌드에서 사용할 수 있습니다. 현재 소스의 개발자 설정은 [server/README.md](server/README.md)를 참고하세요.
5. **저장소 연결하기**를 누르고 접근 가능한 저장소 목록에서 선택합니다. 새 비공개 저장소도 확장 프로그램 안에서 만들 수 있습니다. **저장 대상 추가**로 개인/공용 저장소를 함께 선택할 수 있습니다.
6. 브랜치 목록에서 **main** 또는 개인 브랜치를 선택합니다. **내 이름 브랜치 사용**으로 GitHub 계정 이름의 브랜치를 선택하거나 생성할 수 있습니다. 다른 이름과 URL 직접 입력은 추가 설정 안에 있습니다. 저장소에는 초기 README 등 적어도 하나의 커밋이 있어야 합니다.
7. **자동 커밋**을 켜고 **연결하고 시작하기** 또는 **설정 저장**을 누릅니다. 버튼 주변에 저장 중/완료/오류가 표시됩니다.
8. 이미 열려 있던 LeetCode 탭은 새로고침합니다.
9. Two Sum 문제를 풀고 Submit합니다. Accepted가 되면 각 대상의 커밋 결과를 확인합니다. **틀린 답과 실행 오류도 저장**을 켜면 실패한 Submit 결과도 저장합니다. Run 버튼은 어느 설정에서도 저장하지 않습니다.

코드를 변경하고 다시 빌드한 경우 확장 프로그램을 reload한 뒤 LeetCode 탭도 새로고침하세요.


## 개인 저장소 + 스터디 저장소 설정 예시

| 저장소 URL | 브랜치 입력 | 실제 저장 브랜치 |
| --- | --- | --- |
| `https://github.com/heesae/leetcode` | 비움 | `main` |
| `https://github.com/study/solutions` | `heesae` | `heesae` |

두 대상을 등록하고 설정을 저장하면 한 Submit 결과가 두 저장소에 각각 커밋됩니다. 별도의 로컬 push 작업은 없으며 GitHub 브랜치 ref를 직접 업데이트합니다. 공용 저장소에는 사용자 계정의 쓰기 권한이 필요합니다.

fine-grained PAT는 소유자 하나로 범위가 제한되며, 다른 사람의 개인 저장소/외부 협업자 저장소에서는 지원 제한이 있습니다. 대상별 토큰을 사용하거나 해당 협업 환경에서 지원되는 classic PAT를 사용해야 할 수 있습니다. [GitHub 토큰 종류와 제한](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)을 확인하세요. 대상별 토큰을 비우면 연결된 공통 토큰을 사용합니다. 이미 저장한 대상별 토큰은 빈 입력으로 유지되며, **저장한 대상별 토큰 해제**를 체크하고 저장하면 지울 수 있습니다. **연결 해제**는 모든 인증 토큰을 제거합니다.

오답 저장을 켠 경우:

```text
LeetCode/0001-two-sum/
├── solution.py                 # Accepted 풀이
├── README.md
└── attempts/
    └── 123456789/              # 실패 제출 ID
        ├── solution.py
        └── README.md           # Wrong Answer 등 실제 결과 표시
```

기존 단일 대상 설정도 그대로 읽어옵니다. 이번 버전부터 빈 브랜치 이름은 저장소의 기본 브랜치와 상관없이 `main`입니다. 기본 브랜치가 `master`이면 브랜치 입력란에 `master`를 지정하세요.

## 구현한 동작

- 실제 Submit 요청의 코드와 언어를 제출 시점 snapshot으로 보관
- Submit 응답 ID와 같은 ID의 결과 polling을 연결
- 기본은 `state: SUCCESS`, `status_code: 10`, `status_msg: Accepted`를 모두 확인한 제출만 자동 업로드
- 오답 저장 옵션을 켜면 Wrong Answer, Runtime Error, Compile Error, 시간/메모리/출력 제한 초과 제출도 별도 attempts 폴더에 저장
- fetch와 XMLHttpRequest 모두 관찰하고 원래 요청/응답은 보존
- Run Code, 진행 중 제출, 추적하지 않은 과거 제출 결과는 제외
- 최대 10개 저장소/브랜치 대상으로 동시에 저장 설정 가능; 중복 처리는 대상별로 독립적
- 한 대상 실패 시에도 다른 대상을 계속 저장하고 실패 대상만 재시도
- 문제 메타데이터는 관찰된 GraphQL 응답을 캐시하고, 현재 페이지의 번호/제목 링크를 활용하며, 부족하면 최소 GraphQL 조회
- 코드와 README를 Git Data API로 하나의 커밋에 저장
- 기존 파일 업데이트, 언어별 확장자, README/Runtime/Memory 옵션
- 반복 polling 및 bridge replay 중복 제거, 서비스 워커 재시작 후에도 submission ID 중복 방지
- 파일 내용이 동일하면 추가 커밋 생략
- 실패 업로드를 로컬에 보관하고 popup에서 재시도; 설정이 바뀌어도 원래 업로드 대상 유지
- 자동 커밋 ON/OFF 및 오답 저장 옵션, 대상별 popup 상태/커밋 링크, 페이지 알림, 성공/부분 실패 badge
- 토큰은 background에서만 사용하고 Chrome storage 접근은 trusted extension context로 제한

기본 저장 구조:

```text
LeetCode/
└── 0001-two-sum/
    ├── solution.py
    └── README.md
```

Python/Python3, Java, C/C++, C#, JavaScript, TypeScript, Go, Rust, Kotlin, Swift, Ruby, PHP를 지원합니다. 알 수 없는 언어는 `.txt`로 저장합니다. README에는 최소 메타데이터와 원문 링크만 넣습니다.

## 직접 확인할 시나리오

1. **content script**: Two Sum 페이지를 열고 popup 연결 진단의 `slug: two-sum`을 확인합니다.
2. **자동 업로드**: Python3 Accepted 후 solution.py와 README가 같은 커밋에 있는지 확인합니다.
3. **제출 snapshot**: Submit 직후 에디터를 수정해도 커밋에는 실제 제출한 코드가 들어가야 합니다.
4. **중복**: 같은 결과를 반복 표시하거나 확장 프로그램을 reload해도 동일 submission의 새 커밋이 없어야 합니다.
5. **업데이트**: 새 제출 ID로 수정된 풀이를 Accepted하면 Update 커밋이 생성되어야 합니다.
6. **JavaScript**: JavaScript Accepted는 solution.js로 저장되어야 합니다.
7. **실패 제출**: 오답 저장 OFF에서는 Wrong Answer/Runtime Error로 커밋이 생기지 않아야 합니다. ON에서는 attempts 폴더에 저장하고 기존 정답 풀이를 보존해야 합니다. Run Code는 항상 제외합니다.
8. **설정 유지**: 확장 프로그램 reload 후에도 설정과 인증 상태가 유지되어야 합니다.
9. **GitHub 오류**: GitHub 접근을 차단하고 Accepted하면 실패가 표시되고, 연결 복구 후 popup의 재시도로 저장되어야 합니다.
10. **자동 커밋 OFF**: OFF 상태에서 Accepted해도 GitHub 요청이 없어야 합니다.

브랜치가 동시에 변경되면 강제 업데이트하지 않고 실패합니다. 재시도하면 최신 브랜치에서 다시 처리합니다. 제출 결과를 2분 동안 확인하지 못하면 감지 실패를 표시합니다. 페이지를 닫거나 새로고침하면 아직 결과가 나오지 않은 제출의 페이지 추적은 중단됩니다. 이미 background로 전달된 실패 업로드는 확장 프로그램 재시작 후에도 재시도할 수 있습니다.

## 테스트와 검증 범위

`npm test`는 다음을 검증합니다.

- fetch Request body 소비 전 snapshot 및 XHR 관찰
- 원래 fetch promise/response 보존, 관련 없는 요청 제외, bridge replay
- Accepted ID 매칭, 제출 이후 코드 변경, polling 순서 역전, 연속 제출
- 실패 제출, Run Code, ID/문제/Accepted 필드 불일치, 메타데이터 오류, 결과 timeout
- 언어별 파일 경로, README 설정, 안전한 경로 검사
- 실제 background 메시지 핸들러와 mock Chrome storage/GitHub 응답을 연결한 자동 업로드 통합 테스트
- 한 커밋에 두 파일 포함, `force: false`, background 재시작 후 중복 제거
- 자동 커밋 OFF, 영속 실패 큐와 재시도, 토큰/설정의 페이지 접근 차단
- 개인 main + 공용 개인 브랜치 동시 저장, 부분 실패 후 실패 대상만 재시도
- 오답 저장 ON/OFF, 정답 코드 보존, 대상별 인증 토큰 적용과 노출 방지

현재 50개 테스트, strict TypeScript 소스 검사, 빌드가 통과했습니다. 실제 로그인 계정에서의 LeetCode Submit과 GitHub 쓰기는 아직 검증하지 않았습니다. 이 환경의 브라우저 실행 및 네트워크 제약으로 실제 DOM/Network 전체 흐름을 직접 녹화하지 못했습니다.

## LeetCode adapter 근거와 유지보수

LeetCode 내부 API는 공식 public 계약이 아닙니다. 현재 접근 가능한 [Two Sum 페이지](https://leetcode.com/problems/two-sum/)의 문제 번호/제목을 확인했고, 공개 클라이언트 [leetgo의 요청 구현](https://github.com/j178/leetgo/blob/master/leetcode/client.go)에서 Submit payload, submission ID, check 경로 및 문제 GraphQL 필드를 확인했습니다. 이는 로그인 세션에서 최신 Submit 흐름을 직접 관찰했다는 뜻은 아닙니다. 따라서 실행 시 실제 응답을 엄격히 검증하고 형식이 다르면 오류를 표시합니다.

LeetCode parsing은 `src/content/leetcode.ts`에 격리되어 있습니다. MAIN world bridge인 `src/injected/network-bridge.ts`는 다음 경로의 실제 페이지 요청만 관찰합니다.

```text
POST /problems/{slug}/submit/
GET  /submissions/detail/{submissionId}/check/
POST /graphql/
```

bridge가 content module보다 먼저 실행될 수 있으므로 최근 이벤트를 replay하고 event ID로 중복을 제거합니다. 외부 코드, 에디터 private API, 페이지 전체 Accepted 텍스트 검색을 사용하지 않습니다. 비밀번호, 쿠키, 인증 헤더, 요청 query string을 읽거나 보관하지 않습니다. 자동 저장에 필요한 제출 코드와 최소 결과/문제 메타데이터만 전달합니다. popup 진단에는 경로/메서드/HTTP 상태만 표시합니다.

사이트 변경이 의심되면 DevTools Network에서 실제 Submit 요청의 코드/언어, 응답 ID, 해당 ID의 check 결과, Accepted 필드 및 메타데이터를 확인하고 adapter와 fixture 테스트를 함께 갱신하세요.

## 개발용 수동 검증

popup의 **개발용 수동 업로드**에는 실제 제출을 아래 형식으로 입력할 수 있습니다. 실패 제출은 `accepted: false`, 실제 `statusCode`와 `statusMessage`를 함께 지정해야 하며, 오답 저장 옵션이 켜져 있어야 합니다. 자동 흐름에는 이 작업이 필요하지 않습니다.

```json
{
  "submissionId": "123456789",
  "accepted": true,
  "problem": {
    "frontendId": "1",
    "title": "Two Sum",
    "titleSlug": "two-sum",
    "difficulty": "Easy",
    "url": "https://leetcode.com/problems/two-sum/"
  },
  "language": "python3",
  "code": "class Solution:\n    pass\n",
  "runtime": "42 ms",
  "memory": "18.3 MB"
}
```

## 후속 배포 작업

OAuth 로그인 코드와 인증 서버가 구현되어 있습니다. 실제 GitHub OAuth App 등록, 인증 서버 배포 및 Chrome Web Store 배포는 아직 완료하지 않았습니다. 토큰/풀이 코드는 GitHub 외의 외부 서버에 전송하지 않습니다. 로컬 저장값은 Chrome의 암호화 vault가 아니므로 확장 프로그램을 제거하거나 연결 해제해 관리할 수 있습니다.

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [GitHub Git references](https://docs.github.com/en/rest/git/refs)
- [개발 명세](leetcode-automatic-commit-extension-spec.md)

## 연결 UX와 설정 저장

백준허브의 계정 인증 → 저장소 연결/생성 → 시작 흐름을 참고했습니다. popup은 연결 상태와 자동 저장 옵션만 표시하고, 저장소 선택은 options 화면에서 진행합니다. 저장 대상은 기본적으로 목록 선택이며 URL/토큰 수동 입력과 진단은 추가/개발자 설정에 있습니다. 저장 시 사용자 입력을 직접 검증하고, 버튼 옆 상태 및 상단 알림을 표시하며 Chrome storage에서 실제 저장값을 다시 확인합니다. 느린 업로드/인증 작업이 설정 저장 응답을 막지 않도록 메시지 처리를 분리했습니다.
