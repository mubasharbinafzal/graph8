"""Server-only adapter. Paths verified against docs.graph8.com/developers.
No API credentials or generic Graph8 proxy are exposed to the browser.
"""
from urllib.parse import quote, urlparse
import httpx
from .config import Settings

class IntegrationError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status

class Graph8Client:
    def __init__(self, config: Settings, transport=None):
        self.config = config
        self.transport = transport

    async def request(self, method: str, path: str, *, body=None, params=None, key=None):
        if not self.config.graph8_api_key:
            raise IntegrationError('Set GRAPH8_API_KEY to use live Graph8 data.', 503)
        if urlparse(self.config.graph8_base_url).scheme != 'https':
            raise IntegrationError('GRAPH8_BASE_URL must use HTTPS.', 503)
        headers = {'Authorization': f'Bearer {self.config.graph8_api_key}'}
        if key:
            headers['Idempotency-Key'] = key
        try:
            async with httpx.AsyncClient(timeout=30, transport=self.transport) as client:
                response = await client.request(method, self.config.graph8_base_url.rstrip('/') + path,
                                                headers=headers, json=body, params=params)
            if response.status_code >= 400:
                descriptions = {401: 'Graph8 rejected the API key.', 403: 'Graph8 key lacks permission.',
                                402: 'Graph8 requires credits or an active subscription.',
                                409: 'Graph8 reported a conflict. Check the booking slot or existing action.',
                                429: 'Graph8 rate limit reached. Wait before retrying.'}
                raise IntegrationError(descriptions.get(response.status_code, f'Graph8 request failed ({response.status_code}).'))
            payload = response.json()
            if not isinstance(payload, dict) or 'data' not in payload:
                raise IntegrationError('Graph8 returned an unexpected response envelope.')
            return payload
        except (httpx.HTTPError, ValueError) as exc:
            raise IntegrationError('Graph8 is unavailable or returned invalid JSON. No success was recorded.') from exc

    async def search_companies(self, plan):
        return await self.request('POST', '/search/companies', body={'filters': [
            {'field': 'description', 'operator': 'contains', 'value': [plan.industry]},
            {'field': 'country', 'operator': 'any_of', 'value': [plan.country]},
            {'field': 'employee_count', 'operator': 'between', 'value': [plan.min_employees, plan.max_employees]},
        ], 'page': 1, 'limit': plan.target})

    async def search_contacts(self, domain):
        return await self.request('POST', '/search/contacts', body={'filters': [
            {'field': 'company_domain', 'operator': 'any_of', 'value': [domain]},
            {'field': 'job_title', 'operator': 'any_of', 'value': ['CEO', 'CTO', 'VP Operations']},
        ], 'page': 1, 'limit': 5})

    async def enrich_company(self, domain):
        return await self.request('POST', '/enrichment/lookup/company', body={'domain': domain})

    async def contact(self, contact_id):
        return await self.request('GET', f'/contacts/{int(contact_id)}')

    async def intent_pages(self, domain):
        return await self.request('POST', '/intent/pages-by-domain', body={'domain': domain, 'limit': 5})

    async def meetings(self, email):
        return await self.request('GET', '/inbox/meetings', params={'participant_email': email, 'timeframe': 'all'})

    async def find_contact(self, email):
        return await self.request('GET', '/contacts', params={'email': email, 'limit': 1})

    async def create_contact(self, lead, list_id, key):
        parts = lead.name.split(' ', 1)
        return await self.request('POST', '/contacts', body={
            'first_name': parts[0], 'last_name': parts[1] if len(parts) > 1 else '',
            'work_email': lead.email, 'company_domain': lead.domain, 'job_title': lead.role, 'list_id': list_id,
        }, key=key)

    async def add_to_list(self, contact_id, list_id, key):
        return await self.request('POST', f'/lists/{int(list_id)}/contacts', body={'contact_ids': [contact_id]}, key=key)

    async def validate_personalization(self, list_id):
        if not self.config.graph8_sequence_id or not self.config.graph8_subject_field_id or not self.config.graph8_body_field_id:
            raise IntegrationError('Configure a live Graph8 sequence and GRAPH8_SUBJECT_FIELD_ID / GRAPH8_BODY_FIELD_ID for its message merge fields.', 503)
        if self.config.graph8_subject_field_id == self.config.graph8_body_field_id:
            raise IntegrationError('Subject and body must use two different Graph8 fields.', 422)
        fields = (await self.request('GET', '/fields', params={'list_id': list_id}))['data']
        names = {row['id']: row['name'] for row in fields}
        subject = names.get(self.config.graph8_subject_field_id)
        body = names.get(self.config.graph8_body_field_id)
        if not subject or not body:
            raise IntegrationError('Configured Graph8 message fields were not found in this list.', 422)
        seq = quote(self.config.graph8_sequence_id, safe='')
        preview = (await self.request('GET', f'/sequences/{seq}/preview'))['data']
        sequence = (await self.request('GET', f'/sequences/{seq}'))['data']
        if sequence.get('status') != 'live' or not sequence.get('finish_on_reply'):
            raise IntegrationError('The Graph8 sequence must be live and stop on reply.', 422)
        steps = preview.get('steps', [])
        # A single approved email prevents unrelated follow-ups or channels from being enrolled implicitly.
        if len(steps) != 1 or steps[0].get('step_type', '').upper() != 'EMAIL':
            raise IntegrationError('Use a dedicated Graph8 sequence with one EMAIL step for this mission.', 422)
        if steps[0].get('input_type') != 'MANUAL_TEMPLATE':
            raise IntegrationError('The Graph8 email step must use MANUAL_TEMPLATE so your approved copy is preserved.', 422)
        content = steps[0].get('step_data', {})
        if content.get('email_type', 'plain') != 'plain':
            raise IntegrationError('Configure the Graph8 step as plain text for this personalized message.', 422)
        compact = lambda text: ''.join(text.split())
        if compact(content.get('subject', '')) != '{{' + subject + '}}' or compact(content.get('body', '')) != '{{' + body + '}}':
            raise IntegrationError('Graph8 sequence subject/body must use the configured field merge tokens exactly.', 422)

    async def write_message(self, contact_id, message):
        for field, value in [(self.config.graph8_subject_field_id, message.subject), (self.config.graph8_body_field_id, message.body)]:
            await self.request('PATCH', f'/fields/{field}/values', body={'record_id': contact_id, 'value': value, 'entity': 'contacts'})

    async def enroll(self, contact_id, list_id, key):
        seq = quote(self.config.graph8_sequence_id, safe='')
        if not seq:
            raise IntegrationError('Configure GRAPH8_SEQUENCE_ID with an existing live sequence.', 503)
        return await self.request('POST', f'/sequences/{seq}/contacts',
                                  body={'contact_ids': [contact_id], 'list_id': list_id}, key=key)

    async def replies(self):
        return await self.request('GET', '/inbox', params={
            'channel': 'email', 'sequence_id': self.config.graph8_sequence_id, 'page_size': 100})

    async def book(self, lead, booking, key):
        return await self.request('POST', '/appointments/bookings', body={
            'event_type_id': booking.event_type_id, 'start_time': booking.start_time,
            'attendees': [{'name': lead.name, 'email': lead.email, 'time_zone': booking.time_zone}],
        }, key=key)
