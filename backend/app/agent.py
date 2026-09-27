from datetime import datetime, timezone
from uuid import uuid4
from .schemas import Mission, Event, Lead, RunInput
from .graph8 import Graph8Client, IntegrationError
from .intelligence import Intelligence


def now():
    return datetime.now(timezone.utc).isoformat()


def event(mission, agent, title, detail):
    mission.events.append(Event(id=len(mission.events) + 1, time=now(), agent=agent, title=title, detail=detail))

class Agent:
    def __init__(self, config, store):
        self.config = config
        self.store = store
        self.ai = Intelligence(config)
        self.graph = Graph8Client(config)

    async def create(self, goal):
        plan = await self.ai.plan(goal)
        if plan.min_employees > plan.max_employees:
            raise IntegrationError('AI returned an invalid employee range. Please regenerate the plan.')
        mission = Mission(id=str(uuid4()), goal=goal, plan=plan, demo=self.config.demo_mode,
                          graph8_url=self.config.graph8_app_url, created_at=now())
        event(mission, 'Planner', 'Mission plan ready', 'Review the plan, then start your mission.')
        self.store.save(mission)
        return mission

    async def run(self, m: Mission, request: RunInput):
        if m.demo != self.config.demo_mode:
            raise IntegrationError('This mission belongs to a different mode. Create a new mission.', 409)
        if m.action_in_flight and request.command in ('approve', 'outreach'):
            raise IntegrationError('A previous Graph8 action has an unconfirmed outcome. Review it in Graph8 before taking another action.', 409)
        if request.command == 'start':
            if m.status == 'ready':
                m.status = 'running'
                event(m, 'Orchestrator', 'Mission started', 'Your AI agents are ready. Graph8 powers discovery and execution.')
            return m
        if request.command == 'decline':
            if m.status not in ('awaiting_approval', 'awaiting_outreach'):
                raise IntegrationError('There is no pending action to decline.', 409)
            m.status = 'paused'
            event(m, 'You', 'Action declined', 'Mission paused. No external action was taken.')
            return m
        if request.command == 'approve':
            if m.status == 'complete':
                return m  # Idempotent approval.
            if m.status != 'awaiting_approval' or not m.lead or not m.lead.recommendation:
                raise IntegrationError('No meeting is awaiting approval.', 409)
            if m.lead.recommendation.action != 'BOOK_MEETING':
                raise IntegrationError('This recommendation requires review in Graph8.', 409)
            if not m.demo:
                if not request.booking or not m.lead.email:
                    raise IntegrationError('Choose a Graph8 event type and an agreed future UTC time to book this prospect.', 422)
                try:
                    start = datetime.fromisoformat(request.booking.start_time.replace('Z', '+00:00'))
                    if start.tzinfo is None or start <= datetime.now(timezone.utc):
                        raise ValueError()
                except ValueError:
                    raise IntegrationError('Booking time must be a future ISO-8601 timestamp with a timezone.', 422)
                m.action_in_flight = 'booking'
                self.store.save(m)
                result = await self.graph.book(m.lead, request.booking, m.id + ':booking')
                if result['data'].get('status') not in ('accepted', 'pending'):
                    raise IntegrationError('Graph8 did not confirm a booking. Review it in Graph8.')
                m.booking = result['data']
            else:
                m.booking = {'uid': 'demo-booking', 'status': 'accepted', 'simulated': True}
            m.action_in_flight = None
            m.metrics.meetings = 1
            m.progress = 100
            m.status = 'complete'
            event(m, 'Graph8', 'Meeting action completed', 'Simulated booking confirmed. No invitation was sent.' if m.demo else 'Graph8 accepted the booking request. Review its confirmation status in Graph8.')
            return m
        if request.command == 'outreach':
            if m.status != 'awaiting_outreach' or not m.lead:
                raise IntegrationError('No outreach is awaiting approval.', 409)
            if not request.list_id or not m.lead.email or not m.lead.message:
                raise IntegrationError('A Graph8 list ID and a prospect with an email and personalized message are required.', 422)
            await self.graph.validate_personalization(request.list_id)
            contacts = await self.graph.find_contact(m.lead.email)
            if contacts['data']:
                m.lead.contact_id = int(contacts['data'][0]['id'])
            # Durable write intent: ambiguous failures cannot replay external actions.
            m.action_in_flight = 'outreach'
            self.store.save(m)
            if not m.lead.contact_id:
                result = await self.graph.create_contact(m.lead, request.list_id, m.id + ':contact')
                resolved = await self.graph.find_contact(m.lead.email)
                if not resolved['data']:
                    raise IntegrationError('Graph8 accepted contact creation but the record is not yet readable. Inspect it in Graph8 before continuing.')
                m.lead.contact_id = int(resolved['data'][0]['id'])
                self.store.save(m)
            await self.graph.add_to_list(m.lead.contact_id, request.list_id, m.id + ':list')
            await self.graph.write_message(m.lead.contact_id, m.lead.message)
            result = await self.graph.enroll(m.lead.contact_id, request.list_id, m.id + ':enroll')
            affected = result['data'].get('contacts_affected', 0)
            if affected != 1:
                raise IntegrationError('Graph8 did not confirm enrollment. Review the sequence in Graph8.')
            m.action_in_flight = None
            m.metrics.outreach = 1
            m.status = 'waiting_reply'
            m.stage = 4
            m.progress = 65
            event(m, 'Graph8', 'Prospect enrolled', 'AI subject and body saved to Graph8 merge fields. Graph8 owns scheduling and delivery.')
            return m
        if m.status not in ('running', 'waiting_reply'):
            return m
        if m.stage == 0:
            if m.demo:
                m.metrics.found = 128
                m.lead = Lead(company='Lumio', domain='lumio.example', industry='B2B SaaS', employees='180',
                              location='San Francisco, USA', name='Sarah Chen', role='VP of Operations', email='sarah@lumio.example')
            else:
                result = await self.graph.search_companies(m.plan)
                m.candidates = result['data']
                m.metrics.found = len(m.candidates)
                if not m.candidates:
                    m.status = 'complete'
                    m.progress = 100
                    event(m, 'Graph8', 'No matching companies', 'Broaden your goal and try a new mission.')
                    return m
            event(m, 'Graph8', f'{m.metrics.found} prospects found', 'Company discovery complete. Evaluating fit against your mission.')
            m.stage = 1
            m.progress = 22
        elif m.stage == 1:
            if m.demo:
                m.lead.score = await self.ai.score(m.goal, m.lead.model_dump())
                m.metrics.qualified = 34
            else:
                # One candidate per advance call makes qualification progress observable.
                candidate = m.candidates.pop(0)
                evidence = {'company': candidate}
                if candidate.get('domain'):
                    enrichment = await self.graph.enrich_company(candidate['domain'])
                    evidence['enrichment'] = enrichment['data']
                    # Tracked pages are context, not proof this company is a buyer.
                    try:
                        evidence['tracked_pages_not_buyer_intent'] = (await self.graph.intent_pages(candidate['domain']))['data']
                    except IntegrationError:
                        evidence['intent_unavailable'] = True
                scored = await self.ai.score(m.goal, evidence)
                if scored.qualified and scored.score >= 75:
                    m.metrics.qualified += 1
                    if not m.lead or scored.score > m.lead.score.score:
                        m.lead = Lead(company=candidate.get('name') or 'Unknown company', domain=candidate.get('domain') or '',
                                      industry=candidate.get('industry') or '', employees=str(candidate.get('employee_count') or 'Unknown'),
                                      location=candidate.get('country') or '', score=scored, evidence=evidence)
                event(m, 'Qualifier', 'Company evaluated', f"{candidate.get('name', 'Company')}: {scored.score}/100. {len(m.candidates)} remaining.")
                if m.candidates:
                    m.progress = 22 + int(20 * (1 - len(m.candidates) / max(1, m.metrics.found)))
                    return m
                if not m.lead:
                    m.status, m.progress = 'complete', 100
                    event(m, 'Qualifier', 'No qualified prospects', 'No company met the qualification threshold. Refine the mission criteria.')
                    return m
                contacts = await self.graph.search_contacts(m.lead.domain)
                if contacts['data']:
                    c = contacts['data'][0]
                    m.lead.name = ' '.join(filter(None, [c.get('first_name'), c.get('last_name')])) or 'Decision maker'
                    m.lead.role = c.get('job_title') or ''
                    m.lead.email = c.get('work_email') or ''
                    # Never mistake an index document ID for a canonical CRM ID.
                    m.lead.contact_id = c.get('mashup_contact_id')
            event(m, 'Qualifier', f'{m.metrics.qualified} companies qualified', f'Top opportunity: {m.lead.company}, scored {m.lead.score.score}/100.')
            m.stage, m.progress = 2, 44
        elif m.stage == 2:
            m.lead.message = await self.ai.personalize(m.goal, m.lead.model_dump())
            event(m, 'Personalizer', 'A personal introduction, ready', f'Message crafted for {m.lead.name} at {m.lead.company}.')
            m.stage, m.progress = 3, 55
        elif m.stage == 3:
            if not m.demo:
                m.status = 'awaiting_outreach'
                event(m, 'Orchestrator', 'Review outreach in Graph8', 'Approve this personalized message. Graph8 will save the contact, populate sequence merge fields, and enroll the prospect.')
                return m
            m.metrics.outreach = 34
            event(m, 'Graph8', 'Personalized outreach initiated', 'Demo: 34 qualified prospects entered the simulated outreach sequence.')
            m.stage, m.progress = 4, 68
        elif m.stage == 4:
            if m.demo:
                m.lead.reply = "I'd like to see a demo"
            else:
                if not m.lead.email:
                    raise IntegrationError('A verified prospect email is required to match replies.', 409)
                result = await self.graph.replies()
                messages = [msg for thread in result['data'] for msg in thread.get('messages', [])
                            if msg.get('responder') == 'OTHER' and not msg.get('is_draft')
                            and msg.get('from_address', '').lower() == m.lead.email.lower()
                            and msg.get('date', '') >= m.created_at]
                if not messages:
                    m.status = 'waiting_reply'
                    return m
                m.lead.reply = sorted(messages, key=lambda x: x.get('date', ''))[-1].get('content', '')
            m.lead.analysis = await self.ai.classify(m.lead.reply)
            m.metrics.interested = int(m.lead.analysis.classification == 'INTERESTED')
            event(m, 'Reply analyst', f'Reply understood: {m.lead.analysis.classification}', m.lead.analysis.explanation)
            m.stage, m.progress, m.status = 5, 82, 'running'
        elif m.stage == 5:
            m.lead.recommendation = await self.ai.next_action(m.lead.analysis)
            m.status, m.progress = 'awaiting_approval', 90
            event(m, 'Strategist', 'Your approval is needed', m.lead.recommendation.reason)
        return m
