




LeetCode → GitHub 자동 커밋 Chrome Extension 개발 명세
1. 프로젝트 개요
LeetCode에서 사용자가 문제를 풀고 제출한 결과가 Accepted가 되면, 해당 풀이 코드를 자동으로 GitHub 저장소에 업로드하고 커밋하는 Chrome Extension을 개발한다.

백준/프로그래머스 풀이를 GitHub에 자동 저장하는 확장 프로그램과 유사한 사용자 경험을 목표로 한다.

핵심 사용자 흐름
사용자가 Chrome Extension을 설치한다.
GitHub 계정을 연결하고 저장소를 선택한다.
사용자가 LeetCode 문제 페이지에서 평소처럼 문제를 푼다.
Submit을 누른다.
제출 결과가 Accepted인지 감지한다.
Accepted인 경우 다음 정보를 수집한다.
문제 번호
문제 제목
titleSlug
난이도
문제 URL
사용 언어
제출 코드
가능한 경우 Runtime / Memory
GitHub 저장소에 문제별 폴더를 생성한다.
풀이 코드와 README.md를 저장한다.
자동으로 GitHub commit을 생성한다.
동일 문제를 다시 Accepted한 경우 기존 파일을 업데이트한다.
2. Chrome Extension에 대한 기본 이해
Chrome Extension은 일반 웹사이트와 비슷하게 HTML/CSS/JavaScript 기반으로 개발하지만, 실행 위치와 배포 방식이 다르다.

일반 웹사이트:

사용자
  ↓
https://example.com
  ↓
웹 서버
  ↓
HTML / CSS / JS
Chrome Extension:

Chrome
  ↓
설치된 Extension
  ├─ manifest.json
  ├─ popup
  ├─ content script
  ├─ service worker
  └─ assets
        ↓
LeetCode 페이지와 상호작용
Extension 자체는 반드시 별도의 웹 서버에서 페이지를 서비스할 필요가 없다.

개발 중에는 하나의 프로젝트 폴더를 Chrome의 Load unpacked 기능으로 직접 설치할 수 있다.

예:

leetcode-github-extension/
├── manifest.json
├── src/
│   ├── content/
│   ├── background/
│   ├── popup/
│   ├── options/
│   └── shared/
├── public/
└── package.json
빌드 도구를 사용하는 경우:

npm run build
후 생성되는:

dist/
├── manifest.json
├── assets/
├── popup.html
└── ...
폴더를 개발자 모드에서 Load unpacked로 불러온다.

일반 사용자에게 배포할 때는 Extension 빌드 결과물을 패키징하여 Chrome Web Store에 등록한다.

즉:

개발
소스코드 폴더
   ↓
npm run build
   ↓
dist/
   ↓
Chrome 개발자 모드 Load unpacked

배포
dist/
   ↓
zip
   ↓
Chrome Web Store 업로드
   ↓
Google 심사
   ↓
사용자가 Chrome Web Store에서 설치
사용자 관점에서는 프로그램 설치 파일을 직접 실행하는 것이 아니라 Chrome Web Store의 "Chrome에 추가" 버튼을 눌러 설치한다.

3. 어떤 언어로 개발하는가
Chrome Extension에서 실제로 Chrome 내부에서 실행되는 코드는 기본적으로 웹 기술을 사용한다.

필수 기반 기술:

HTML
CSS
JavaScript
권장:

TypeScript
React
React, Vue, Svelte 같은 프레임워크도 사용할 수 있지만 최종 빌드 결과는 HTML/CSS/JavaScript로 변환되어야 한다.

Python, Java, C# 등을 Chrome Extension의 content script나 service worker 자체의 실행 언어로 직접 사용할 수는 없다.

예를 들어:

가능
TypeScript → JavaScript 빌드 → Chrome 실행
React → JavaScript 빌드 → Chrome 실행
Vue → JavaScript 빌드 → Chrome 실행

