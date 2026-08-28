# Roommate V2 risk configuration

The Engagement service evaluates the frozen seven Roommate V2 risk flags on read. The defaults below are deliberately bounded technical thresholds; they do not constitute a trust score or automatic enforcement policy.

| Configuration | Default | Meaning |
| --- | ---: | --- |
| `ROOMMATE_RISK_REPEATED_MESSAGE_WINDOW_MS` | `86400000` | 24-hour repeated-message window |
| `ROOMMATE_RISK_REPEATED_MESSAGE_COUNTERPART_THRESHOLD` | `3` | Distinct counterparts receiving the same normalized message |
| `ROOMMATE_RISK_RAPID_INTEREST_WINDOW_MS` | `3600000` | 1-hour interest window |
| `ROOMMATE_RISK_RAPID_INTEREST_COUNT_THRESHOLD` | `8` | Interests created by the subject in the window |
| `ROOMMATE_RISK_HIGH_MESSAGE_WINDOW_MS` | `86400000` | 24-hour message-volume window |
| `ROOMMATE_RISK_HIGH_MESSAGE_COUNT_THRESHOLD` | `20` | Messages sent in the window |
| `ROOMMATE_RISK_HIGH_MESSAGE_THREAD_THRESHOLD` | `5` | Distinct interest threads represented by those messages |
| `ROOMMATE_RISK_SOLICITATION_WINDOW_MS` | `86400000` | 24-hour external-contact solicitation window |
| `ROOMMATE_RISK_SOLICITATION_COUNTERPART_THRESHOLD` | `2` | Distinct counterparts receiving a matched solicitation |
| `ROOMMATE_RISK_SOLICITATION_PATTERN_VERSION` | `V1` | Deterministic URL, phone/account, payment, and OTP pattern set |
| `ROOMMATE_RISK_REPORT_WINDOW_MS` | `604800000` | 7-day active-report window |
| `ROOMMATE_RISK_REPORT_COUNT_THRESHOLD` | `3` | Active Roommate reports targeting the subject |
| `ROOMMATE_RISK_REPORTER_COUNT_THRESHOLD` | `2` | Distinct reporters in that window |
| `ROOMMATE_RISK_CURRENT_BLOCK_WINDOW_MS` | `2592000000` | 30-day current-block creation window |
| `ROOMMATE_RISK_CURRENT_BLOCKER_THRESHOLD` | `3` | Distinct current blockers targeting the subject |
| `ROOMMATE_RISK_NEW_ACCOUNT_WINDOW_MS` | `604800000` | 7-day account-age window |
| `ROOMMATE_RISK_ACTIVITY_ROW_LIMIT` | `2000` | Maximum rows read per subject/activity family |
| `ROOMMATE_RISK_REPORT_BATCH_SIZE` | `100` | Maximum admin-report rows read per queue batch |

The rules version exposed in admin summaries is `ROOMMATE_RISK_V2_1`. Changing rule meaning, defaults, or the solicitation pattern set requires a new rules version and regression tests. Risk data is never persisted and never triggers account, request, interest, message, block, report, or moderation actions.
