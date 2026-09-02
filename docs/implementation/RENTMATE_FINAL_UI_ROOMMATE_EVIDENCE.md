# RentMate — FINAL UI Roommate Evidence

Ngày kiểm tra: 2026-09-02

Phạm vi: post-MVP frontend redesign theo FINALIZATION-04B-3.

## Phạm vi và contract guard

- Redesign chỉ nằm ở Next.js App Router presentation layer: Roommate discovery, profile, request workspace/detail, interests, current connection, conversation, blocked list, verification, AI preference preview, shared Roommate shell và một chỉnh sửa responsive nhỏ cho notification badge của global header.
- Không thay đổi backend, Gateway, API client contract, database, migration, auth, privacy, authorization, lifecycle hay AI semantics.
- Giữ nguyên các route hiện có: `/roommates`, `/roommates/my-request`, `/roommates/interests`, `/roommates/connection`, `/roommates/profile`, `/roommates/blocks`, `/roommates/requests/[requestId]`, `/roommates/conversations/[interestId]`.

## Surface evidence

- Discovery tách rõ `Khám phá thông thường` và `Gợi ý bằng AI`; card dùng identity, verification facts, linked/unlinked context, area/budget/move-in, tối đa ba qualitative highlights và CTA hiện có.
- Profile/request form được chia thành nhóm thông tin có thật (`Về bạn`, `Nhịp sống`, `Môi trường sống`, `Khu vực`, `Ngân sách`, `Thời gian chuyển vào`, `Xem lại`), vẫn save/create/update explicit và không autosave.
- Compatibility giữ đúng tám dimensions và qualitative outcomes; không thêm numeric score, gauge, trust meter hay dating semantics.
- Interests/connection giữ nguyên incoming/outgoing, pending/accepted/withdraw/leave, report/block và privacy copy; accepted connection được trình bày khác pending interest.
- Conversation chuyển thành inbox/chat layout responsive với context rail, main thread và safety rail; chỉ message mới được animate qua ID tracking, polling không replay animation.
- Safety giữ nguyên CAUTION/HIGH_CAUTION, warning inline/banner, exact OTP copy và report/block/leave confirmation qua shared dialog.
- AI preference preview và on-demand explanation có trạng thái loading/error/unavailable/fallback riêng; không auto-apply, không fake progress và không làm mất ordinary discovery khi AI unavailable.

## Motion, responsive và accessibility

- Dùng motion nhỏ, functional; chat entrance 190ms và `prefers-reduced-motion` tắt transition/animation.
- Mobile dùng master/detail và horizontal subnav có thể scroll; layout đã kiểm tra ở 375, 768, 1024 và 1440px.
- Controls tiếp tục dùng shared button/dialog primitives và touch target tối thiểu theo shell hiện có.
- Avatar là initials/abstract UI, không thêm stock portrait hoặc dữ liệu demographic/protected mới.

## Runtime visual QA

- In-app Browser không khả dụng trong môi trường (`agent.browsers.list()` trả về rỗng), nên dùng Chromium qua Playwright fallback.
- Chạy frontend tại `http://localhost:3000` qua Gateway hiện có `http://localhost:4001`, dùng seeded demo accounts và synthetic response fixture chỉ để render HIGH_CAUTION cho message OTP; không gọi Gemini lặp lại trong final matrix.
- Final matrix tạo 28 captures cho bảy route Roommate ở bốn viewport: discovery, request detail, profile, request workspace, interests, connection và conversation. Artifact nằm trong thư mục ignored `frontend/test-results/ui-audit/roommate/`.
- Kết quả cuối: `captures: 28`, `horizontalOverflow: []`, không có server response 5xx và không có page console exception. Các request `ERR_ABORTED` là effect cleanup khi chuyển route/viewport; `/roommates/my-request` có nhánh API 404 hợp lệ cho current-connection chưa tồn tại và UI xử lý về trạng thái workspace bình thường.
- Audit phát hiện notification badge global header tràn 4px; đã chỉnh vị trí badge vào trong nút để toàn bộ matrix không còn horizontal overflow.
- AI recommendation fallback đã được capture riêng và vẫn giữ ordinary discovery khả dụng khi provider unavailable.

## Automated checks

| Command | Result |
|---|---|
| `npm.cmd --prefix frontend test -- --reporter=dot` | PASS — 116 test files, 719 tests |
| `npm.cmd --prefix frontend run typecheck` | PASS |
| `npm.cmd --prefix frontend run lint` | PASS — zero warnings |
| `npm.cmd --prefix frontend run build` | PASS — Next.js production build |
| `git diff --check` | PASS — chỉ có cảnh báo line-ending của Git |
| `npm.cmd --prefix frontend run format:check` | BLOCKED by 6 pre-existing `features/listings/*` formatting warnings; không nằm trong phạm vi thay đổi |

## Visual debt / limitations

- Local safety provider gate đang ở trạng thái disabled, nên warning screenshot dùng synthetic API fixture; policy copy và rendering vẫn đi qua component/test contract hiện có.
- Admin Roommate report queue giữ CSS module hiện tại; exact-message AI summary và moderation data flow không bị thay đổi trong redesign tenant-facing này.
- Một số request 401/abort/404 của các shell hoặc empty-state API hiện có được giữ nguyên theo contract; không dùng frontend để che giấu hay thay đổi backend behavior.