불가능
content.py를 Chrome이 직접 실행
background.java를 Chrome이 직접 실행
다만 별도의 백엔드 서버가 필요한 서비스라면 서버는 Python, Go, Java, Node.js 등 어떤 언어로든 개발할 수 있다.

본 프로젝트의 MVP는 별도 백엔드 없이 구현하는 방향을 우선한다.

4. 권장 기술 스택
이 프로젝트는 다음 스택을 우선 사용한다.

Chrome Extension Manifest V3
TypeScript
React
Vite 또는 extension 개발에 적합한 빌드 구성
Chrome Extension APIs
GitHub REST API
LeetCode 페이지 DOM / 페이지 실행 컨텍스트
필요 최소한의 LeetCode GraphQL 사용
가능하다면 프레임워크 의존성을 과도하게 늘리지 않는다.

5. 중요한 구현 원칙
5.1 Manifest V3 사용
새 확장 프로그램은 Manifest V3 기준으로 작성한다.

주요 구성:

manifest.json
content script
background service worker
popup
options page
chrome.storage
message passing
5.2 LeetCode 내부 API 의존 최소화
LeetCode에는 일반 개발자를 위한 안정적인 공식 Public REST API가 제공되는 형태가 아니다.

LeetCode 웹사이트가 사용하는 GraphQL 및 내부 요청을 활용할 수 있지만, 구현은 가능한 한 특정 내부 API 구조에 강하게 종속되지 않도록 한다.

우선순위:

1. 현재 페이지에서 안정적으로 얻을 수 있는 데이터
2. 제출 과정에서 확실하게 얻을 수 있는 데이터
3. 필요한 경우에만 LeetCode GraphQL
LeetCode UI/API 변경으로 기능이 깨질 가능성을 고려하여 수집 코드를 모듈화한다.

6. 전체 아키텍처
┌───────────────────────────┐
│       LeetCode Page       │
│                           │
│  Problem + Code + Submit  │
└─────────────┬─────────────┘
              │
              │ Content Script
              ▼
┌───────────────────────────┐
│   Submission Detector     │
│                           │
│  - 문제 정보              │
│  - 제출 코드              │
│  - 제출 언어              │
│  - Accepted 여부          │
└─────────────┬─────────────┘
              │
              │ chrome.runtime.sendMessage
              ▼
┌───────────────────────────┐
│ Background Service Worker │
│                           │
│ - 설정 읽기               │
│ - 중복 처리               │
│ - GitHub API              │
└─────────────┬─────────────┘
              │
              │ HTTPS
              ▼
┌───────────────────────────┐
│        GitHub API         │
│                           │
│ Repository Contents API   │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│        GitHub Repo        │
│                           │
│ LeetCode/                 │
│  └─ 0001-two-sum/         │
│      ├─ solution.py       │
│      └─ README.md         │
└───────────────────────────┘
7. Chrome Extension 구성요소
7.1 manifest.json
Extension의 이름, 버전, 권한, content script, service worker 등을 정의한다.

예상 권한은 최소화한다.

예시 후보:

{
  "manifest_version": 3,
  "name": "LeetCode GitHub Sync",
  "version": "0.1.0",
  "permissions": [
    "storage",
    "identity"
  ],
  "host_permissions": [
    "https://leetcode.com/*",
    "https://api.github.com/*"
  ]
}
실제 필요한 권한만 남긴다.

7.2 Content Script
LeetCode 문제 페이지에서 동작한다.

역할:

현재 문제 식별
제출 이벤트 관찰
Accepted 결과 확인
사용자가 제출한 코드 확보
언어 확보
문제 메타데이터 확보
background service worker에 데이터 전달
content script는 GitHub 인증 토큰을 직접 다루지 않는 구조를 우선한다.

7.3 Page Bridge / Injected Script
LeetCode 페이지에서 실행되는 JavaScript와 content script는 실행 컨텍스트가 분리되어 있다.

LeetCode 애플리케이션 내부 상태 또는 fetch/XHR 결과 확인이 필요한 경우 별도의 injected script/page bridge를 사용할 수 있다.

예:

