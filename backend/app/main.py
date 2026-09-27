import asyncio
import secrets
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .schemas import Goal, LeadInput, ReplyInput, ActionInput, RunInput, Mission, Score, Message, ReplyAnalysis, NextAction
from .graph8 import IntegrationError
from .store import MissionStore
from .agent import Agent

app = FastAPI(title='AI Revenue Autopilot — Intelligence API', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'Authorization'])
store = MissionStore(settings.database_path)
agent = Agent(settings, store)
# Run one worker. SQLite persists state; the lock serializes approval and advance operations.
lock = asyncio.Lock()

async def authorize(authorization: str | None = Header(default=None)):
    if settings.demo_mode:
        return
    if not settings.autopilot_api_token:
        raise HTTPException(503, 'Configure AUTOPILOT_API_TOKEN before enabling live mode.')
    expected = 'Bearer ' + settings.autopilot_api_token
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, 'Enter the local Autopilot access token to use live mode.')

@app.exception_handler(IntegrationError)
async def integration_error(_request, exc):
    return JSONResponse(status_code=exc.status, content={'detail': str(exc)})

@app.get('/ai/config')
async def config():
    return {'demo': settings.demo_mode, 'graph8_url': settings.graph8_app_url}

@app.post('/ai/mission/plan', response_model=Mission, dependencies=[Depends(authorize)])
async def plan(body: Goal):
    return await agent.create(body.goal)

@app.get('/ai/mission/{mission_id}', response_model=Mission, dependencies=[Depends(authorize)])
async def mission(mission_id: str):
    result = store.get(mission_id)
    if result is None:
        raise HTTPException(404, 'Mission not found. Create a new mission.')
    return result

@app.post('/ai/lead/score', response_model=Score, dependencies=[Depends(authorize)])
async def score(body: LeadInput):
    return await agent.ai.score(body.goal, body.lead)

@app.post('/ai/message/personalize', response_model=Message, dependencies=[Depends(authorize)])
async def personalize(body: LeadInput):
    return await agent.ai.personalize(body.goal, body.lead)

@app.post('/ai/reply/classify', response_model=ReplyAnalysis, dependencies=[Depends(authorize)])
async def classify(body: ReplyInput):
    return await agent.ai.classify(body.reply)

@app.post('/ai/next-action', response_model=NextAction, dependencies=[Depends(authorize)])
async def next_action(body: ActionInput):
    return await agent.ai.next_action(body.analysis)

@app.post('/ai/agent/run', response_model=Mission, dependencies=[Depends(authorize)])
async def run(body: RunInput):
    async with lock:
        current = store.get(body.mission_id)
        if not current:
            raise HTTPException(404, 'Mission not found.')
        try:
            result = await agent.run(current, body)
            result.error = None
            store.save(result)
            return result
        except IntegrationError as exc:
            # Keep the previous successful stage. Never fabricate success or auto-retry writes.
            saved = store.get(body.mission_id)
            saved.error = str(exc)
            store.save(saved)
            raise
