import asyncio
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from backend.app.config import Settings
from backend.app.agent import Agent
from backend.app.graph8 import Graph8Client, IntegrationError
from backend.app.intelligence import Intelligence
from backend.app.schemas import RunInput, ReplyAnalysis
from backend.app.store import MissionStore
from backend.app import main

@pytest.fixture
def client(tmp_path, monkeypatch):
    config = Settings(demo_mode=True, database_path=str(tmp_path / 'test.db'), _env_file=None)
    store = MissionStore(config.database_path)
    monkeypatch.setattr(main, 'settings', config)
    monkeypatch.setattr(main, 'store', store)
    monkeypatch.setattr(main, 'agent', Agent(config, store))
    monkeypatch.setattr(main, 'lock', asyncio.Lock())
    with TestClient(main.app) as test:
        yield test

GOAL = 'Find 50 SaaS companies in the USA with 50–500 employees for AI automation.'

def plan(client):
    response = client.post('/ai/mission/plan', json={'goal': GOAL})
    assert response.status_code == 200
    return response.json()

def advance(client, mission, command='advance', **extra):
    return client.post('/ai/agent/run', json={'mission_id': mission['id'], 'command': command, **extra})

def test_demo_end_to_end_and_approval_idempotency(client, monkeypatch):
    async def never_network(*args, **kwargs):
        raise AssertionError('Demo must not call Graph8')
    monkeypatch.setattr(Graph8Client, 'request', never_network)
    m = plan(client)
    assert m['status'] == 'ready'
    assert 'candidates' not in m
    assert advance(client, m, 'approve').status_code == 409
    m = advance(client, m, 'start').json()
    for _ in range(6):
        response = advance(client, m)
        assert response.status_code == 200, response.text
        m = response.json()
    assert m['status'] == 'awaiting_approval'
    assert m['metrics'] == {'found':128,'qualified':34,'outreach':34,'interested':1,'meetings':0}
    assert m['lead']['score']['score'] == 92
    assert m['lead']['reply'] == "I'd like to see a demo"
    assert m['lead']['analysis']['classification'] == 'INTERESTED'
    assert m['lead']['recommendation']['action'] == 'BOOK_MEETING'
    assert advance(client, m).json()['metrics']['meetings'] == 0
    completed = advance(client, m, 'approve').json()
    assert completed['status'] == 'complete'
    assert completed['metrics']['meetings'] == 1
    assert advance(client, m, 'approve').json() == completed
    assert client.get('/ai/mission/' + m['id']).json() == completed

def test_decline_does_not_book(client):
    m = plan(client)
    advance(client, m, 'start')
    for _ in range(6):
        m = advance(client, m).json()
    m = advance(client, m, 'decline').json()
    assert m['status'] == 'paused'
    assert m['metrics']['meetings'] == 0
    assert advance(client, m, 'approve').status_code == 409

@pytest.mark.parametrize('text,label,action',[
    ('Unsubscribe me, even though the demo sounds interesting','UNSUBSCRIBE','STOP_OUTREACH'),
    ('Not interested in a demo','NOT_INTERESTED','STOP_OUTREACH'),
    ('I am out of office','OUT_OF_OFFICE','WAIT'),
    ('How does pricing work?','QUESTION','ANSWER_QUESTION'),
    ('Maybe someday','UNKNOWN','HUMAN_REVIEW'),
])
def test_reply_safety(client,text,label,action):
    analysis=client.post('/ai/reply/classify',json={'reply':text}).json()
    assert analysis['classification']==label
    result=client.post('/ai/next-action',json={'analysis':analysis}).json()
    assert result['action']==action
    assert result['requires_approval'] is True

def test_validation_and_no_crm_routes(client):
    assert client.post('/ai/mission/plan',json={'goal':' '*30}).status_code==422
    assert client.get('/ai/mission/missing').status_code==404
    paths=client.get('/openapi.json').json()['paths']
    assert all(path.startswith('/ai/') for path in paths)
    assert client.get('/contacts').status_code==404

@pytest.mark.asyncio
async def test_graph8_documented_contract_and_redacted_error():
    captured=[]
    def handler(request):
        captured.append(request)
        return httpx.Response(201,json={'data':{'uid':'booking-1','status':'accepted'}})
    config=Settings(demo_mode=False,graph8_api_key='test-secret',graph8_sequence_id='seq-test',_env_file=None)
    client=Graph8Client(config,transport=httpx.MockTransport(handler))
    await client.enroll(101,55,'test-action')
    assert captured[0].url.path=='/api/v1/sequences/seq-test/contacts'
    assert json.loads(captured[0].content)=={'contact_ids':[101],'list_id':55}
    assert captured[0].headers['Authorization']=='Bearer test-secret'
    assert captured[0].headers['Idempotency-Key']=='test-action'
    def failure(request):
        return httpx.Response(401,json={'detail':'sensitive-provider-body'})
    client.transport=httpx.MockTransport(failure)
    with pytest.raises(IntegrationError) as exc:
        await client.contact(1)
    assert 'sensitive' not in str(exc.value)
    assert 'test-secret' not in str(exc.value)

@pytest.mark.asyncio
async def test_live_configuration_fails_closed():
    ai=Intelligence(Settings(demo_mode=False,openai_api_key='',_env_file=None))
    with pytest.raises(IntegrationError,match='OPENAI_API_KEY'):
        await ai.plan(GOAL)
    action=await ai.next_action(ReplyAnalysis(classification='INTERESTED',confidence=.5,explanation='Ambiguous'))
    assert action.action=='HUMAN_REVIEW'