LeetCode page context
        ↓
window.postMessage()
        ↓
content script
        ↓
chrome.runtime.sendMessage()
        ↓
service worker
무리하게 React 내부 구조나 private object에 의존하지 않는다.

7.4 Background Service Worker
Manifest V3의 background 로직을 담당한다.

역할:

GitHub 인증 상태 관리
repository 설정 읽기
GitHub API 호출
파일 존재 여부 확인
신규 생성/업데이트 결정
commit 처리
결과 저장
에러 처리
7.5 Popup
Chrome 툴바의 Extension 아이콘을 클릭했을 때 보여주는 화면.

초기 MVP UI:

LeetCode GitHub Sync
────────────────────────

GitHub
● Connected as octocat

Repository
[ algorithm-solutions ▼ ]

Base Directory
[ LeetCode             ]

Auto Commit
[ ON ]

README
[✓] Create README

Status
Last sync:
0001. Two Sum ✓
로그인 전:

LeetCode GitHub Sync
────────────────────────

GitHub is not connected.

[ Connect GitHub ]
7.6 Options Page
세부 설정을 제공한다.

설정 후보:

GitHub repository
branch
base directory
폴더명 규칙
파일명 규칙
commit message 규칙
README 생성 여부
runtime/memory 포함 여부
동일 문제 재제출 처리 방식
8. Accepted 감지 전략
Accepted 감지가 프로젝트의 핵심이다.

한 가지 방식에 지나치게 의존하지 말고 감지 로직을 별도 adapter로 작성한다.

예:

interface SubmissionResult {
  accepted: boolean;
  submissionId?: string;
  language: string;
  code: string;
  runtime?: string;
  memory?: string;
}
권장 우선순위
방법 A. 제출 결과 데이터 감지
LeetCode가 제출 후 서버에서 받아오는 결과에서 Accepted 여부와 submission 정보를 확인할 수 있으면 이 방식을 우선 검토한다.

장점:

화면 텍스트보다 의미가 명확함
코드와 결과를 함께 연결하기 쉬움
단점:

LeetCode 내부 API가 변경될 가능성이 있음
Manifest V3 환경에서 네트워크 interception 방식에 제약이 있음
따라서 구현 전에 현재 LeetCode의 실제 submit 흐름을 DevTools Network에서 조사한다.

방법 B. DOM MutationObserver
제출 결과 UI에 Accepted가 표시되는 순간을 감지한다.

장점:

구현이 단순함
단점:

UI 구조 변경에 취약함
페이지 다른 곳의 "Accepted" 문자열을 오탐할 수 있음
단순히 document 전체에서 Accepted 문자열을 검색하지 말고 제출 결과 영역을 정확히 식별한다.

방법 C. 혼합 방식
최종적으로:

submission 발생
   ↓
해당 submission 추적
   ↓
결과 API 또는 결과 UI 확인
   ↓
Accepted
   ↓
현재 제출 코드와 매칭
방식을 목표로 한다.

9. 문제 정보 수집
필요 필드:

interface ProblemInfo {
  frontendId: string;
  title: string;
  titleSlug: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  url: string;
  tags?: string[];
}
현재 URL:

https://leetcode.com/problems/two-sum/
에서 two-sum을 추출한다.

가능하다면 현재 페이지의 상태/DOM에서 메타데이터를 가져오고, 부족한 데이터만 GraphQL로 보완한다.

10. 제출 코드 수집
LeetCode 에디터 DOM을 직접 읽는 방법은 UI 변경에 취약할 수 있다.

따라서 다음 순서로 조사한다.

실제 Submit 요청 payload에 코드가 포함되는지 확인
포함되는 경우 제출 시점의 payload를 통해 코드 확보 가능한 구조 검토
어렵다면 현재 editor 상태를 안전하게 가져오는 방법 조사
Monaco 내부 private API를 직접 하드코딩하는 방식은 마지막 수단으로 사용
Accepted 결과와 실제로 제출된 코드가 반드시 동일해야 한다.

