# Graph8 integration contract

Verified against the official Graph8 documentation on 2026-09-26. Base URL: `https://be.graph8.com/api/v1`. Server requests authenticate with `Authorization: Bearer GRAPH8_API_KEY`. Do not expose that key to React.

| Purpose                                   | Official API                                      | Source                                                                        |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Company / prospect discovery              | `POST /search/companies`, `POST /search/contacts` | [Search](https://docs.graph8.com/developers/search/)                          |
| Company enrichment                        | `POST /enrichment/lookup/company`                 | [Enrichment](https://docs.graph8.com/developers/enrichment/)                  |
| Tracked page context                      | `POST /intent/pages-by-domain`                    | [Intent](https://docs.graph8.com/developers/intent-signals/)                  |
| Resolve / create a revenue contact        | `GET /contacts?email=…`, `POST /contacts`         | [Contacts](https://docs.graph8.com/developers/contacts/)                      |
| Link to an existing list                  | `POST /lists/{list_id}/contacts`                  | [Lists](https://docs.graph8.com/developers/lists/)                            |
| Discover / populate custom message fields | `GET /fields`, `PATCH /fields/{column_id}/values` | [Fields](https://docs.graph8.com/developers/fields/)                          |
| Verify existing sequence content          | `GET /sequences/{id}/preview`                     | [Sequence lifecycle](https://docs.graph8.com/developers/sequences-lifecycle/) |
| Enroll an approved prospect               | `POST /sequences/{id}/contacts`                   | [Sequences](https://docs.graph8.com/developers/sequences/)                    |
| Observe real replies                      | `GET /inbox?channel=email&sequence_id=…`          | [Inbox](https://docs.graph8.com/developers/inbox/)                            |
| Read meetings                             | `GET /inbox/meetings?participant_email=…`         | [Meetings](https://docs.graph8.com/developers/meetings/)                      |
| Execute an approved booking               | `POST /appointments/bookings`                     | [Appointments](https://docs.graph8.com/developers/appointments/)              |

The client retains Graph8's `data` envelope and checks for errors. Search filters use documented fields and operators. The goal is translated into description, country, and employee-count criteria. The live search only evaluates returned records; it never reports total index matches as processed prospects. Tracked pages are contextual evidence, **not proof of a company's buying intent**. Unavailable intent data is explicitly marked as missing.

## Configure an existing sequence once, inside Graph8

1. Create two contact text fields in Graph8 for the AI subject and body. Read their numeric IDs and exact `name` slugs from the official fields endpoint. Field names may be generated; do not assume their slugs from the display titles.
2. Create a dedicated sequence with one EMAIL / MANUAL_TEMPLATE step. Set its subject to `{{actual_subject_field_slug}}` and its body to `{{actual_body_field_slug}}`. No other copy or steps should be included.
3. Configure its mailbox, delivery schedule, suppression settings, and stop-on-reply behavior in Graph8, then make it live.
4. Set the sequence ID and both field IDs in `.env`. Restart the AI backend.
5. During a live mission, review the generated message, enter an existing Graph8 list ID, and approve enrollment. The app validates the sequence and fields before any mutation.

On approval the orchestrator resolves the exact email against your Graph8 contacts. If none exists, it creates a contact using the official API. It adds the contact to the chosen Graph8 list, writes the two personalized field values, and enrolls that one contact. Delivery remains Graph8's responsibility. Existing contacts are not overwritten; only the configured message fields and list membership are updated.

If any write fails, inspect the action in Graph8. Durable write intent intentionally prevents blindly retrying a possibly completed write. Create-contact conflicts also require review rather than overwriting another record.

## Meeting approval

Use a real existing Graph8 event type and a time agreed with the prospect. The backend submits `event_type_id`, UTC `start_time`, and an attendee with `name`, `email`, and `time_zone`. It surfaces conflicts and subscription failures. A `pending` booking is a created request, not confirmed attendance; inspect it in Graph8.

## Operational limits

This is a single-workspace, single-worker hackathon app. Inbox polling reads the newest page of 100 threads for the configured sequence. For high-volume production use, replace this with Graph8 webhooks or cursor-based ingestion and durable workers; add authenticated users, retention policies, rate limiting, and an action-reconciliation UI. Those are infrastructure concerns, not a reason to duplicate Graph8's CRM.

OpenAI implementation follows [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) using `AsyncOpenAI.responses.parse` and Pydantic output schemas. Graph8 data is never used as system instructions.