def test_live_auth_required(client,monkeypatch):
    monkeypatch.setattr(main.settings,'demo_mode',False)
    monkeypatch.setattr(main.settings,'autopilot_api_token','local-token')
    assert client.post('/ai/mission/plan',json={'goal':GOAL}).status_code==401
    assert client.get('/ai/config').json()['demo'] is False

@pytest.mark.asyncio
async def test_live_workflow_uses_graph8_for_personalized_outreach_and_booking(tmp_path):
    config=Settings(demo_mode=False,graph8_api_key='test-key',graph8_sequence_id='seq-test',
                    graph8_subject_field_id=11,graph8_body_field_id=12,_env_file=None)
    store=MissionStore(str(tmp_path/'live.db'))
    agent=Agent(config,store)
    # Stub AI at its boundary; Graph8 adapter still makes and validates actual HTTP request shapes.
    agent.ai=Intelligence(Settings(demo_mode=True,_env_file=None))
    calls=[]
    created=False
    from datetime import datetime, timezone, timedelta
    def handler(request):
        nonlocal created
        path=request.url.path.removeprefix('/api/v1')
        data=json.loads(request.content) if request.content else None
        calls.append((request.method,path,data))
        if path=='/search/companies':
            payload=[{'name':'Lumio','domain':'lumio.example','industry':'SaaS','employee_count':180,'country':'United States'}]
        elif path=='/enrichment/lookup/company':
            payload={'found':True,'data':{'name':'Lumio','employee_count':180}}
        elif path=='/intent/pages-by-domain':
            payload={'pages':[]}
        elif path=='/search/contacts':
            payload=[{'first_name':'Sarah','last_name':'Chen','work_email':'sarah@lumio.example','job_title':'VP Operations'}]
        elif path=='/fields':
            payload=[{'id':11,'name':'ai_subject'},{'id':12,'name':'ai_body'}]
        elif path=='/sequences/seq-test/preview':
            payload={'steps':[{'step_type':'EMAIL','input_type':'MANUAL_TEMPLATE',
                              'step_data':{'subject':'{{ai_subject}}','body':'{{ai_body}}'}}]}
        elif path=='/sequences/seq-test':
            payload={'status':'live','finish_on_reply':True}
        elif path=='/contacts' and request.method=='GET':
            payload=[{'id':101,'work_email':'sarah@lumio.example'}] if created else []
        elif path=='/contacts':
            created=True
            payload={'status':'ok','count':1,'validation_errors':[]}
        elif path=='/lists/55/contacts':
            payload={'added':1}
        elif path.startswith('/fields/'):
            payload={'updated':True}
        elif path=='/sequences/seq-test/contacts':
            payload={'contacts_affected':1}
        elif path=='/inbox':
            payload=[{'messages':[{'responder':'OTHER','from_address':'sarah@lumio.example',
                                  'date':datetime.now(timezone.utc).isoformat(),'content':"I'd like to see a demo"}]}]
        elif path=='/appointments/bookings':
            assert data['attendees'][0]['email']=='sarah@lumio.example'
            payload={'uid':'live-booking','status':'accepted'}
        else:
            raise AssertionError(path)
        return httpx.Response(200,json={'data':payload})
    agent.graph=Graph8Client(config,httpx.MockTransport(handler))
    m=await agent.create(GOAL)
    async def run(command='advance',**extra):
        nonlocal m
        m=await agent.run(m,RunInput(mission_id=m.id,command=command,**extra))
        store.save(m)
        return m
    await run('start')
    for _ in range(4):
        await run()
    assert m.status=='awaiting_outreach'
    assert m.metrics.found==1 and m.metrics.outreach==0
    assert not any(method in ('PATCH','POST') and path.startswith('/sequences') for method,path,_ in calls)
    await run('outreach',list_id=55)
    writes=[body for method,path,body in calls if method=='PATCH' and path.startswith('/fields/')]
    assert writes[0]['value']==m.lead.message.subject
    assert writes[1]['value']==m.lead.message.body
    assert m.status=='waiting_reply'
    await run()
    await run()
    assert m.status=='awaiting_approval'
    await run('approve',booking={'event_type_id':42,'start_time':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()})
    assert m.status=='complete'
    assert m.metrics.meetings==1
    assert m.action_in_flight is None
    await run('approve')
    assert len([p for method,p,_ in calls if p=='/appointments/bookings'])==1

@pytest.mark.asyncio
async def test_uncertain_booking_is_not_replayed_after_restart(tmp_path):
    config=Settings(demo_mode=True,_env_file=None)
    store=MissionStore(str(tmp_path/'uncertain.db'))
    agent=Agent(config,store)
    m=await agent.create(GOAL)
    await agent.run(m,RunInput(mission_id=m.id,command='start'))
    for _ in range(6):
        await agent.run(m,RunInput(mission_id=m.id))
    config.demo_mode=False
    m.demo=False
    store.save(m)
    attempts=0
    async def timeout(*args,**kwargs):
        nonlocal attempts
        attempts+=1
        raise IntegrationError('Graph8 request timed out')
    agent.graph.book=timeout
    from datetime import datetime,timezone,timedelta
    request=RunInput(mission_id=m.id,command='approve',booking={'event_type_id':42,'start_time':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()})
    with pytest.raises(IntegrationError):
        await agent.run(m,request)
    restored=store.get(m.id)
    assert restored.action_in_flight=='booking'
    with pytest.raises(IntegrationError,match='unconfirmed outcome'):
        await agent.run(restored,request)
    assert attempts==1
    assert restored.metrics.meetings==0