사용자가 Accepted 후 에디터를 수정했을 때 수정된 코드가 잘못 커밋되는 문제를 방지한다.

11. 언어별 확장자 매핑
최소 다음 언어를 지원한다.

const LANGUAGE_EXTENSION_MAP = {
  python3: "py",
  python: "py",
  java: "java",
  cpp: "cpp",
  c: "c",
  csharp: "cs",
  javascript: "js",
  typescript: "ts",
  golang: "go",
  rust: "rs",
  kotlin: "kt",
  swift: "swift",
  ruby: "rb",
  php: "php"
};
실제 LeetCode가 반환하는 language key를 조사해 정확히 매핑한다.

알 수 없는 언어는 .txt로 저장하거나 사용자에게 오류를 알린다.

12. GitHub 저장 구조
기본값:

LeetCode/
├── 0001-two-sum/
│   ├── solution.py
│   └── README.md
├── 0002-add-two-numbers/
│   ├── solution.cpp
│   └── README.md
└── ...
문제 번호는 기본 4자리 zero padding을 사용한다.

예:

1    → 0001
15   → 0015
100  → 0100
1234 → 1234
폴더:

{number}-{titleSlug}
코드 파일:

solution.{extension}
13. README 생성
예:

# 1. Two Sum

- Difficulty: Easy
- Language: Python3
- LeetCode: https://leetcode.com/problems/two-sum/

## Result

- Runtime: 42 ms
- Memory: 18.3 MB
문제 본문 전체를 무단 복제하는 방식은 사용하지 않는다.

README에는 최소한의 메타데이터와 원문 링크만 우선 저장한다.

14. Commit Message
기본 형식:

Solve 0001. Two Sum
재제출 시:

Update 0001. Two Sum
추후 옵션:

[LeetCode] 0001. Two Sum
feat: solve 0001 Two Sum
leetcode: solve 0001 two-sum
15. GitHub API
GitHub REST API의 repository contents endpoint를 사용하여 파일을 생성/업데이트한다.

형태:

PUT /repos/{owner}/{repo}/contents/{path}
신규 파일 생성 시:

{
  "message": "Solve 0001. Two Sum",
  "content": "<BASE64_CONTENT>",
  "branch": "main"
}
기존 파일 업데이트 시 현재 파일 SHA가 필요하므로 먼저 기존 파일 정보를 조회한다.

GET /repos/{owner}/{repo}/contents/{path}
후:

{
  "message": "Update 0001. Two Sum",
  "content": "<BASE64_CONTENT>",
  "sha": "<CURRENT_FILE_SHA>",
  "branch": "main"
}
주의:

코드 파일과 README를 Contents API로 각각 생성하면 commit이 두 개 생길 수 있다.

MVP에서는 단순 구현을 우선할 수 있으나, 최종적으로 하나의 Accepted 이벤트에 대해 하나의 commit 안에 code + README를 함께 포함하는 것이 UX상 더 좋다.

이를 위해 Git Data API(tree/commit/ref)를 사용하는 방안도 검토한다.

16. GitHub 인증
최종 공개 배포 버전에서 사용자가 Personal Access Token을 복사해서 Extension에 붙여넣도록 하는 방식은 가급적 피한다.

권장 UX:

[ Connect GitHub ]
        ↓
GitHub authorization
        ↓
Extension 연결
        ↓
Repository 선택
GitHub OAuth / GitHub App 기반 인증 구조를 검토한다.

단, 브라우저 Extension만으로 OAuth client secret을 안전하게 보관할 수 없다는 점을 고려해야 한다.

필요하면 인증을 위한 최소 백엔드 또는 PKCE 지원 방식을 사용한다.

MVP 개발 단계에서는 테스트용 fine-grained PAT를 개발자가 직접 입력하는 옵션을 임시로 사용할 수 있으나, 토큰을 source code에 하드코딩하지 않는다.

17. 저장해야 하는 설정
chrome.storage 사용.

예:

interface ExtensionSettings {
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  baseDirectory: string;
  autoCommit: boolean;
  createReadme: boolean;
  folderPattern: string;
  commitMessagePattern: string;
}
민감 정보 저장 방식은 별도 검토한다.

18. 중복 커밋 방지
동일 submission을 여러 번 감지할 수 있으므로 중복 방지가 필요하다.

가능한 경우:

submissionId
를 키로 사용한다.

예:

processedSubmissionIds: string[]
submissionId 확보가 불가능하면:

problemId + code hash + submittedAt
등의 조합을 사용한다.

MutationObserver가 여러 번 실행되어 GitHub에 동일 commit이 여러 번 생기지 않도록 반드시 방어한다.

19. 상태 및 오류 처리
사용자에게 최소한 다음 상태를 보여준다.

Watching LeetCode
Submission detected
Accepted
Uploading to GitHub
Committed successfully
Failed to commit
GitHub authentication required
Repository not configured
페이지 내부 toast 또는 Extension badge를 활용할 수 있다.

LeetCode 페이지를 과도하게 변경하지 않는다.

20. 보안 원칙
GitHub token을 코드에 하드코딩하지 않는다.
console.log에 access token을 출력하지 않는다.
필요 이상의 Chrome permission을 요청하지 않는다.
가능하면 https://leetcode.com/*, https://api.github.com/*로 host permission을 제한한다.
remotely hosted JavaScript를 실행하지 않는다.
eval() 사용 금지.
사용자의 풀이 코드를 외부 서버로 전송하지 않는다. GitHub 업로드 외의 제3자 전송 금지.
비밀번호 및 LeetCode session cookie를 읽거나 저장하지 않는다.
21. 프로젝트 디렉터리 권장 구조
leetcode-github-sync/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.json
├── public/
│   └── icons/
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── github.ts
│   │   └── storage.ts
│   │
│   ├── content/
│   │   ├── index.ts
│   │   ├── leetcode.ts
│   │   ├── submission-detector.ts
│   │   └── page-bridge.ts
│   │
│   ├── injected/
│   │   └── leetcode-page.ts
│   │
│   ├── popup/
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   ├── options/
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── language.ts
│
└── README.md
구조는 실제 선택한 bundler/plugin에 맞게 조정해도 된다.

22. MVP 범위
먼저 아래 기능만 완벽히 구현한다.

MVP 1
Manifest V3 Extension 생성
LeetCode 문제 페이지에서 content script 실행 확인
popup 구현
test GitHub token/repository 설정
Two Sum에서 Accepted 감지
문제 번호/제목/언어/코드 확보
GitHub에 solution 파일 업로드
성공/실패 상태 표시
MVP 2
README 생성
기존 문제 업데이트
중복 commit 방지
여러 언어 지원
오류 처리 강화
MVP 3
GitHub OAuth 또는 GitHub App
repository 선택 UI
options page
runtime/memory
안정적인 submission adapter
Chrome Web Store 배포 준비
23. Codex가 처음 해야 할 일
바로 모든 기능을 한번에 구현하지 말고 다음 순서로 작업한다.

Step 1. 현재 프로젝트 초기화
Manifest V3 + TypeScript 기반 Chrome Extension 프로젝트를 생성한다.

React는 popup/options UI에만 사용해도 된다.

Step 2. 최소 Extension 검증
https://leetcode.com/problems/*에서 content script가 정상 실행되는지 확인한다.

콘솔 또는 popup에서 현재 URL/titleSlug를 확인할 수 있도록 한다.

Step 3. LeetCode 제출 흐름 조사
현재 LeetCode 페이지의 실제 DOM과 Network 동작을 조사한다.

다음 항목을 명확히 확인한 뒤 코드를 작성한다.

Submit endpoint
request payload
제출 코드 위치
language 위치
submission ID
결과 polling endpoint 또는 GraphQL request
Accepted를 판별할 필드
runtime/memory 필드
이 부분을 추측해서 구현하지 않는다.

Step 4. Detector abstraction 작성
LeetCode 관련 구현을 다른 코드와 분리한다.

interface LeetCodeAdapter {
  getProblem(): Promise<ProblemInfo>;
  observeSubmissions(
    callback: (submission: SubmissionResult) => void
  ): () => void;
}
Step 5. GitHub 업로드
테스트 설정을 이용해 GitHub repository에 solution 파일 하나를 올려본다.

Step 6. 연결
Accepted 이벤트와 GitHub 업로드를 연결한다.

Step 7. 중복/업데이트 처리
동일 submission 중복 업로드 방지와 기존 파일 업데이트를 구현한다.

Step 8. UI
popup/options 페이지를 구현한다.

Step 9. 인증 개선
MVP가 정상적으로 동작한 뒤 GitHub OAuth/GitHub App 인증으로 변경한다.

24. Codex 작업 규칙
다음 원칙을 반드시 따른다.

현재 LeetCode의 실제 DOM/API를 확인하지 않고 selector/API endpoint를 임의로 상상해서 작성하지 않는다.
selector와 API parsing 코드는 LeetCode adapter 내부에 격리한다.
Manifest V3를 사용한다.
권한은 최소 권한 원칙을 적용한다.
TypeScript strict mode를 사용한다.
모든 주요 데이터 구조에 type을 정의한다.
access token을 소스코드에 넣지 않는다.
에러를 조용히 무시하지 않는다.
duplicate submission 처리 로직을 반드시 넣는다.
LeetCode UI 변화에 대응하기 쉽게 작성한다.
build 후 실제 Chrome에서 Load unpacked 가능한 결과물을 생성한다.
각 단계가 완료될 때마다 직접 검증 가능한 방법을 README에 기록한다.
기존 기능이 동작하는 상태를 유지하면서 다음 단계로 진행한다.
필요 이상으로 복잡한 backend를 먼저 만들지 않는다.
MVP에서는 핵심인 Accepted → GitHub commit 성공을 최우선으로 한다.
25. 완료 조건
다음 시나리오가 성공하면 MVP를 완료한 것으로 본다.

1. Chrome에 Extension 설치
2. GitHub repository 설정
3. LeetCode Two Sum 페이지 이동
4. Python3 코드 작성
5. Submit
6. Accepted
7. Extension이 Accepted 감지
8. 실제 제출 코드를 확보
9. GitHub API 호출
10. 아래 파일 생성

LeetCode/
└── 0001-two-sum/
    ├── solution.py
    └── README.md

11. GitHub commit 확인
12. 같은 submission으로 중복 commit이 생성되지 않음
추가 검증:

JavaScript 풀이도 올바른 .js 파일로 저장
실패한 제출은 commit하지 않음
네트워크 오류 시 사용자에게 실패 상태 표시
Extension reload 후에도 설정 유지
문제를 다시 풀면 기존 파일이 정상적으로 update됨
26. 최종 목표
사용자는 Extension 설치 후 GitHub만 한 번 연결하면 된다.

이후의 UX는:

LeetCode에서 문제 풀이
       ↓
Submit
       ↓
Accepted
       ↓
자동 GitHub 저장
외에는 추가 행동이 필요하지 않아야 한다.

Extension의 핵심 가치는 사용자가 Git/GitHub 작업을 전혀 신경 쓰지 않고 LeetCode 풀이 기록을 자동으로 축적하는 것이다.

27. 참고 문서
구현 시 최신 공식 문서를 기준으로 재확인한다.

Chrome Extensions / Manifest V3
https://developer.chrome.com/docs/extensions/
Chrome Extension API
https://developer.chrome.com/docs/extensions/reference/api/
Chrome Web Store
https://developer.chrome.com/docs/webstore/
GitHub REST API - Repository Contents
https://docs.github.com/en/rest/repos/contents
GitHub Apps / OAuth
https://docs.github.com/en/apps
LeetCode 내부 GraphQL/API는 공식 Public API 계약으로 간주하지 말고 실제 웹사이트 동작을 조사한 뒤 최소 범위로 사용한다.
